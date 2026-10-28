// Append-only audit trail (dual_eventos, migration 013; decision D5).
// Records ids and states only: never names, DNIs, emails, passwords or files.
// Pass the transaction's connection when there is one, so the event commits or
// rolls back with the change it describes.
const pool = require("../db/pool");

const ENTIDADES = ["SOLICITUD_ALUMNO", "SOLICITUD_EMPRESA", "RESERVA", "DOCUMENTO", "USUARIO"];

function actorFrom(user) {
  return { id: user?.id || null, rol: user?.rol || null };
}

async function recordEvent(conn, { entidad, id, accion, antes = null, despues = null, user = null, motivo = null, detalle = null }) {
  if (!ENTIDADES.includes(entidad)) throw new Error(`Entidad de auditoría no válida: ${entidad}`);
  const actor = actorFrom(user);
  await (conn || pool).query(
    `INSERT INTO dual_eventos
       (entidad, id_entidad, accion, estado_anterior, estado_nuevo, id_usuario, rol_usuario, motivo, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entidad, id, accion, antes, despues, actor.id, actor.rol, motivo, detalle ? JSON.stringify(detalle) : null],
  );
}

// For changes made by a procedure that commits on its own (sp_reservar_alumno,
// sp_confirmar_reserva, …): the change is already durable, so a failure to log
// must not turn a successful request into an error. It is reported instead.
async function recordEventAfterCommit(event) {
  try {
    await recordEvent(pool, event);
  } catch (err) {
    console.error("[auditoría] no se pudo registrar el evento", event.entidad, event.id, event.accion, err.message);
  }
}

module.exports = { recordEvent, recordEventAfterCommit, ENTIDADES };
