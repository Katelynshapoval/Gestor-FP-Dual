const pool = require("../db/pool");
const { defByClave } = require("./documentCatalogue");
const workflow = require("./documentosWorkflow");
const { recordEvent } = require("./auditLog");

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

async function resolveDocumentoId(conn, results, whereSql, params) {
  const fromCall = extractIdDocumento(results);
  if (fromCall != null) return fromCall;
  const [rows] = await conn.query(
    `SELECT id_documento FROM dual_documentos WHERE ${whereSql} ORDER BY id_documento DESC LIMIT 1`,
    params,
  );
  return rows[0]?.id_documento ?? null;
}

// Runs fn(conn) inside a transaction, or inside the caller's one when given.
async function withTransaction(conn, fn) {
  if (conn) return fn(conn);
  const own = await pool.getConnection();
  try {
    await own.beginTransaction();
    const out = await fn(own);
    await own.commit();
    return out;
  } catch (err) {
    await own.rollback();
    throw err;
  } finally {
    own.release();
  }
}

// PM-6: the procedure (which archives the previous version), the provenance
// update, the signature reset and the audit event commit together.
// provenance: { origen: 'SUBIDA'|'GENERADO', idUsuario, rol, idPlantilla }
async function saveByClave(clave, parents, buffer, provenance = {}, { conn = null } = {}) {
  const def = defByClave(clave);
  return withTransaction(conn, async (tx) => {
    // DB-03: two simultaneous first uploads for the same parent would both insert.
    // Locking the parent row serialises them; uq_dd_actual (migration 017) is the
    // backstop. The lock goes first: under REPEATABLE READ an earlier plain read
    // would fix the snapshot before the wait, hiding the other upload's row.
    const [tabla, columna, idPadre] = parents.id_solicitud_alumno
      ? ["dual_solicitudes_alumno", "id_solicitud_alumno", parents.id_solicitud_alumno]
      : parents.id_solicitud_empresa
        ? ["dual_solicitudes_empresa", "id_solicitud_empresa", parents.id_solicitud_empresa]
        : ["dual_reservas", "id_reserva", parents.id_reserva];
    await tx.query(`SELECT ${columna} FROM ${tabla} WHERE ${columna} = ? FOR UPDATE`, [idPadre]);

    const idTipo = await workflow.tipoIdByNombre(clave, tx);
    if (!idTipo) {
      const err = new Error("Tipo de documento no configurado.");
      err.status = 400;
      throw err;
    }
    const origen = provenance.origen === "GENERADO" ? "GENERADO" : "SUBIDA";
    const idUsuario = provenance.idUsuario || null;
    const idPlantilla = provenance.idPlantilla || null;

    const [results] = await tx.query("CALL sp_guardar_documento(?, ?, ?, ?, ?)", [
      parents.id_solicitud_alumno || null,
      parents.id_solicitud_empresa || null,
      parents.id_reserva || null,
      idTipo,
      buffer,
    ]);
    const idDocumento = await resolveDocumentoId(
      tx,
      results,
      parents.id_solicitud_alumno
        ? "id_solicitud_alumno = ? AND id_tipo_documento = ?"
        : parents.id_solicitud_empresa
          ? "id_solicitud_empresa = ? AND id_tipo_documento = ?"
          : "id_reserva = ? AND id_tipo_documento = ?",
      [parents.id_solicitud_alumno || parents.id_solicitud_empresa || parents.id_reserva, idTipo],
    );
    if (!idDocumento) return null;

    // A new file is never covered by a legacy signature exemption.
    await tx.query(
      `UPDATE dual_documentos
          SET estado_workflow = ?,
              id_usuario_origen = ?,
              origen_documento = ?,
              id_plantilla = ?,
              registrado_en = NOW(),
              firmas_exentas_legacy = 0
        WHERE id_documento = ?`,
      [def?.workflowOnUpload || "SUBIDO", idUsuario, origen, idPlantilla, idDocumento],
    );

    // Signatures belong to a file: a new file starts unsigned. D1: when the
    // uploader is one of the signers, the upload is their attestation that the
    // file carries their signature (not a cryptographic check).
    const attestingRole = origen === "SUBIDA" && provenance.rol ? workflow.actorOf(provenance.rol) : null;
    for (const rol of def?.signers || []) {
      if (rol === attestingRole) {
        await tx.query(
          `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, firmado_por, metodo)
           VALUES (?, ?, 'FIRMADO', NOW(), ?, 'SUBIDA_FIRMADA')
           ON DUPLICATE KEY UPDATE estado = 'FIRMADO', firmado_en = NOW(), firmado_por = ?, metodo = 'SUBIDA_FIRMADA'`,
          [idDocumento, rol, idUsuario, idUsuario],
        );
      } else {
        await tx.query(
          `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, firmado_por, metodo)
           VALUES (?, ?, 'SIN_FIRMAR', NULL, NULL, NULL)
           ON DUPLICATE KEY UPDATE estado = 'SIN_FIRMAR', firmado_en = NULL, firmado_por = NULL, metodo = NULL`,
          [idDocumento, rol],
        );
      }
    }

    await recordEvent(tx, {
      entidad: "DOCUMENTO",
      id: idDocumento,
      accion: origen === "GENERADO" ? "GENERAR" : "SUBIR",
      despues: "PENDIENTE",
      user: idUsuario ? { id: idUsuario, rol: provenance.rol || null } : null,
      detalle: {
        clave,
        ...(idPlantilla ? { id_plantilla: idPlantilla } : {}),
        ...(attestingRole && def?.signers?.includes(attestingRole) ? { firma_declarada: attestingRole } : {}),
      },
    });
    return idDocumento;
  });
}

module.exports = { saveByClave, withTransaction };
