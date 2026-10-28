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
const { recordEvent } = require("./auditLog");
const reglas = require("./estadoReglas");
const notificar = require("./notificaciones");

function provenance(req) {
  return { origen: "SUBIDA", idUsuario: req.user?.id || null, rol: req.user?.rol || null };
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

// SEC-5: single upload guard used by every upload endpoint.
// Checks, in order: document type, catalogue permission for the role,
// parent exists and belongs to the caller, reservation state and contract
// family, and the "validated documents cannot be replaced" rule.
async function assertCanUpload(req, def, parents = {}) {
  const rol = req.user?.rol;
  if (!def || def.legacy || def.kind === "event") {
    return { status: 400, error: "Tipo de documento no válido." };
  }
  if (!workflow.canUpload(def, rol)) {
    return { status: 403, error: "No puedes subir este tipo de documento." };
  }

  let parentSql;
  let parentId;

  if (def.ambito === "solicitud_alumno") {
    parentId = parents.idSolicitudAlumno;
    if (!parentId) return { status: 400, error: "Falta la solicitud del alumno." };
    const [rows] = await pool.query(
      "SELECT id_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?",
      [parentId],
    );
    if (!rows[0]) return { status: 404, error: "Solicitud no encontrada." };
    const denied = await assertAlumnoOwnsSolicitud(req, parentId);
    if (denied) return denied;
    parentSql = "d.id_solicitud_alumno = ?";
  } else if (def.ambito === "solicitud_empresa") {
    parentId = parents.idSolicitudEmpresa;
    if (!parentId) return { status: 400, error: "Falta la solicitud de empresa." };
    const [rows] = await pool.query(
      "SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?",
      [parentId],
    );
    if (!rows[0]) return { status: 404, error: "Solicitud de empresa no encontrada." };
    if (rol === "EMPRESA") {
      const idEmpresa = await getCompanyIdFromUser(req.user.id);
      if (!idEmpresa || rows[0].id_empresa !== idEmpresa) {
        return { status: 403, error: "No puedes subir documentos de otra empresa." };
      }
    }
    parentSql = "d.id_solicitud_empresa = ?";
  } else if (def.ambito === "reserva") {
    parentId = parents.idReserva;
    if (!parentId) return { status: 400, error: "Falta la reserva." };
    const [rows] = await pool.query(
      `SELECT se.id_empresa, tc.nombre AS tipo_contrato, er.nombre AS estado_reserva
         FROM dual_reservas r
         JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
         JOIN dual_solicitud_empresa_especialidades see
           ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
        WHERE r.id_reserva = ?`,
      [parentId],
    );
    if (!rows[0]) return { status: 404, error: "Reserva no encontrada." };
    if (rol === "EMPRESA") {
      const idEmpresa = await getCompanyIdFromUser(req.user.id);
      if (!idEmpresa || rows[0].id_empresa !== idEmpresa) {
        return { status: 403, error: "No tiene permiso para subir documentos a esta reserva." };
      }
    }
    if (rows[0].estado_reserva === "CANCELADA") {
      return { status: 400, error: "No se puede subir documentación de una reserva cancelada." };
    }
    if (def.contractFamily) {
      const clave = anexoClaveForContrato(rows[0].tipo_contrato);
      if (!clave) {
        return { status: 400, error: "El anexo II o III aparece cuando el centro indica el tipo de contrato." };
      }
      if (clave !== def.clave) {
        return { status: 400, error: `Para el tipo de contrato de esta reserva corresponde el ${clave === "ANEXO_III" ? "Anexo III" : "Anexo II"}.` };
      }
    }
    parentSql = "d.id_reserva = ?";
  } else {
    return { status: 400, error: "Tipo de documento no válido." };
  }

  const [current] = await pool.query(
    `SELECT ev.nombre AS estado
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE ${parentSql} AND td.nombre = ? AND d.es_actual = 1
      ORDER BY d.id_documento DESC LIMIT 1`,
    [parentId, def.clave],
  );
  if (current[0]?.estado === "VALIDADO" && !def.replaceIfValidated) {
    return { status: 400, error: "Un documento validado no se puede reemplazar." };
  }
  return null;
}

// Saves after the guard; shared by every upload endpoint.
async function guardedSave(req, res, def, parents, successMessage) {
  if (!req.file) return res.status(400).json({ error: "No se ha subido ningún archivo." });
  const denied = await assertCanUpload(req, def, parents);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  try {
    const idDocumento = await saveByClave(
      def.clave,
      {
        id_solicitud_alumno: def.ambito === "solicitud_alumno" ? parents.idSolicitudAlumno : null,
        id_solicitud_empresa: def.ambito === "solicitud_empresa" ? parents.idSolicitudEmpresa : null,
        id_reserva: def.ambito === "reserva" ? parents.idReserva : null,
      },
      req.file.buffer,
      provenance(req),
    );
    return res.json({ message: successMessage, id_documento: idDocumento, clave: def.clave });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
}

exports.assertCanUpload = assertCanUpload;

// Upload a document for a student application
// POST /documentos/alumno/:idSolicitud/:tipo
exports.uploadAlumno = async function (req, res) {
  const idSolicitudAlumno = parseInt(req.params.idSolicitud, 10) || null;
  const clave = String(req.params.tipo || "").toUpperCase().replace(/-/g, "_");
  const def = defByClave(clave);
  if (def && def.ambito !== "solicitud_alumno") {
    return res.status(400).json({ error: "Tipo de documento no válido para el alumno." });
  }
  return guardedSave(req, res, def, { idSolicitudAlumno }, "Documento subido correctamente.");
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
  const idSolicitudEmpresa = parseInt(req.params.idSolicitud, 10) || null;
  return guardedSave(req, res, defByClave("CONVENIO"), { idSolicitudEmpresa }, "Convenio subido correctamente.");
};

// Upload the contract annex (Anexo II or Anexo III) for a reservation.
// POST /documentos/reserva/:idReserva/anexo
// The annex is chosen from the stored contract type; the guard re-checks it.
exports.uploadReserva = async function (req, res) {
  const idReserva = parseInt(req.params.idReserva, 10) || null;
  if (!idReserva) return res.status(400).json({ error: "Falta la reserva." });
  const [rows] = await pool.query(
    `SELECT tc.nombre AS tipo_contrato
       FROM dual_reservas r
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
      WHERE r.id_reserva = ?`,
    [idReserva],
  );
  if (!rows[0]) return res.status(404).json({ error: "Reserva no encontrada." });
  const clave = anexoClaveForContrato(rows[0].tipo_contrato);
  if (!clave) {
    return res.status(400).json({ error: "El anexo II o III aparece cuando el centro indica el tipo de contrato." });
  }
  return guardedSave(req, res, defByClave(clave), { idReserva }, "Documento subido correctamente.");
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
            AND sa.id_especialidad IN (
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
    // SEC-008: the SPA reads the file as a blob, so it is never rendered on the
    // API origin; `attachment` keeps a direct visit from rendering it either.
    `attachment; filename="documento_${id}.pdf"`,
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

// Locks the document and its parent for a review or signature. Parent first,
// then the document — the order of uploads (documentosStore) and confirmations
// (migration 018); taking the document first could deadlock with them. The
// parent of a document never changes, so a plain read finds it.
async function lockDocumento(conn, id) {
  const [[padre]] = await conn.query(
    "SELECT id_solicitud_alumno, id_solicitud_empresa, id_reserva FROM dual_documentos WHERE id_documento = ?",
    [id],
  );
  if (!padre) return null;
  if (padre.id_reserva) {
    await conn.query("SELECT id_reserva FROM dual_reservas WHERE id_reserva = ? FOR UPDATE", [padre.id_reserva]);
  } else if (padre.id_solicitud_empresa) {
    await conn.query(
      "SELECT id_solicitud_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ? FOR UPDATE",
      [padre.id_solicitud_empresa],
    );
  } else if (padre.id_solicitud_alumno) {
    await conn.query(
      "SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ? FOR UPDATE",
      [padre.id_solicitud_alumno],
    );
  }
  const [rows] = await conn.query(
    `SELECT
        d.id_documento,
        d.id_solicitud_alumno,
        d.id_solicitud_empresa,
        d.id_reserva,
        d.es_actual,
        d.firmas_exentas_legacy,
        CASE WHEN d.archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo,
        td.nombre AS tipo,
        ev.nombre AS estado_validacion,
        er.nombre AS estado_reserva,
        ev_se.nombre AS estado_solicitud_empresa
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
       LEFT JOIN dual_reservas r ON r.id_reserva = d.id_reserva
       LEFT JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = d.id_solicitud_empresa
       LEFT JOIN dual_estados_validacion ev_se ON ev_se.id_estado_validacion = se.id_estado_validacion
      WHERE d.id_documento = ?
      FOR UPDATE OF d, r, se`,
    [id],
  );
  return rows[0] || null;
}

async function firmasDe(conn, idDocumento) {
  const [rows] = await conn.query(
    "SELECT rol, estado, metodo FROM dual_documento_firmas WHERE id_documento = ?",
    [idDocumento],
  );
  return rows;
}

// POST /documentos/:id/validar
// D1: every applicable signature first; then staff review. A validated
// CONVENIO also validates a PENDIENTE company application.
exports.validar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Documento no válido." });
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const doc = await lockDocumento(conn, id);
    const def = doc ? defByClave(doc.tipo) : null;
    const firmas = doc ? await firmasDe(conn, id) : [];
    const denied = reglas.documentoValidable(def, doc, firmas);
    if (denied) {
      await conn.rollback();
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }

    await conn.query("CALL sp_validar_documento(?)", [id]);
    await recordEvent(conn, {
      entidad: "DOCUMENTO", id, accion: "VALIDAR",
      antes: doc.estado_validacion, despues: "VALIDADO", user: req.user,
      detalle: { clave: doc.tipo, ...(Number(doc.firmas_exentas_legacy) ? { firmas_exentas_legacy: true } : {}) },
    });

    let empresaValidada = false;
    if (doc.tipo === "CONVENIO" && doc.id_solicitud_empresa && doc.estado_solicitud_empresa === "PENDIENTE") {
      await conn.query("CALL sp_validar_solicitud_empresa(?)", [doc.id_solicitud_empresa]);
      await recordEvent(conn, {
        entidad: "SOLICITUD_EMPRESA", id: doc.id_solicitud_empresa, accion: "VALIDAR",
        antes: "PENDIENTE", despues: "VALIDADO", user: req.user,
        detalle: { por_convenio: id },
      });
      empresaValidada = true;
    }

    await conn.commit();
    if (empresaValidada) notificar.solicitudEmpresa(doc.id_solicitud_empresa, "VALIDADO");
    return res.json({
      message: empresaValidada
        ? "Convenio y empresa validados correctamente."
        : "Documento validado correctamente.",
      empresa_validada: empresaValidada,
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// POST /documentos/:id/rechazar
// The company application is NOT changed when its convenio is rejected: the
// rule for already-validated companies (decision D6) is still open.
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const motivo = String(req.body?.motivo || "").trim();
  if (!id) return res.status(400).json({ error: "Documento no válido." });
  if (!motivo) {
    return res.status(400).json({ error: "Debe indicar el motivo del rechazo." });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await lockDocumento(conn, id);
    const def = doc ? defByClave(doc.tipo) : null;
    const denied = reglas.documentoRechazable(def, doc);
    if (denied) {
      await conn.rollback();
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }
    await conn.query("CALL sp_rechazar_documento(?, ?)", [id, motivo]);
    await recordEvent(conn, {
      entidad: "DOCUMENTO", id, accion: "RECHAZAR",
      antes: doc.estado_validacion, despues: "RECHAZADO", user: req.user, motivo,
      detalle: {
        clave: doc.tipo,
        ...(doc.tipo === "CONVENIO" && doc.estado_solicitud_empresa === "VALIDADO"
          ? { empresa_validada_sin_cambios: doc.id_solicitud_empresa }
          : {}),
      },
    });
    await conn.commit();
    notificar.documentoRechazado(id, motivo);
    return res.json({ message: "Documento rechazado." });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.uploadContexto = async function (req, res) {
  const clave = String(req.body?.clave || "").toUpperCase();
  const def = defByClave(clave);
  const parents = {
    idSolicitudAlumno: parseInt(req.body?.id_solicitud_alumno, 10) || null,
    idSolicitudEmpresa: parseInt(req.body?.id_solicitud_empresa, 10) || null,
    idReserva: parseInt(req.body?.id_reserva, 10) || null,
  };
  return guardedSave(req, res, def, parents, "Documento subido correctamente.");
};

// Records the caller's signature (method CONFIRMACION_APP) on the current file.
async function registrarFirma(req, res, idDocumento) {
  const rolFirma = workflow.actorOf(req.user.rol);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await lockDocumento(conn, idDocumento);
    const def = doc ? defByClave(doc.tipo) : null;
    const denied = reglas.documentoFirmable(def, doc, rolFirma);
    if (denied) {
      await conn.rollback();
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }
    if (!(await canDownloadDocumento(req.user, { ...doc, tipo: doc.tipo }))) {
      await conn.rollback();
      return res.status(403).json({ error: "No puedes firmar este documento." });
    }
    const previa = (await firmasDe(conn, idDocumento)).find((f) => f.rol === rolFirma);
    if (previa?.estado === "FIRMADO") {
      await conn.rollback();
      return res.json({ message: "La firma ya estaba registrada.", id_documento: idDocumento, rol: rolFirma, estado: "FIRMADO" });
    }
    await conn.query(
      `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, firmado_por, metodo)
       VALUES (?, ?, 'FIRMADO', NOW(), ?, 'CONFIRMACION_APP')
       ON DUPLICATE KEY UPDATE estado = 'FIRMADO', firmado_en = NOW(), firmado_por = ?, metodo = 'CONFIRMACION_APP'`,
      [idDocumento, rolFirma, req.user.id, req.user.id],
    );
    await recordEvent(conn, {
      entidad: "DOCUMENTO", id: idDocumento, accion: "FIRMAR",
      antes: "SIN_FIRMAR", despues: "FIRMADO", user: req.user,
      detalle: { clave: doc.tipo, rol_firma: rolFirma, metodo: "CONFIRMACION_APP" },
    });
    await conn.commit();
    return res.json({ message: "Firma registrada.", id_documento: idDocumento, rol: rolFirma, estado: "FIRMADO" });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
}

exports.firmar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Documento no válido." });
  return registrarFirma(req, res, id);
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
    `SELECT id_documento
       FROM dual_documentos
      WHERE id_reserva = ? AND id_tipo_documento = ? AND es_actual = 1 AND archivo IS NOT NULL
      ORDER BY id_documento DESC LIMIT 1`,
    [idReserva, idTipo],
  );
  if (!existing[0]) {
    return res.status(400).json({ error: "No hay un documento que firmar." });
  }
  return registrarFirma(req, res, existing[0].id_documento);
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
  if (def.ambito === "reserva") {
    const [rows] = await pool.query(
      `SELECT er.nombre AS estado_reserva, tc.nombre AS tipo_contrato
         FROM dual_reservas r
         JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
        WHERE r.id_reserva = ?`,
      [parents.id_reserva],
    );
    if (!rows[0]) return res.status(404).json({ error: "Reserva no encontrada." });
    if (rows[0].estado_reserva === "CANCELADA") {
      return res.status(400).json({ error: "No se genera documentación de una reserva cancelada." });
    }
    if (def.contractFamily && anexoClaveForContrato(rows[0].tipo_contrato) !== def.clave) {
      return res.status(400).json({ error: "Este anexo no corresponde al tipo de contrato de la reserva." });
    }
  }
  try {
    const result = await generateDocument({
      clave,
      parents,
      userId: req.user.id,
      userRol: req.user.rol,
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
