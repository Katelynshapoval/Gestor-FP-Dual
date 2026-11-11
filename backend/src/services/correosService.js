// Administración · editable email templates (migrations 022 and 023).
// ADMINISTRADOR only.
//
//   GET    /correos                              list, grouped by the client
//   GET    /correos/:clave                       text, variables, attachments and history
//   PUT    /correos/:clave                       save { asunto, cuerpo, activa, lleva_adjuntos?, version }
//   POST   /correos/:clave/restaurar             copy the text of version { desde } as a new one { desde, version }
//   POST   /correos/:clave/vista-previa          render a draft with the example values
//   POST   /correos/:clave/prueba                send that draft to the administrator
//   POST   /correos/:clave/adjuntos              attach a generated document { documento, version }
//   POST   /correos/:clave/adjuntos/archivo      attach a fixed PDF (multipart: archivo, version)
//   DELETE /correos/:clave/adjuntos/:id          remove an attachment (?version=)
//   GET    /correos/:clave/adjuntos/:id/archivo  download a fixed PDF
//
// Every change (text, switches, attachments) is a new version in
// dual_correo_plantillas_historial and one CORREO event in dual_eventos, in the
// same transaction. `version` is the version the editor started from: a newer
// one means another administrator saved meanwhile (409), so nobody overwrites
// a change unseen. Restoring a version copies its text only; the attachments
// stay as they are.
const pool = require('../db/pool');
const { inTransaction, HttpError } = require('../db/transaction');
const { recordEvent } = require('./auditLog');
const correo = require('./correoPlantillas');
const { validar } = require('../mail/plantilla');
const { isPdf } = require('../middleware/pdfUpload');

let mail = null;
try {
  mail = require('../mail/config');
} catch {
  /* mail not configured */
}

const CLAVE = /^[a-z][a-z0-9_]{0,59}$/;

function claveDe(req) {
  const clave = String(req.params.clave || '');
  if (!CLAVE.test(clave)) throw new HttpError(404, 'Ese correo no existe.');
  return clave;
}

const texto = (value) => String(value ?? '').replace(/\r\n/g, '\n');
const limpiarAsunto = (value) => texto(value).trim();
const limpiarCuerpo = (value) => texto(value).replace(/[ \t]+$/gm, '').trim();
const bool = (value) => Number(value) === 1;

// Name of an uploaded PDF: no control characters, quotes or path separators,
// always ending in .pdf.
function nombreArchivo(name) {
  let limpio = String(name || '').replace(/[\u0000-\u001f\u007f"\\/<>:|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (!limpio.toLowerCase().endsWith('.pdf')) limpio = `${limpio || 'adjunto'}.pdf`;
  if (limpio.length > 200) limpio = `${limpio.slice(0, 196)}.pdf`;
  return limpio;
}

function enviarError(res, err) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.errores ? { errores: err.errores } : {}) });
  }
  throw err;
}

function adjuntoPublico(a) {
  return {
    id: Number(a.id_adjunto),
    tipo: a.tipo,
    documento: a.documento || null,
    nombre: correo.nombreAdjunto(a),
    tamano: a.tamano === null || a.tamano === undefined ? null : Number(a.tamano),
    creado_en: a.creado_en,
    subido_por: a.subido_por || null,
  };
}

// ── Reading ─────────────────────────────────────────────────────────────────

exports.list = async function (_req, res) {
  const [filas] = await pool.query(
    `SELECT p.clave, p.grupo, p.nombre, p.destinatario, p.cuando, p.orden, p.asunto, p.cuerpo,
            p.activa, p.lleva_adjuntos, p.desactivable, p.version, p.actualizado_en,
            u.nombre_mostrar AS actualizado_por,
            (SELECT COUNT(*) FROM dual_correo_adjuntos a WHERE a.clave_plantilla = p.clave) AS n_adjuntos
       FROM dual_correo_plantillas p
       LEFT JOIN dual_usuarios u ON u.id_usuario = p.id_usuario_actualiza
      ORDER BY p.orden, p.clave`,
  );
  const [vars] = await pool.query(
    'SELECT clave_plantilla, variable, tipo, etiqueta, obligatoria FROM dual_correo_variables',
  );
  const faltan = Object.keys(correo.CONTRATO).filter((c) => !filas.some((f) => f.clave === c));
  return res.json({
    correos: filas.map((f) => ({
      clave: f.clave,
      grupo: f.grupo,
      nombre: f.nombre,
      destinatario: f.destinatario,
      cuando: f.cuando,
      asunto: f.asunto,
      activa: bool(f.activa),
      lleva_adjuntos: bool(f.lleva_adjuntos),
      n_adjuntos: Number(f.n_adjuntos || 0),
      desactivable: bool(f.desactivable),
      version: Number(f.version),
      editado: Number(f.version) > 1,
      actualizado_en: f.actualizado_en,
      actualizado_por: f.actualizado_por || null,
      problemas: correo.problemas(f.clave, f, vars.filter((v) => v.clave_plantilla === f.clave)),
    })),
    faltan,
  });
};

async function detalle(clave, conn = pool) {
  const [[fila]] = await conn.query(
    `SELECT p.clave, p.grupo, p.nombre, p.destinatario, p.cuando, p.asunto, p.cuerpo, p.activa,
            p.lleva_adjuntos, p.desactivable, p.version, p.actualizado_en, u.nombre_mostrar AS actualizado_por
       FROM dual_correo_plantillas p
       LEFT JOIN dual_usuarios u ON u.id_usuario = p.id_usuario_actualiza
      WHERE p.clave = ?`,
    [clave],
  );
  if (!fila) return null;
  const [variables] = await conn.query(
    `SELECT variable, tipo, etiqueta, descripcion, ejemplo, fragmento, opcional, obligatoria
       FROM dual_correo_variables
      WHERE clave_plantilla = ?
      ORDER BY orden, variable`,
    [clave],
  );
  const [historial] = await conn.query(
    `SELECT h.version, h.asunto, h.cuerpo, h.activa, h.lleva_adjuntos, h.adjuntos, h.creado_en,
            u.nombre_mostrar AS usuario
       FROM dual_correo_plantillas_historial h
       LEFT JOIN dual_usuarios u ON u.id_usuario = h.id_usuario
      WHERE h.clave_plantilla = ?
      ORDER BY h.version DESC`,
    [clave],
  );
  const adjuntos = await correo.cargarAdjuntos(clave, conn);
  const llevaAdjuntos = bool(fila.lleva_adjuntos);
  const posibles = correo.DOCUMENTOS[clave] || [];
  // The active template of each document: what the attached PDFs are generated with.
  const [activas] = posibles.length
    ? await conn.query(
      `SELECT td.nombre AS documento, p.version, p.nombre_archivo
         FROM dual_documento_plantillas p
         JOIN dual_tipos_documento td ON td.id_tipo_documento = p.id_tipo_documento
        WHERE p.es_activa = 1 AND td.nombre IN (?)`,
      [posibles],
    )
    : [[]];
  return {
    clave: fila.clave,
    grupo: fila.grupo,
    nombre: fila.nombre,
    destinatario: fila.destinatario,
    cuando: fila.cuando,
    asunto: fila.asunto,
    cuerpo: fila.cuerpo,
    activa: bool(fila.activa),
    lleva_adjuntos: llevaAdjuntos,
    admite_adjuntos: clave !== correo.PIE,
    desactivable: bool(fila.desactivable),
    version: Number(fila.version),
    actualizado_en: fila.actualizado_en,
    actualizado_por: fila.actualizado_por || null,
    variables: variables.map((v) => ({
      variable: v.variable,
      tipo: v.tipo,
      etiqueta: v.etiqueta,
      descripcion: v.descripcion,
      ejemplo: v.ejemplo,
      fragmento: v.fragmento || `{{${v.variable}}}`,
      opcional: bool(v.opcional),
      obligatoria: bool(v.obligatoria),
    })),
    adjuntos: adjuntos.map(adjuntoPublico),
    documentos_disponibles: posibles.map((d) => {
      const activa = activas.find((p) => p.documento === d);
      return {
        documento: d,
        nombre: correo.nombreDocumento(d),
        adjunto: adjuntos.some((a) => a.tipo === 'DOCUMENTO' && a.documento === d),
        plantilla_activa: activa ? { version: Number(activa.version), nombre_archivo: activa.nombre_archivo } : null,
      };
    }),
    limites: { max_archivos: correo.MAX_ARCHIVOS, max_bytes: correo.MAX_ARCHIVO },
    historial: historial.map((h) => ({
      version: Number(h.version),
      asunto: h.asunto,
      cuerpo: h.cuerpo,
      activa: bool(h.activa),
      lleva_adjuntos: bool(h.lleva_adjuntos),
      adjuntos: h.adjuntos || null,
      creado_en: h.creado_en,
      usuario: h.usuario || null,
    })),
    problemas: correo.problemas(fila.clave, fila, variables),
    avisos_adjuntos: correo.avisosAdjuntos(clave, llevaAdjuntos, adjuntos),
  };
}

exports.get = async function (req, res) {
  try {
    const d = await detalle(claveDe(req));
    if (!d) return res.status(404).json({ error: 'Ese correo no existe.' });
    return res.json(d);
  } catch (err) {
    return enviarError(res, err);
  }
};

// ── Saving ──────────────────────────────────────────────────────────────────

// One change of an email, as a new version.
//   cambio(fila, conn) → { asunto, cuerpo, activa, llevaAdjuntos, escribir?, detalle? }
//   `escribir(conn)` makes the attachment change; it runs after every check.
async function guardar(req, clave, { version, accion, cambio }) {
  return inTransaction(async (conn) => {
    const [[fila]] = await conn.query(
      `SELECT clave, asunto, cuerpo, activa, lleva_adjuntos, desactivable, version
         FROM dual_correo_plantillas WHERE clave = ? FOR UPDATE`,
      [clave],
    );
    if (!fila) throw new HttpError(404, 'Ese correo no existe.');
    if (Number(version) !== Number(fila.version)) {
      throw new HttpError(409, 'Otra persona ha guardado este correo mientras lo editabas. Recarga para ver su versión antes de guardar.', { code: 'VERSION_CAMBIADA' });
    }
    const nuevo = await cambio(fila, conn);
    if (!nuevo.activa && !bool(fila.desactivable)) {
      throw new HttpError(400, 'Este correo no se puede desactivar.');
    }
    if (nuevo.llevaAdjuntos && clave === correo.PIE) {
      throw new HttpError(400, 'El pie de los correos no puede llevar adjuntos.');
    }
    const [variables] = await conn.query(
      'SELECT variable, tipo, etiqueta, obligatoria FROM dual_correo_variables WHERE clave_plantilla = ?',
      [clave],
    );
    const errores = validar({ asunto: nuevo.asunto, cuerpo: nuevo.cuerpo }, variables);
    if (errores.length) {
      throw new HttpError(400, 'Revisa el correo antes de guardarlo.', { code: 'PLANTILLA_NO_VALIDA', errores });
    }
    const activaNum = nuevo.activa ? 1 : 0;
    const llevaNum = nuevo.llevaAdjuntos ? 1 : 0;
    if (
      !nuevo.escribir
      && fila.asunto === nuevo.asunto
      && fila.cuerpo === nuevo.cuerpo
      && Number(fila.activa) === activaNum
      && Number(fila.lleva_adjuntos) === llevaNum
    ) {
      return { sinCambios: true };
    }
    if (nuevo.escribir) await nuevo.escribir(conn);
    const adjuntos = await correo.cargarAdjuntos(clave, conn);
    const nueva = Number(fila.version) + 1;
    const [ins] = await conn.query(
      `INSERT INTO dual_correo_plantillas_historial
         (clave_plantilla, version, asunto, cuerpo, activa, lleva_adjuntos, adjuntos, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [clave, nueva, nuevo.asunto, nuevo.cuerpo, activaNum, llevaNum, correo.resumenAdjuntos(adjuntos), req.user.id],
    );
    await conn.query(
      `UPDATE dual_correo_plantillas
          SET asunto = ?, cuerpo = ?, activa = ?, lleva_adjuntos = ?, version = ?, id_usuario_actualiza = ?, actualizado_en = NOW()
        WHERE clave = ?`,
      [nuevo.asunto, nuevo.cuerpo, activaNum, llevaNum, nueva, req.user.id, clave],
    );
    const estado = (a) => (Number(a) === 1 ? 'ACTIVA' : 'INACTIVA');
    await recordEvent(conn, {
      entidad: 'CORREO',
      id: ins.insertId,
      accion,
      antes: estado(fila.activa),
      despues: estado(activaNum),
      user: req.user,
      detalle: {
        clave,
        version: nueva,
        ...(Number(fila.lleva_adjuntos) !== llevaNum ? { lleva_adjuntos: Boolean(llevaNum) } : {}),
        ...(nuevo.detalle || {}),
      },
    });
    return { version: nueva };
  });
}

// The stored state, unchanged; attachment operations start from it.
const igual = (fila) => ({
  asunto: fila.asunto,
  cuerpo: fila.cuerpo,
  activa: bool(fila.activa),
  llevaAdjuntos: bool(fila.lleva_adjuntos),
});

exports.update = async function (req, res) {
  try {
    const clave = claveDe(req);
    const body = req.body || {};
    if (typeof body.activa !== 'boolean') throw new HttpError(400, 'Indica si el correo está activo.');
    if (body.lleva_adjuntos !== undefined && typeof body.lleva_adjuntos !== 'boolean') {
      throw new HttpError(400, 'Indica si el correo lleva adjuntos.');
    }
    const out = await guardar(req, clave, {
      version: body.version,
      accion: 'EDITAR',
      cambio: (fila) => ({
        asunto: limpiarAsunto(body.asunto),
        cuerpo: limpiarCuerpo(body.cuerpo),
        activa: body.activa,
        llevaAdjuntos: body.lleva_adjuntos === undefined ? bool(fila.lleva_adjuntos) : body.lleva_adjuntos,
      }),
    });
    return res.json({
      message: out.sinCambios ? 'No había cambios que guardar.' : 'Correo guardado.',
      correo: await detalle(clave),
    });
  } catch (err) {
    return enviarError(res, err);
  }
};

exports.restaurar = async function (req, res) {
  try {
    const clave = claveDe(req);
    const desde = Number(req.body?.desde ?? 1);
    if (!Number.isInteger(desde) || desde < 1) throw new HttpError(400, 'Versión no válida.');
    const [[origen]] = await pool.query(
      'SELECT asunto, cuerpo FROM dual_correo_plantillas_historial WHERE clave_plantilla = ? AND version = ?',
      [clave, desde],
    );
    if (!origen) throw new HttpError(404, 'Esa versión no existe.');
    const out = await guardar(req, clave, {
      version: req.body?.version,
      accion: 'RESTAURAR',
      cambio: (fila) => ({ ...igual(fila), asunto: origen.asunto, cuerpo: origen.cuerpo, detalle: { desde_version: desde } }),
    });
    return res.json({
      message: out.sinCambios ? 'El correo ya tenía ese texto.' : `Restaurado el texto de la versión ${desde}.`,
      correo: await detalle(clave),
    });
  } catch (err) {
    return enviarError(res, err);
  }
};

// ── Attachments ─────────────────────────────────────────────────────────────

async function siguienteOrden(conn, clave) {
  const [[r]] = await conn.query(
    'SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM dual_correo_adjuntos WHERE clave_plantilla = ?',
    [clave],
  );
  return Number(r?.orden || 1);
}

// Adding the first attachment also switches «lleva adjuntos» on: that is what
// the administrator expects when they attach something.
function conAdjunto(fila, extra) {
  return { ...igual(fila), llevaAdjuntos: true, ...extra };
}

exports.agregarDocumento = async function (req, res) {
  try {
    const clave = claveDe(req);
    const documento = String(req.body?.documento || '').toUpperCase();
    if (!(correo.DOCUMENTOS[clave] || []).includes(documento)) {
      throw new HttpError(400, 'Ese documento no se puede adjuntar a este correo.');
    }
    const nombre = correo.nombreDocumento(documento);
    const out = await guardar(req, clave, {
      version: req.body?.version,
      accion: 'ADJUNTO_ANADIR',
      cambio: async (fila, conn) => {
        const [[tipo]] = await conn.query('SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = ?', [documento]);
        if (!tipo) throw new HttpError(400, `El tipo de documento ${documento} no existe en la base de datos.`);
        const [ya] = await conn.query(
          'SELECT id_adjunto FROM dual_correo_adjuntos WHERE clave_plantilla = ? AND id_tipo_documento = ?',
          [clave, tipo.id_tipo_documento],
        );
        if (ya.length) throw new HttpError(409, `«${nombre}» ya está adjunto a este correo.`);
        return conAdjunto(fila, {
          detalle: { adjunto: nombre },
          escribir: async (c) => {
            await c.query(
              `INSERT INTO dual_correo_adjuntos (clave_plantilla, tipo, id_tipo_documento, orden, id_usuario_subida)
               VALUES (?, 'DOCUMENTO', ?, ?, ?)`,
              [clave, tipo.id_tipo_documento, await siguienteOrden(c, clave), req.user.id],
            );
          },
        });
      },
    });
    return res.status(201).json({ message: `«${nombre}» se adjuntará a este correo.`, version: out.version, correo: await detalle(clave) });
  } catch (err) {
    return enviarError(res, err);
  }
};

exports.subirArchivo = async function (req, res) {
  try {
    const clave = claveDe(req);
    if (clave === correo.PIE) throw new HttpError(400, 'El pie de los correos no puede llevar adjuntos.');
    const file = req.file;
    if (!file?.buffer?.length) throw new HttpError(400, 'Elige un archivo PDF.');
    if (!isPdf(file.buffer)) throw new HttpError(400, 'Solo se aceptan archivos PDF.');
    if (file.buffer.length > correo.MAX_ARCHIVO) {
      throw new HttpError(400, `El PDF no puede superar ${Math.round(correo.MAX_ARCHIVO / (1024 * 1024))} MB.`);
    }
    const nombre = nombreArchivo(file.originalname);
    const out = await guardar(req, clave, {
      version: req.body?.version,
      accion: 'ADJUNTO_ANADIR',
      cambio: async (fila, conn) => {
        const [[n]] = await conn.query(
          "SELECT COUNT(*) AS n FROM dual_correo_adjuntos WHERE clave_plantilla = ? AND tipo = 'ARCHIVO'",
          [clave],
        );
        if (Number(n?.n || 0) >= correo.MAX_ARCHIVOS) {
          throw new HttpError(400, `Un correo puede llevar como máximo ${correo.MAX_ARCHIVOS} PDF subidos.`);
        }
        return conAdjunto(fila, {
          detalle: { adjunto: nombre },
          escribir: async (c) => {
            await c.query(
              `INSERT INTO dual_correo_adjuntos
                 (clave_plantilla, tipo, nombre_archivo, mime_type, tamano, archivo, orden, id_usuario_subida)
               VALUES (?, 'ARCHIVO', ?, 'application/pdf', ?, ?, ?, ?)`,
              [clave, nombre, file.buffer.length, file.buffer, await siguienteOrden(c, clave), req.user.id],
            );
          },
        });
      },
    });
    return res.status(201).json({ message: `«${nombre}» se adjuntará a este correo.`, version: out.version, correo: await detalle(clave) });
  } catch (err) {
    return enviarError(res, err);
  }
};

function idAdjunto(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Ese adjunto no existe.');
  return id;
}

exports.quitarAdjunto = async function (req, res) {
  try {
    const clave = claveDe(req);
    const id = idAdjunto(req);
    let nombre = '';
    const out = await guardar(req, clave, {
      version: req.query?.version ?? req.body?.version,
      accion: 'ADJUNTO_QUITAR',
      cambio: async (fila, conn) => {
        const [[a]] = await conn.query(
          `SELECT a.id_adjunto, a.tipo, td.nombre AS documento, a.nombre_archivo
             FROM dual_correo_adjuntos a
             LEFT JOIN dual_tipos_documento td ON td.id_tipo_documento = a.id_tipo_documento
            WHERE a.id_adjunto = ? AND a.clave_plantilla = ?`,
          [id, clave],
        );
        if (!a) throw new HttpError(404, 'Ese adjunto no existe.');
        nombre = correo.nombreAdjunto(a);
        return {
          ...igual(fila),
          detalle: { adjunto: nombre },
          escribir: async (c) => {
            await c.query('DELETE FROM dual_correo_adjuntos WHERE id_adjunto = ? AND clave_plantilla = ?', [id, clave]);
          },
        };
      },
    });
    return res.json({ message: `«${nombre}» ya no se adjuntará.`, version: out.version, correo: await detalle(clave) });
  } catch (err) {
    return enviarError(res, err);
  }
};

exports.descargarAdjunto = async function (req, res) {
  try {
    const clave = claveDe(req);
    const id = idAdjunto(req);
    const [[a]] = await pool.query(
      `SELECT nombre_archivo, archivo FROM dual_correo_adjuntos
        WHERE id_adjunto = ? AND clave_plantilla = ? AND tipo = 'ARCHIVO'`,
      [id, clave],
    );
    if (!a) throw new HttpError(404, 'Ese adjunto no existe.');
    const file = Buffer.isBuffer(a.archivo) ? a.archivo : Buffer.from(a.archivo);
    // SEC-012: fixed type; the stored name only in an encoded header value.
    const ascii = String(a.nombre_archivo).replace(/[^A-Za-z0-9._-]+/g, '_');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Length', String(file.length));
    res.set('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nombre_archivo)}`);
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(file);
  } catch (err) {
    return enviarError(res, err);
  }
};

// ── Preview and test email ──────────────────────────────────────────────────

function llevaDelBorrador(req) {
  const v = req.body?.lleva_adjuntos;
  return typeof v === 'boolean' ? v : null;
}

async function borrador(req) {
  const clave = claveDe(req);
  const out = await correo.componerBorrador(clave, {
    asunto: limpiarAsunto(req.body?.asunto),
    cuerpo: limpiarCuerpo(req.body?.cuerpo),
    llevaAdjuntos: llevaDelBorrador(req),
  });
  if (!out) throw new HttpError(404, 'Ese correo no existe.');
  return { clave, ...out };
}

exports.vistaPrevia = async function (req, res) {
  try {
    const out = await borrador(req);
    const { clave: _clave, ...resto } = out;
    return res.json(out.errores.length ? { errores: out.errores } : resto);
  } catch (err) {
    return enviarError(res, err);
  }
};

exports.prueba = async function (req, res) {
  try {
    const out = await borrador(req);
    if (out.errores.length) {
      throw new HttpError(400, 'Revisa el correo antes de enviar la prueba.', { code: 'PLANTILLA_NO_VALIDA', errores: out.errores });
    }
    const [[usuario]] = await pool.query('SELECT email FROM dual_usuarios WHERE id_usuario = ?', [req.user.id]);
    if (!usuario?.email) throw new HttpError(400, 'Tu cuenta no tiene correo electrónico.');
    if (!mail?.transporter) throw new HttpError(503, 'El envío de correo no está configurado en el servidor.');
    // Uploaded PDFs go as they are; generated documents only exist for a real
    // request (made from the active template), so the test cannot carry them.
    const archivos = out.adjuntos.some((a) => a.tipo === 'ARCHIVO')
      ? (await correo.cargarAdjuntos(out.clave, pool, { conArchivo: true })).filter((a) => a.tipo === 'ARCHIVO')
      : [];
    const sinGenerar = out.adjuntos.filter((a) => a.tipo === 'DOCUMENTO').map((a) => a.nombre);
    await mail.transporter.sendMail({
      from: `"Salesianos Dual" <${process.env.EMAIL_USER}>`,
      to: usuario.email,
      subject: `[Prueba] ${out.asunto}`,
      html: out.html,
      ...(archivos.length
        ? { attachments: archivos.map((a) => ({ filename: a.nombre_archivo, content: a.archivo, contentType: 'application/pdf' })) }
        : {}),
    });
    const simulado = mail.transporter.mode && mail.transporter.mode !== 'smtp';
    const nota = sinGenerar.length
      ? ` ${sinGenerar.join(', ')} no va en la prueba: se genera para cada solicitud.`
      : '';
    return res.json({
      enviado: !simulado,
      message: (simulado
        ? 'El servidor está en modo de registro (MAIL_MODE=log): el correo no se ha enviado, solo se ha anotado en el registro.'
        : `Correo de prueba enviado a ${usuario.email}.`) + nota,
    });
  } catch (err) {
    if (!(err instanceof HttpError)) {
      console.error('[correo] prueba:', err.message);
      return res.status(502).json({ error: 'No se ha podido enviar el correo de prueba.' });
    }
    return enviarError(res, err);
  }
};

exports._internals = { detalle, guardar, nombreArchivo };
