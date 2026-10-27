// Review transitions shared by student and company applications:
// PENDIENTE → VALIDADO | RECHAZADO, and RECHAZADO → PENDIENTE (reopen, D7).
// The row is locked, the rule is checked (estadoReglas.solicitudTransicion),
// the change is made and the audit event recorded in one transaction.
const pool = require("../db/pool");
const { recordEvent } = require("./auditLog");
const { solicitudTransicion } = require("./estadoReglas");
const notificar = require("./notificaciones");

const ENTIDADES = {
  SOLICITUD_ALUMNO: {
    table: "dual_solicitudes_alumno",
    pk: "id_solicitud_alumno",
    validar: "sp_validar_solicitud_alumno",
    rechazar: "sp_rechazar_solicitud_alumno",
  },
  SOLICITUD_EMPRESA: {
    table: "dual_solicitudes_empresa",
    pk: "id_solicitud_empresa",
    validar: "sp_validar_solicitud_empresa",
    rechazar: "sp_rechazar_solicitud_empresa",
  },
};

const ESTADO_NUEVO = { VALIDAR: "VALIDADO", RECHAZAR: "RECHAZADO", REABRIR: "PENDIENTE" };

// Returns { ok: true } or { status, error, code }. SQL errors are thrown.
async function aplicarTransicion(entidad, id, accion, { user = null, motivo = null } = {}) {
  const cfg = ENTIDADES[entidad];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT ev.nombre AS estado, c.activa
         FROM ${cfg.table} s
         JOIN dual_estados_validacion ev ON ev.id_estado_validacion = s.id_estado_validacion
         JOIN dual_convocatorias c ON c.id_convocatoria = s.id_convocatoria
        WHERE s.${cfg.pk} = ?
        FOR UPDATE`,
      [id],
    );
    const denied = solicitudTransicion(rows[0]?.estado || null, accion, {
      convocatoriaActiva: Number(rows[0]?.activa) === 1,
    });
    if (denied) {
      await conn.rollback();
      return denied;
    }

    if (accion === "VALIDAR") {
      await conn.query(`CALL ${cfg.validar}(?)`, [id]);
    } else if (accion === "RECHAZAR") {
      await conn.query(`CALL ${cfg.rechazar}(?, ?)`, [id, motivo]);
    } else {
      await conn.query(
        `UPDATE ${cfg.table}
            SET id_estado_validacion = (
                  SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1
                ),
                motivo = NULL
          WHERE ${cfg.pk} = ?`,
        [id],
      );
    }
    await recordEvent(conn, {
      entidad, id, accion,
      antes: rows[0].estado, despues: ESTADO_NUEVO[accion], user, motivo,
    });
    await conn.commit();
    // After commit only; reopening is internal and sends nothing.
    if (accion !== "REABRIR") {
      const enviar = entidad === "SOLICITUD_ALUMNO" ? notificar.solicitudAlumno : notificar.solicitudEmpresa;
      enviar(id, ESTADO_NUEVO[accion], motivo);
    }
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { aplicarTransicion };
