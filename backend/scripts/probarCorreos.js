// Sends every notification template once, for reading them in a real inbox.
// The texts and attachments come from the database (migrations 022 and 023),
// as edited in «Correos».
//
//   node scripts/probarCorreos.js
//
// Safety: refuses to run unless MAIL_MODE=smtp AND MAIL_REDIRECT_TO is set (so
// every email goes to that one address, never to students or companies) and
// NODE_ENV is not production. It only READS the test records created by
// scripts/seedPruebas.js; no state changes, no audit events.
require('dotenv').config();

const { MAIL_MODE, MAIL_REDIRECT_TO, maskEmail } = require('../src/mail/config');
const pool = require('../src/db/pool');
const n = require('../src/services/notificaciones');

// Stand-in for a generated convenio: a minimal valid one-page PDF, so the
// attachment path (migration 023) can be read in a real inbox.
const PDF_PRUEBA = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

async function idsDePrueba() {
  const [empresas] = await pool.query(
    `SELECT se.id_solicitud_empresa FROM dual_solicitudes_empresa se
       JOIN ge_empresas e ON e.idempresa = se.id_empresa
      WHERE e.empresa LIKE 'EMPRESA PRUEBA A%' ORDER BY se.id_solicitud_empresa LIMIT 1`,
  );
  const [alumnos] = await pool.query(
    `SELECT sa.id_solicitud_alumno FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
      WHERE a.nombre LIKE 'ALUMNO PRUEBA%' ORDER BY sa.id_solicitud_alumno LIMIT 1`,
  );
  if (!empresas[0] || !alumnos[0]) throw new Error('No hay datos de prueba (scripts/seedPruebas.js).');
  const [reservas] = await pool.query(
    'SELECT id_reserva FROM dual_reservas WHERE id_solicitud_alumno = ? ORDER BY id_reserva LIMIT 1',
    [alumnos[0].id_solicitud_alumno],
  );
  if (!reservas[0]) throw new Error('El alumno de prueba no tiene ninguna reserva.');
  const [docs] = await pool.query(
    'SELECT id_documento FROM dual_documentos WHERE id_reserva = ? ORDER BY id_documento LIMIT 1',
    [reservas[0].id_reserva],
  );
  return {
    solicitudEmpresa: empresas[0].id_solicitud_empresa,
    solicitudAlumno: alumnos[0].id_solicitud_alumno,
    reserva: reservas[0].id_reserva,
    documento: docs[0]?.id_documento || null,
  };
}

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('No se ejecuta con NODE_ENV=production.');
  if (MAIL_MODE !== 'smtp' || !MAIL_REDIRECT_TO) {
    throw new Error('Requiere MAIL_MODE=smtp y MAIL_REDIRECT_TO en backend/.env: así ningún correo sale hacia alumnos o empresas.');
  }
  const ids = await idsDePrueba();
  console.log(`Enviando las plantillas a ${maskEmail(MAIL_REDIRECT_TO)} con los registros de prueba`, ids);

  const casos = [
    ['Solicitud de alumno validada', () => n.solicitudAlumno(ids.solicitudAlumno, 'VALIDADO')],
    ['Solicitud de alumno rechazada', () => n.solicitudAlumno(ids.solicitudAlumno, 'RECHAZADO', 'Motivo de prueba: falta el Anexo DGA firmado.')],
    ['Solicitud de empresa validada', () => n.solicitudEmpresa(ids.solicitudEmpresa, 'VALIDADO')],
    ['Solicitud de empresa rechazada', () => n.solicitudEmpresa(ids.solicitudEmpresa, 'RECHAZADO', 'Motivo de prueba: el CIF no coincide con la razón social.')],
    ...(ids.documento
      ? [['Documento rechazado (reserva → empresa)', () => n.documentoRechazado(ids.documento, 'Motivo de prueba: falta la firma en la página 2.')]]
      : []),
    ['Reserva creada por la empresa (alumno)', () => n.reservaCreada(ids.reserva)],
    ['Reserva creada por el centro (alumno y empresa)', () => n.reservaCreada(ids.reserva, { porCentro: true })],
    ['Reserva cancelada por la empresa (alumno)', () => n.reservaCancelada(ids.reserva)],
    ['Reserva cancelada por el centro (empresa)', () => n.reservaCancelada(ids.reserva, { avisarEmpresa: true, avisarAlumno: false })],
    ['Reserva confirmada (alumno y empresa)', () => n.reservaConfirmada(ids.reserva)],
    ['Solicitud de alumno recibida', () => n.solicitudAlumnoRecibida(MAIL_REDIRECT_TO, 'Alumno de prueba', '2026/2027')],
    ['Ciclo corregido', () => n.cicloCorregido(ids.solicitudAlumno)],
    ['Corrección de datos aprobada', () => n.cambioDatosResuelto(ids.solicitudAlumno, true)],
    ['Corrección de datos rechazada', () => n.cambioDatosResuelto(ids.solicitudAlumno, false, 'Motivo de prueba: el documento no coincide.')],
    ['Solicitud de empresa recibida (convenio aún sin generar)', () => n.solicitudEmpresaRecibida(ids.solicitudEmpresa)],
    ['Solicitud de empresa recibida (con PDF de prueba, si el correo lleva adjuntos)', () => n.solicitudEmpresaRecibida(ids.solicitudEmpresa, PDF_PRUEBA)],
    ['Convenio disponible (sin PDF)', () => n.convenioDisponible(ids.solicitudEmpresa)],
    ['Convenio disponible (con PDF de prueba, si el correo lleva adjuntos)', () => n.convenioDisponible(ids.solicitudEmpresa, PDF_PRUEBA)],
    ['Reducción de plazas (empresa)', () => n.cupoReducido({
      email: MAIL_REDIRECT_TO, empresa: 'EMPRESA PRUEBA A', especialidad: 'Ciclo de prueba', cantidadAnterior: 3, cantidadNueva: 1,
      canceladas: [{ id_reserva: 0, alumno: 'Alumno de prueba', dni_alumno: '00000000T' }],
    })],
    ['Recuperar contraseña', () => n.restablecerContrasena(MAIL_REDIRECT_TO, 'Prueba', 'https://example.org/restablecer-contrasena?token=prueba')],
  ];

  let fallos = 0;
  for (const [nombre, enviar] of casos) {
    const ok = await enviar();
    if (!ok) fallos += 1;
    console.log(`${ok ? 'enviado ' : 'FALLO   '} ${nombre}`);
  }
  console.log(fallos ? `${fallos} envío(s) fallaron: revisa el registro de arriba.` : 'Todo enviado.');
  await pool.end();
  process.exitCode = fallos ? 1 : 0;
})().catch(async (err) => {
  console.error(err.message);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
