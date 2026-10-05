const pool = require("../db/pool");
const {
  sendSqlError,
  getCompanyIdFromUser,
  getStudentIdFromUser,
} = require("../helpers/dbHelpers");
const { defByClave, anexoClaveForContrato } = require("./documentCatalogue");
const workflow = require("./documentosWorkflow");
const { saveByClave } = require("./documentosStore");
const { generateDocument } = require("./documentGenerationService");

function provenance(req) {
  return { origen: "SUBIDA", idUsuario: req.user?.id || null };
}

async function assertAlumnoOwnsSolicitud(req, idSolicitud) {
  if (req.user.rol !== "ALUMNO") return null;
  const idAlumno = await getStudentIdFromUser(req.user.id);
  if (!idAlumno) return { status: 404, error: "No se encontró alumno vinculado a este usuario." };
  const [rows] = await pool.query(
    "SELECT id_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?",
    [idSolicitud],
  );
  if (!rows[0] || rows[0].id_alumno !== idAlumno) {
    return { status: 403, error: "No puedes modificar documentos de otra solicitud." };
  }
  return null;
}

// Upload a document for a student application
// POST /documentos/alumno/:idSolicitud/:tipo
exports.uploadAlumno = async function (req, res) {
  const idSolicitudAlumno = parseInt(req.params.idSolicitud, 10);
  const clave = String(req.params.tipo || "").toUpperCase().replace(/-/g, "_");
  const file = req.file;
  const def = defByClave(clave);

  if (!file) return res.status(400).json({ error: "No se ha subido ningún archivo." });
  if (!def || def.legacy || def.ambito !== "solicitud_alumno" || def.kind === "event") {
    return res.status(400).json({ error: "Tipo de documento no válido para el alumno." });
  }
  if (!workflow.canUpload(def, req.user.rol)) {
    return res.status(403).json({ error: "No puedes subir este tipo de documento." });
  }

  const denied = await assertAlumnoOwnsSolicitud(req, idSolicitudAlumno);
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const [current] = await pool.query(
    `SELECT ev.nombre AS estado
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_solicitud_alumno = ? AND td.nombre = ? AND d.es_actual = 1
      ORDER BY d.id_documento DESC LIMIT 1`,
    [idSolicitudAlumno, clave],
  );
  if (
    req.user.rol === "ALUMNO" &&
    current[0]?.estado === "VALIDADO" &&
    !def.replaceIfValidated
  ) {
    return res.status(400).json({ error: "Un documento validado no se puede reemplazar." });
  }

  try {
    const idDocumento = await saveByClave(clave, { id_solicitud_alumno: idSolicitudAlumno }, file.buffer, provenance(req));
    return res.json({ message: "Documento subido correctamente.", id_documento: idDocumento, clave });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};

exports.getMios = async function (req, res) {
  const idAlumno = await getStudentIdFromUser(req.user.id);
  if (!idAlumno) return res.status(404).json({ error: "No se encontró alumno vinculado a este usuario." });
  const items = await workflow.buildAlumnoList(idAlumno);
  return res.json({ items });
};

// Upload a convenio for a company application
// POST /documentos/empresa/:idSolicitud/convenio
exports.uploadEmpresa = async function (req, res) {
  const idSolicitudEmpresa = parseInt(req.params.idSolicitud, 10);
  const file = req.file;

  if (!file)
    return res.status(400).json({ error: "No se ha subido ningún archivo." });

  // Verify the company user owns this solicitud
  if (req.user.rol === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    const [rows] = await pool.query(
      "SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?",
      [idSolicitudEmpresa],
    );
    if (!rows[0] || rows[0].id_empresa !== idEmpresa) {
      return res.status(403).json({
        error: "No tiene permiso para subir documentos a esta solicitud.",
      });
    }
  }

  try {
    const idDocumento = await saveByClave(
      "CONVENIO",
      { id_solicitud_empresa: idSolicitudEmpresa },
      file.buffer,
      provenance(req),
    );
    return res.json({
      message: "Convenio subido correctamente.",
      id_documento: idDocumento,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};

// Upload the contract annex (Anexo II or Anexo III) for a reservation.
// POST /documentos/reserva/:idReserva/anexo
exports.uploadReserva = async function (req, res) {
  const idReserva = parseInt(req.params.idReserva, 10);
  const file = req.file;

  if (!file)
    return res.status(400).json({ error: "No se ha subido ningún archivo." });

  const [rows] = await pool.query(
    `SELECT se.id_empresa, tc.nombre AS tipo_contrato, er.nombre AS estado_reserva
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitud_empresa_especialidades see
         ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
      WHERE r.id_reserva = ?`,
    [idReserva],
  );
  if (!rows[0]) return res.status(404).json({ error: "Reserva no encontrada." });
  if (req.user.rol === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    if (rows[0].id_empresa !== idEmpresa) {
      return res.status(403).json({ error: "No tiene permiso para subir documentos a esta reserva." });
    }
  }
  const clave = anexoClaveForContrato(rows[0].tipo_contrato);
  if (!clave) {
    return res.status(400).json({ error: "El anexo II o III aparece cuando el centro indica el tipo de contrato." });
  }
  if (rows[0].estado_reserva === "CANCELADA") {
    return res.status(400).json({ error: "No se puede subir documentación de una reserva cancelada." });
  }

  try {
    const idDocumento = await saveByClave(clave, { id_reserva: idReserva }, file.buffer, provenance(req));
    return res.json({
      message: "Documento subido correctamente.",
      id_documento: idDocumento,
      clave,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};

async function loadDocumentoMeta(idDocumento) {
  const [rows] = await pool.query(
    `SELECT
        d.id_documento,
        d.archivo,
        d.id_solicitud_alumno,
        d.id_solicitud_empresa,
        d.id_reserva,
        d.motivo,
        td.nombre AS tipo,
        ev.nombre AS estado_validacion
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_documento = ?`,
    [idDocumento],
  );
  return rows[0] || null;
}

async function empresaOwnsDocumento(idEmpresa, doc) {
  if (!idEmpresa || !doc) return false;
  if (doc.id_solicitud_empresa) {
    const [rows] = await pool.query(
      "SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?",
      [doc.id_solicitud_empresa],
    );
    return rows[0]?.id_empresa === idEmpresa;
  }
  if (doc.id_reserva) {
    const [rows] = await pool.query(
      `SELECT se.id_empresa
         FROM dual_reservas r
         JOIN dual_solicitud_empresa_especialidades see
           ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
        WHERE r.id_reserva = ?`,
      [doc.id_reserva],
    );
    return rows[0]?.id_empresa === idEmpresa;
  }
  return false;
}

// Student CVs belong to the application, not the company. A company may open
// one when it can already see that candidate, or when it has a live reservation.
async function empresaMayViewStudentDocument(idEmpresa, doc) {
  if (!idEmpresa || !doc?.id_solicitud_alumno) return false;
  const def = defByClave(doc.tipo);
  if (!def || def.legacy || def.actor?.EMPRESA === "hidden" || !def.actor?.EMPRESA) return false;

  const [rows] = await pool.query(
    `SELECT sa.id_solicitud_alumno
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
      WHERE sa.id_solicitud_alumno = ?
        AND (
          EXISTS (
            SELECT 1
              FROM dual_reservas r
              JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
              JOIN dual_solicitud_empresa_especialidades ee
                ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
              JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
             WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
               AND se.id_empresa = ?
               AND er.nombre <> 'CANCELADA'
          )
          OR (
            c.activa = 1
            AND sa.id_estado_validacion = (
                  SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
                )
            AND a.id_especialidad_dual IN (
                  SELECT ee.id_especialidad
                    FROM dual_solicitud_empresa_especialidades ee
                    JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
                    JOIN dual_convocatorias ce ON ce.id_convocatoria = se.id_convocatoria
                   WHERE se.id_empresa = ?
                     AND ce.activa = 1
                     AND se.id_estado_validacion = (
                           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
                         )
                )
            AND NOT EXISTS (
                  SELECT 1
                    FROM dual_reservas r
                    JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
                   WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
                     AND er.nombre = 'CONFIRMADA'
                )
          )
        )
      LIMIT 1`,
    [doc.id_solicitud_alumno, idEmpresa, idEmpresa],
  );
  return Boolean(rows[0]);
}

async function alumnoMayDownload(idAlumno, doc) {
  if (!idAlumno || !doc) return false;
  const def = defByClave(doc.tipo);
  if (!workflow.alumnoMaySee(def, doc)) return false;
  if (doc.id_solicitud_alumno) {
    const [rows] = await pool.query(
      "SELECT id_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?",
      [doc.id_solicitud_alumno],
    );
    return rows[0]?.id_alumno === idAlumno;
  }
  if (doc.id_reserva) {
    const [rows] = await pool.query(
      `SELECT sa.id_alumno
         FROM dual_reservas r
         JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
        WHERE r.id_reserva = ?`,
      [doc.id_reserva],
    );
    return rows[0]?.id_alumno === idAlumno;
  }
  if (doc.id_solicitud_empresa) {
    const [rows] = await pool.query(
      `SELECT sa.id_alumno
         FROM dual_reservas r
         JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
         JOIN dual_solicitud_empresa_especialidades ee
           ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
        WHERE se.id_solicitud_empresa = ? AND sa.id_alumno = ?
        LIMIT 1`,
      [doc.id_solicitud_empresa, idAlumno],
    );
    return Boolean(rows[0]);
  }
  return false;
}

async function canDownloadDocumento(user, doc) {
  if (!user || !doc) return false;
  if (user.rol === "ADMINISTRADOR" || user.rol === "COORDINADOR") return true;
  if (user.rol === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(user.id);
    if (await empresaOwnsDocumento(idEmpresa, doc)) return true;
    return empresaMayViewStudentDocument(idEmpresa, doc);
  }
  if (user.rol === "ALUMNO") {
    const idAlumno = await getStudentIdFromUser(user.id);
    return alumnoMayDownload(idAlumno, doc);
  }
  return false;
}

// GET /documentos/:id/descargar — download document blob
exports.descargar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const doc = await loadDocumentoMeta(id);
  if (!doc || !doc.archivo) {
    return res.status(404).json({ error: "Documento no encontrado." });
  }
  if (!(await canDownloadDocumento(req.user, doc))) {
    return res
      .status(403)
      .json({ error: "No tiene permiso para descargar este documento." });
  }

  const pdf = Buffer.isBuffer(doc.archivo)
    ? doc.archivo
    : Buffer.from(doc.archivo);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", pdf.length);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="documento_${id}.pdf"`,
  );
  return res.send(pdf);
};

exports.getEmpresaDocumentos = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa)
    return res.status(404).json({ error: "No se encontró empresa vinculada a este usuario." });
  const items = await workflow.buildEmpresaList(idEmpresa);
  return res.json({ items });
};

// POST /documentos/:id/validar
exports.validar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT
         d.id_solicitud_empresa,
         td.nombre AS tipo_documento
       FROM dual_documentos d
       JOIN dual_tipos_documento td
         ON td.id_tipo_documento = d.id_tipo_documento
       WHERE d.id_documento = ?
       FOR UPDATE`,
      [id],
    );

    const documento = rows[0];

    if (!documento) {
      await conn.rollback();

      return res.status(404).json({
        error: "Documento no encontrado.",
      });
    }

    await conn.query("CALL sp_validar_documento(?)", [id]);

    if (
      documento.tipo_documento === "CONVENIO" &&
      documento.id_solicitud_empresa
    ) {
      await conn.query("CALL sp_validar_solicitud_empresa(?)", [
        documento.id_solicitud_empresa,
      ]);
    }

    await conn.commit();

    return res.json({
      message:
        documento.tipo_documento === "CONVENIO"
          ? "Convenio y empresa validados correctamente."
          : "Documento validado correctamente.",
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// POST /documentos/:id/rechazar
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { motivo } = req.body;
  if (!motivo || !motivo.trim()) {
    return res
      .status(400)
      .json({ error: "Debe indicar el motivo del rechazo." });
  }
  try {
    await pool.query("CALL sp_rechazar_documento(?, ?)", [id, motivo.trim()]);
    return res.json({ message: "Documento rechazado." });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

exports.uploadContexto = async function (req, res) {
  const clave = String(req.body?.clave || "").toUpperCase();
  const def = defByClave(clave);
  const file = req.file;
  if (!def || def.legacy || def.kind === "event") {
    return res.status(400).json({ error: "Tipo de documento no válido." });
  }
  if (!file) return res.status(400).json({ error: "No se ha subido ningún archivo." });
  if (!workflow.canUpload(def, req.user.rol)) {
    return res.status(403).json({ error: "No puedes subir este documento." });
  }

  const idSolicitudAlumno = parseInt(req.body.id_solicitud_alumno, 10) || null;
  const idSolicitudEmpresa = parseInt(req.body.id_solicitud_empresa, 10) || null;
  const idReserva = parseInt(req.body.id_reserva, 10) || null;

  if (def.ambito === "solicitud_alumno") {
    if (!idSolicitudAlumno) return res.status(400).json({ error: "Falta la solicitud del alumno." });
    const denied = await assertAlumnoOwnsSolicitud(req, idSolicitudAlumno);
    if (denied) return res.status(denied.status).json({ error: denied.error });
  }
  if (def.ambito === "solicitud_empresa") {
    if (!idSolicitudEmpresa) return res.status(400).json({ error: "Falta la solicitud de empresa." });
    if (req.user.rol === "EMPRESA") {
      const idEmpresa = await getCompanyIdFromUser(req.user.id);
      const [rows] = await pool.query(
        "SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?",
        [idSolicitudEmpresa],
      );
      if (!rows[0] || rows[0].id_empresa !== idEmpresa) {
        return res.status(403).json({ error: "No puedes subir documentos de otra empresa." });
      }
    }
  }
  if (def.ambito === "reserva") {
    if (!idReserva) return res.status(400).json({ error: "Falta la reserva." });
    if (req.user.rol === "EMPRESA") {
      const idEmpresa = await getCompanyIdFromUser(req.user.id);
      const [rows] = await pool.query(
        `SELECT se.id_empresa
           FROM dual_reservas r
           JOIN dual_solicitud_empresa_especialidades ee
             ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
           JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
          WHERE r.id_reserva = ?`,
        [idReserva],
      );
      if (!rows[0] || rows[0].id_empresa !== idEmpresa) {
        return res.status(403).json({ error: "No puedes subir documentos de otra empresa." });
      }
    }
  }

  const parentSql =
    def.ambito === "solicitud_alumno"
      ? "d.id_solicitud_alumno = ?"
      : def.ambito === "solicitud_empresa"
        ? "d.id_solicitud_empresa = ?"
        : "d.id_reserva = ?";
  const parentId =
    def.ambito === "solicitud_alumno"
      ? idSolicitudAlumno
      : def.ambito === "solicitud_empresa"
        ? idSolicitudEmpresa
        : idReserva;
  const [current] = await pool.query(
    `SELECT ev.nombre AS estado
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE ${parentSql} AND td.nombre = ? AND d.es_actual = 1
      ORDER BY d.id_documento DESC LIMIT 1`,
    [parentId, clave],
  );
  if (current[0]?.estado === "VALIDADO" && !def.replaceIfValidated && req.user.rol !== "ADMINISTRADOR" && req.user.rol !== "COORDINADOR") {
    return res.status(400).json({ error: "Un documento validado no se puede reemplazar." });
  }

  try {
    const idDocumento = await saveByClave(
      clave,
      {
        id_solicitud_alumno: def.ambito === "solicitud_alumno" ? idSolicitudAlumno : null,
        id_solicitud_empresa: def.ambito === "solicitud_empresa" ? idSolicitudEmpresa : null,
        id_reserva: def.ambito === "reserva" ? idReserva : null,
      },
      file.buffer,
      provenance(req),
    );
    return res.json({ message: "Documento subido correctamente.", id_documento: idDocumento, clave });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};

exports.firmar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const doc = await loadDocumentoMeta(id);
  if (!doc || !doc.archivo) return res.status(404).json({ error: "No hay un documento que firmar." });
  const def = defByClave(doc.tipo);
  if (!def?.signers?.length) {
    return res.status(400).json({ error: "Este documento no requiere firma." });
  }
  const rolFirma = workflow.actorOf(req.user.rol);
  if (!def.signers.includes(rolFirma)) {
    return res.status(403).json({ error: "Tu rol no firma este documento." });
  }
  if (!(await canDownloadDocumento(req.user, doc))) {
    return res.status(403).json({ error: "No puedes firmar este documento." });
  }
  await pool.query(
    `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en)
     VALUES (?, ?, 'FIRMADO', NOW())
     ON DUPLICATE KEY UPDATE estado = 'FIRMADO', firmado_en = NOW()`,
    [id, rolFirma],
  );
  return res.json({ message: "Firma registrada.", rol: rolFirma, estado: "FIRMADO" });
};

exports.firmarContexto = async function (req, res) {
  const clave = String(req.body?.clave || "").toUpperCase();
  const idReserva = parseInt(req.body?.id_reserva, 10);
  const def = defByClave(clave);
  if (!def?.signers?.length || !idReserva) {
    return res.status(400).json({ error: "No se puede registrar la firma." });
  }
  const rolFirma = workflow.actorOf(req.user.rol);
  if (!def.signers.includes(rolFirma)) {
    return res.status(403).json({ error: "Tu rol no firma este documento." });
  }
  const idTipo = await workflow.tipoIdByNombre(clave);
  if (!idTipo) return res.status(400).json({ error: "Tipo de documento no configurado." });

  if (req.user.rol === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    const [own] = await pool.query(
      `SELECT se.id_empresa
         FROM dual_reservas r
         JOIN dual_solicitud_empresa_especialidades ee
           ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
        WHERE r.id_reserva = ?`,
      [idReserva],
    );
    if (!own[0] || own[0].id_empresa !== idEmpresa) {
      return res.status(403).json({ error: "No puedes firmar documentos de otra empresa." });
    }
  }
  if (req.user.rol === "ALUMNO") {
    const idAlumno = await getStudentIdFromUser(req.user.id);
    const [own] = await pool.query(
      `SELECT sa.id_alumno
         FROM dual_reservas r
         JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
        WHERE r.id_reserva = ?`,
      [idReserva],
    );
    if (!own[0] || own[0].id_alumno !== idAlumno) {
      return res.status(403).json({ error: "No puedes firmar documentos de otra reserva." });
    }
  }

  const [existing] = await pool.query(
    `SELECT id_documento, CASE WHEN archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo
       FROM dual_documentos
      WHERE id_reserva = ? AND id_tipo_documento = ? AND es_actual = 1
      ORDER BY id_documento DESC LIMIT 1`,
    [idReserva, idTipo],
  );
  if (!existing[0]?.tiene_archivo) {
    return res.status(400).json({ error: "No hay un documento que firmar." });
  }
  const idDocumento = existing[0].id_documento;
  const doc = await loadDocumentoMeta(idDocumento);
  if (!(await canDownloadDocumento(req.user, doc))) {
    return res.status(403).json({ error: "No puedes firmar este documento." });
  }
  await pool.query(
    `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en)
     VALUES (?, ?, 'FIRMADO', NOW())
     ON DUPLICATE KEY UPDATE estado = 'FIRMADO', firmado_en = NOW()`,
    [idDocumento, rolFirma],
  );
  return res.json({ message: "Firma registrada.", id_documento: idDocumento, rol: rolFirma, estado: "FIRMADO" });
};

exports.seguimiento = async function (req, res) {
  const page = await workflow.queryStaffPage(req.query || {});
  return res.json(page);
};

exports.generar = async function (req, res) {
  const clave = String(req.body?.clave || "").toUpperCase();
  const def = defByClave(clave);
  if (!def?.generated) {
    return res.status(400).json({ error: "Este documento no se genera desde plantilla." });
  }
  const parents = {
    id_solicitud_alumno: null,
    id_solicitud_empresa: def.ambito === "solicitud_empresa" ? parseInt(req.body.id_solicitud_empresa, 10) || null : null,
    id_reserva: def.ambito === "reserva" ? parseInt(req.body.id_reserva, 10) || null : null,
  };
  if (def.ambito === "solicitud_empresa" && !parents.id_solicitud_empresa) {
    return res.status(400).json({ error: "Falta la solicitud de empresa." });
  }
  if (def.ambito === "reserva" && !parents.id_reserva) {
    return res.status(400).json({ error: "Falta la reserva." });
  }
  try {
    const result = await generateDocument({
      clave,
      parents,
      userId: req.user.id,
      regenerar: Boolean(req.body?.regenerar),
    });
    if (!result.ok) {
      return res.status(409).json({
        error: `No hay una plantilla activa para generar ${def.nombre}.`,
        code: result.code,
      });
    }
    return res.json({
      message: `${def.nombre} generado correctamente.`,
      id_documento: result.id_documento,
      clave,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};
