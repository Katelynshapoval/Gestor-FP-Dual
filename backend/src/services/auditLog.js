// Append-only audit trail (dual_eventos, migration 013; decision D5).
// Records ids and states only: never names, DNIs, emails, passwords or files.
//
// Stage 2 (D6): pass the transaction's connection, so the event commits or rolls
// back with the change it describes; a failure to write the event fails the
// change. The former recordEventAfterCommit (log after a procedure had already
// committed, ignore failures) is gone: reservation procedures now run inside the
// caller's transaction (src/db/transaction.js).
const pool = require("../db/pool");

// OFERTA and TUTOR since migration 018, USUARIO since 019 (chk_de_entidad).
const ENTIDADES = ["SOLICITUD_ALUMNO", "SOLICITUD_EMPRESA", "RESERVA", "DOCUMENTO", "OFERTA", "TUTOR", "USUARIO"];

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

module.exports = { recordEvent, ENTIDADES };
