const pool = require("../db/pool");
const { defByClave } = require("./documentCatalogue");
const workflow = require("./documentosWorkflow");

function extractIdDocumento(results) {
  const queue = [results];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    if (current && typeof current === "object" && current.id_documento != null) {
      return current.id_documento;
    }
  }
  return null;
}

async function resolveDocumentoId(results, whereSql, params) {
  const fromCall = extractIdDocumento(results);
  if (fromCall != null) return fromCall;
  const [rows] = await pool.query(
    `SELECT id_documento FROM dual_documentos WHERE ${whereSql} ORDER BY id_documento DESC LIMIT 1`,
    params,
  );
  return rows[0]?.id_documento ?? null;
}

async function saveByClave(clave, parents, buffer, provenance = {}) {
  const idTipo = await workflow.tipoIdByNombre(clave);
  if (!idTipo) {
    const err = new Error("Tipo de documento no configurado.");
    err.status = 400;
    throw err;
  }
  const origen = provenance.origen === "GENERADO" ? "GENERADO" : "SUBIDA";
  const idUsuario = provenance.idUsuario || null;
  const idPlantilla = provenance.idPlantilla || null;

  const [results] = await pool.query("CALL sp_guardar_documento(?, ?, ?, ?, ?)", [
    parents.id_solicitud_alumno || null,
    parents.id_solicitud_empresa || null,
    parents.id_reserva || null,
    idTipo,
    buffer,
  ]);
  const idDocumento = await resolveDocumentoId(
    results,
    parents.id_solicitud_alumno
      ? "id_solicitud_alumno = ? AND id_tipo_documento = ?"
      : parents.id_solicitud_empresa
        ? "id_solicitud_empresa = ? AND id_tipo_documento = ?"
        : "id_reserva = ? AND id_tipo_documento = ?",
    [parents.id_solicitud_alumno || parents.id_solicitud_empresa || parents.id_reserva, idTipo],
  );
  const def = defByClave(clave);
  if (!idDocumento) return null;

  await pool.query(
    `UPDATE dual_documentos
        SET estado_workflow = ?,
            id_usuario_origen = ?,
            origen_documento = ?,
            id_plantilla = ?,
            registrado_en = NOW()
      WHERE id_documento = ?`,
    [def?.workflowOnUpload || "SUBIDO", idUsuario, origen, idPlantilla, idDocumento],
  );

  if (def?.signers?.length) {
    for (const rol of def.signers) {
      await pool.query(
        `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en)
         VALUES (?, ?, 'SIN_FIRMAR', NULL)
         ON DUPLICATE KEY UPDATE estado = 'SIN_FIRMAR', firmado_en = NULL`,
        [idDocumento, rol],
      );
    }
  }
  return idDocumento;
}

module.exports = { saveByClave };
