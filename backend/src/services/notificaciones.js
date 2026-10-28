// Event notifications (WF-19, Phase 4; mapping approved 2026-10-27).
//
//   Event                                   Recipients
//   Student application validated/rejected  student
//   Company application validated/rejected  company coordinator
//   Document rejected                       whoever uploads it again (student
//                                           or company coordinator)
//   Reservation created                     student; also the company when the
//                                           centre made it (staff, reassignment)
//   Reservation cancelled                   student; also the company when the
//                                           centre cancelled it or a confirmation
//                                           cancelled it
//   Reservation confirmed                   student and company
//
// Rules:
// - Call only AFTER the transaction committed. Callers do not await: a
//   delivery problem is logged and never changes the API response.
// - Each function re-reads what it needs, so a stale or rolled-back caller
//   value can never be sent.
// - Emails carry names, the ciclo and the convocatoria, never DNI/NIE, phone
//   numbers or the free-text cancellation reason (SEC-11). Rejection reasons
//   are sent to the party who must correct something.
// - Delivery mode (log / smtp) is decided in mail/config.js.
const pool = require('../db/pool');
const { defByClave } = require('./documentCatalogue');

let transporter = null;
try {
  transporter = require('../mail/config').transporter;
} catch {
  /* mail not configured */
}

const FIRMA = 'Salesianos Zaragoza — Departamento FP Dual';
const PORTAL = (process.env.APP_URL || '').replace(/\/$/, '');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tagged template: every interpolated value is HTML-escaped (SEC-10).
function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? escapeHtml(values[i]) : ''), '');
}

function layout(saludo, parrafos) {
  const acceso = PORTAL
    ? `<p>Puedes consultarlo en el portal: <a href="${escapeHtml(PORTAL)}/login">${escapeHtml(PORTAL)}</a>.</p>`
    : '<p>Puedes consultarlo iniciando sesión en el portal FP Dual.</p>';
  return `<p>${saludo}</p>${parrafos.map((p) => `<p>${p}</p>`).join('')}${acceso}<p>${FIRMA}</p>`;
}

async function enviar(evento, to, subject, body) {
  if (!to) {
    console.warn(`[notificación] ${evento}: sin dirección de correo, no se envía.`);
    return false;
  }
  if (!transporter) {
    console.warn(`[notificación] ${evento}: correo no configurado.`);
    return false;
  }
  await transporter.sendMail({
    from: `"Salesianos Dual" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: body,
  });
  return true;
}

// Never throws: notifications must not affect the request that triggered them.
function safe(evento, fn) {
  return (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch((err) => {
        console.error(`[notificación] ${evento}: no se pudo enviar.`, err.message);
        return false;
      });
}

// ── Data ────────────────────────────────────────────────────────────────────

async function datosSolicitudAlumno(id) {
  const [rows] = await pool.query(
    `SELECT a.nombre, a.email, c.nombre AS convocatoria, esp.nombre AS especialidad
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = sa.id_especialidad
      WHERE sa.id_solicitud_alumno = ?`,
    [id],
  );
  return rows[0] || null;
}

async function datosSolicitudEmpresa(id) {
  const [rows] = await pool.query(
    `SELECT emp.empresa, ct.nombre AS coordinador, ct.email, c.nombre AS convocatoria
       FROM dual_solicitudes_empresa se
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       LEFT JOIN ge_contactos ct ON ct.idcontacto = se.id_coordinador_empresa
      WHERE se.id_solicitud_empresa = ?`,
    [id],
  );
  return rows[0] || null;
}

async function datosReserva(id) {
  const [rows] = await pool.query(
    `SELECT r.id_reserva, er.nombre AS estado,
            a.nombre AS alumno, a.email AS email_alumno,
            emp.empresa, ct.nombre AS coordinador, ct.email AS email_empresa,
            esp.nombre AS especialidad, c.nombre AS convocatoria
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       LEFT JOIN ge_contactos ct ON ct.idcontacto = se.id_coordinador_empresa
      WHERE r.id_reserva = ?`,
    [id],
  );
  return rows[0] || null;
}

async function datosDocumento(id) {
  const [rows] = await pool.query(
    `SELECT d.id_documento, td.nombre AS clave,
            d.id_solicitud_alumno, d.id_solicitud_empresa, d.id_reserva
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
      WHERE d.id_documento = ?`,
    [id],
  );
  return rows[0] || null;
}

// ── Events ──────────────────────────────────────────────────────────────────

const solicitudAlumno = safe('solicitud_alumno', async (idSolicitud, estado, motivo) => {
  const d = await datosSolicitudAlumno(idSolicitud);
  if (!d) return false;
  if (estado === 'VALIDADO') {
    return enviar('solicitud_alumno_validada', d.email, 'Tu solicitud de FP Dual ha sido validada',
      layout(html`Hola ${d.nombre}:`, [
        html`Tu solicitud para la convocatoria <strong>${d.convocatoria}</strong> (${d.especialidad || 'FP Dual'}) ha sido <strong>validada</strong>.`,
        'A partir de ahora las empresas colaboradoras pueden reservar tu candidatura. Te avisaremos cuando haya una reserva.',
      ]));
  }
  if (estado === 'RECHAZADO') {
    return enviar('solicitud_alumno_rechazada', d.email, 'Tu solicitud de FP Dual no ha sido aceptada',
      layout(html`Hola ${d.nombre}:`, [
        html`Tu solicitud para la convocatoria <strong>${d.convocatoria}</strong> no ha sido aceptada.`,
        ...(motivo ? [html`Motivo indicado por el centro: ${motivo}`] : []),
        'Si crees que se trata de un error o puedes corregirlo, ponte en contacto con el centro.',
      ]));
  }
  return false;
});

// The centre corrected the ciclo of a student application.
const cicloCorregido = safe('ciclo_corregido', async (idSolicitud) => {
  const d = await datosSolicitudAlumno(idSolicitud);
  if (!d) return false;
  return enviar('ciclo_corregido', d.email, 'Hemos corregido el ciclo de tu solicitud de FP Dual',
    layout(html`Hola ${d.nombre}:`, [
      html`El centro ha corregido el ciclo de tu solicitud para la convocatoria <strong>${d.convocatoria}</strong>. Ahora figura como <strong>${d.especialidad || 'FP Dual'}</strong>.`,
      'Si no es correcto, ponte en contacto con el centro.',
    ]));
});

// Administración resolved the student's request to correct their data.
const cambioDatosResuelto = safe('cambio_datos_alumno', async (idSolicitud, aprobado, motivo) => {
  const d = await datosSolicitudAlumno(idSolicitud);
  if (!d) return false;
  if (aprobado) {
    return enviar('cambio_datos_aprobado', d.email, 'Hemos corregido tus datos de FP Dual',
      layout(html`Hola ${d.nombre}:`, [
        html`El centro ha aprobado la corrección de datos que pediste para la convocatoria <strong>${d.convocatoria}</strong>.`,
      ]));
  }
  return enviar('cambio_datos_rechazado', d.email, 'Tu petición de corrección de datos no se ha aplicado',
    layout(html`Hola ${d.nombre}:`, [
      html`El centro no ha aplicado la corrección de datos que pediste para la convocatoria <strong>${d.convocatoria}</strong>.`,
      ...(motivo ? [html`Motivo indicado por el centro: ${motivo}`] : []),
    ]));
});

const solicitudEmpresa = safe('solicitud_empresa', async (idSolicitud, estado, motivo) => {
  const d = await datosSolicitudEmpresa(idSolicitud);
  if (!d) return false;
  if (estado === 'VALIDADO') {
    return enviar('solicitud_empresa_validada', d.email, 'Vuestra solicitud de FP Dual ha sido validada',
      layout(html`Estimado/a ${d.coordinador || 'coordinador/a'}:`, [
        html`La solicitud de <strong>${d.empresa}</strong> para la convocatoria <strong>${d.convocatoria}</strong> ha sido <strong>validada</strong>.`,
        'Ya podéis consultar los alumnos disponibles de vuestros ciclos y reservar candidaturas desde el portal.',
      ]));
  }
  if (estado === 'RECHAZADO') {
    return enviar('solicitud_empresa_rechazada', d.email, 'Vuestra solicitud de FP Dual no ha sido aceptada',
      layout(html`Estimado/a ${d.coordinador || 'coordinador/a'}:`, [
        html`La solicitud de <strong>${d.empresa}</strong> para la convocatoria <strong>${d.convocatoria}</strong> no ha sido aceptada.`,
        ...(motivo ? [html`Motivo indicado por el centro: ${motivo}`] : []),
        'Para cualquier aclaración, contactad con el centro.',
      ]));
  }
  return false;
});

const documentoRechazado = safe('documento_rechazado', async (idDocumento, motivo) => {
  const doc = await datosDocumento(idDocumento);
  if (!doc) return false;
  const nombreDoc = defByClave(doc.clave)?.nombre || doc.clave;
  const texto = (contexto) => [
    html`El centro ha rechazado el documento <strong>${nombreDoc}</strong>${contexto}.`,
    ...(motivo ? [html`Motivo: ${motivo}`] : []),
    'Sube una versión corregida desde el portal.',
  ];
  if (doc.id_solicitud_alumno) {
    const d = await datosSolicitudAlumno(doc.id_solicitud_alumno);
    if (!d) return false;
    return enviar('documento_rechazado', d.email, `Documento rechazado: ${nombreDoc}`,
      layout(html`Hola ${d.nombre}:`, texto(html` de tu solicitud (${d.convocatoria})`)));
  }
  if (doc.id_solicitud_empresa) {
    const d = await datosSolicitudEmpresa(doc.id_solicitud_empresa);
    if (!d) return false;
    return enviar('documento_rechazado', d.email, `Documento rechazado: ${nombreDoc}`,
      layout(html`Estimado/a ${d.coordinador || 'coordinador/a'}:`, texto(html` de ${d.empresa} (${d.convocatoria})`)));
  }
  if (doc.id_reserva) {
    // Reservation documents (Anexo II/III, Calendario) are uploaded by the company.
    const r = await datosReserva(doc.id_reserva);
    if (!r) return false;
    return enviar('documento_rechazado', r.email_empresa, `Documento rechazado: ${nombreDoc}`,
      layout(html`Estimado/a ${r.coordinador || 'coordinador/a'}:`, texto(html` de la reserva de ${r.alumno} (${r.especialidad})`)));
  }
  return false;
});

const reservaCreada = safe('reserva_creada', async (idReserva, { porCentro = false } = {}) => {
  const r = await datosReserva(idReserva);
  if (!r) return false;
  const envios = [
    enviar('reserva_creada_alumno', r.email_alumno, 'Una empresa ha reservado tu candidatura',
      layout(html`Hola ${r.alumno}:`, [
        html`<strong>${r.empresa}</strong> ha reservado tu candidatura para <strong>${r.especialidad}</strong> (convocatoria ${r.convocatoria}).`,
        'La plaza no es definitiva hasta que el centro la confirme, una vez firmado y validado el Anexo II o III.',
      ])),
  ];
  if (porCentro) {
    envios.push(enviar('reserva_creada_empresa', r.email_empresa, 'El centro ha asignado un alumno a vuestra empresa',
      layout(html`Estimado/a ${r.coordinador || 'coordinador/a'}:`, [
        html`El centro ha creado una reserva de <strong>${r.alumno}</strong> para <strong>${r.especialidad}</strong> en ${r.empresa}.`,
        'Consultad la reserva en el portal para completar su documentación.',
      ])));
  }
  await Promise.all(envios);
  return true;
});

const reservaCancelada = safe('reserva_cancelada', async (idReserva, { avisarEmpresa = false, avisarAlumno = true } = {}) => {
  const r = await datosReserva(idReserva);
  if (!r) return false;
  const envios = [];
  if (avisarAlumno) {
    envios.push(enviar('reserva_cancelada_alumno', r.email_alumno, 'Una reserva de tu candidatura se ha cancelado',
      layout(html`Hola ${r.alumno}:`, [
        html`La reserva de <strong>${r.empresa}</strong> para ${r.especialidad} ha sido cancelada.`,
        'Tu solicitud sigue activa: otras empresas pueden reservar tu candidatura.',
      ])));
  }
  if (avisarEmpresa) {
    envios.push(enviar('reserva_cancelada_empresa', r.email_empresa, 'Una reserva de vuestra empresa se ha cancelado',
      layout(html`Estimado/a ${r.coordinador || 'coordinador/a'}:`, [
        html`La reserva de <strong>${r.alumno}</strong> para ${r.especialidad} en ${r.empresa} ha sido cancelada por el centro.`,
        'La plaza vuelve a estar disponible. Para más información, contactad con el centro.',
      ])));
  }
  await Promise.all(envios);
  return true;
});

const reservaConfirmada = safe('reserva_confirmada', async (idReserva) => {
  const r = await datosReserva(idReserva);
  if (!r) return false;
  await Promise.all([
    enviar('reserva_confirmada_alumno', r.email_alumno, 'Tu plaza de FP Dual está confirmada',
      layout(html`Hola ${r.alumno}:`, [
        html`El centro ha confirmado tu plaza en <strong>${r.empresa}</strong> para <strong>${r.especialidad}</strong> (convocatoria ${r.convocatoria}).`,
        'Tus otras reservas pendientes, si las había, se han cancelado.',
      ])),
    enviar('reserva_confirmada_empresa', r.email_empresa, 'Reserva confirmada',
      layout(html`Estimado/a ${r.coordinador || 'coordinador/a'}:`, [
        html`El centro ha confirmado la plaza de <strong>${r.alumno}</strong> en ${r.empresa} para ${r.especialidad}.`,
      ])),
  ]);
  return true;
});

// Password reset link (passwordResetService). Sent to whoever asked, never logged in full.
const restablecerContrasena = safe('restablecer_contrasena', async (to, nombre, link) =>
  enviar('restablecer_contrasena', to, 'Restablece tu contraseña del portal FP Dual', [
    html`<p>Hola ${nombre || ''}:</p>`,
    '<p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta del portal FP Dual.</p>',
    html`<p><a href="${link}">Elegir una contraseña nueva</a></p>`,
    '<p>El enlace caduca en 30 minutos y solo se puede usar una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.</p>',
    `<p>${FIRMA}</p>`,
  ].join('')));

module.exports = {
  restablecerContrasena,
  solicitudAlumno,
  cicloCorregido,
  cambioDatosResuelto,
  solicitudEmpresa,
  documentoRechazado,
  reservaCreada,
  reservaCancelada,
  reservaConfirmada,
  escapeHtml,
  html,
};
