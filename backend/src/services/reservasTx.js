// Reservation transitions inside a caller-owned transaction (Stage 2, D6).
//
// Every function takes the connection of inTransaction() (src/db/transaction.js),
// runs one procedure on it and records the audit event on the SAME connection, so
// the change and its event commit or roll back together. This is the only module
// that calls sp_reservar_alumno, sp_confirmar_reserva, sp_reasignar_reserva,
// sp_cancelar_reserva and sp_cancelar_reserva_admin (a test checks it); the
// procedures themselves refuse to run outside a transaction (migration 018).
//
// Lock order (018): student application → company application → offers
// (ascending id) → reservations. Nothing changes a reservation's state without
// holding its offer. Functions that lock rows before the procedure follow it.
const { callProcedure, callProcedureWithResult } = require("../helpers/dbHelpers");
const { recordEvent } = require("./auditLog");
const { ESTADOS_RESERVA } = require("../constants/reservaEstados");

function assertConn(conn) {
  if (!conn || typeof conn.query !== "function" || typeof conn.release !== "function") {
    throw new Error("reservasTx necesita la conexión de inTransaction().");
  }
}

// First step of every transition that touches a student's other reservations:
// lock the student application, as the procedures do, BEFORE any reservation row
// (taking the reservation first would invert the order and can deadlock with
// sp_reservar_alumno). The application of a reservation never changes, so a
// plain read finds it. Returns id_solicitud_alumno or null.
async function bloquearSolicitudDeReserva(conn, idReserva) {
  const [rows] = await conn.query("SELECT id_solicitud_alumno FROM dual_reservas WHERE id_reserva = ?", [idReserva]);
  if (!rows[0]) return null;
  await conn.query(
    "SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ? FOR UPDATE",
    [rows[0].id_solicitud_alumno],
  );
  return rows[0].id_solicitud_alumno;
}

// Locks offers in ascending id order (the order of migration 018).
async function bloquearOfertas(conn, ids) {
  const unicos = [...new Set(ids.filter(Boolean).map(Number))].sort((a, b) => a - b);
  if (!unicos.length) return;
  await conn.query(
    `SELECT id_solicitud_empresa_especialidad FROM dual_solicitud_empresa_especialidades
      WHERE id_solicitud_empresa_especialidad IN (?)
      ORDER BY id_solicitud_empresa_especialidad
      FOR UPDATE`,
    [unicos],
  );
}

// The offer of one reservation (it never changes), locked.
async function bloquearOfertaDeReserva(conn, idReserva) {
  const [rows] = await conn.query(
    "SELECT id_solicitud_empresa_especialidad AS oferta FROM dual_reservas WHERE id_reserva = ?",
    [idReserva],
  );
  if (rows[0]) await bloquearOfertas(conn, [rows[0].oferta]);
}

// Before a confirmation: the student application, then the offers of this
// reservation and of the student's pending ones (the procedure cancels them).
// The procedure takes the same locks again; holding them first lets the caller
// lock the reservation and its annex in the right order.
async function bloquearParaConfirmar(conn, idReserva) {
  const idSolicitud = await bloquearSolicitudDeReserva(conn, idReserva);
  if (!idSolicitud) return null;
  const [rows] = await conn.query(
    `SELECT id_solicitud_empresa_especialidad AS oferta FROM dual_reservas
      WHERE id_solicitud_alumno = ? AND (id_reserva = ? OR id_estado_reserva = 1)`,
    [idSolicitud, idReserva],
  );
  await bloquearOfertas(conn, rows.map((r) => r.oferta));
  return idSolicitud;
}

// State of one reservation, read with a lock (the latest committed value).
async function estadoBloqueado(conn, idReserva) {
  const [rows] = await conn.query(
    `SELECT r.id_reserva, r.id_solicitud_alumno, r.id_solicitud_empresa_especialidad,
            r.id_tipo_contrato, er.nombre AS estado
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
      WHERE r.id_reserva = ?
      FOR UPDATE OF r`,
    [idReserva],
  );
  return rows[0] || null;
}

// New attempt (D2: always a new row). Returns the new id_reserva.
async function reservar(conn, { idSolicitudAlumno, idOferta, user, detalle = {} }) {
  assertConn(conn);
  const row = await callProcedureWithResult(conn, "sp_reservar_alumno", [idSolicitudAlumno, idOferta]);
  const idReserva = Number(row?.id_reserva) || null;
  if (!idReserva) throw new Error("sp_reservar_alumno no devolvió la reserva creada.");
  await recordEvent(conn, {
    entidad: "RESERVA", id: idReserva, accion: "RESERVAR", despues: ESTADOS_RESERVA.PENDIENTE, user,
    detalle: { id_solicitud_alumno: idSolicitudAlumno, id_oferta: idOferta, ...detalle },
  });
  return idReserva;
}

// Company cancellation (PENDIENTE only), also used by quota reduction.
async function cancelarPendiente(conn, { idReserva, motivo, user, detalle = null }) {
  assertConn(conn);
  await callProcedure(conn, "sp_cancelar_reserva", [idReserva, motivo]);
  await recordEvent(conn, {
    entidad: "RESERVA", id: idReserva, accion: "CANCELAR",
    antes: ESTADOS_RESERVA.PENDIENTE, despues: ESTADOS_RESERVA.CANCELADA, user, motivo, detalle,
  });
}

// Staff cancellation (PENDIENTE or CONFIRMADA). Returns the previous state.
async function cancelarAdmin(conn, { idReserva, motivo, user, detalle = {} }) {
  assertConn(conn);
  await bloquearOfertaDeReserva(conn, idReserva);
  const antes = await estadoBloqueado(conn, idReserva);
  await callProcedure(conn, "sp_cancelar_reserva_admin", [idReserva, motivo]);
  await recordEvent(conn, {
    entidad: "RESERVA", id: idReserva, accion: "CANCELAR",
    antes: antes?.estado || null, despues: ESTADOS_RESERVA.CANCELADA, user, motivo,
    detalle: { administrativa: true, ...detalle },
  });
  return antes?.estado || null;
}

// Confirmation. The caller has already checked the annex and its signatures on
// this connection with locks. Returns the ids of the other pending attempts
// that the procedure cancelled.
async function confirmar(conn, { idReserva, idTipoContrato, user, detalle = {} }) {
  assertConn(conn);
  await bloquearParaConfirmar(conn, idReserva);
  const r = await estadoBloqueado(conn, idReserva);
  const [otras] = await conn.query(
    `SELECT r.id_reserva FROM dual_reservas r FORCE INDEX (ix_dr_solicitud_alumno)
      WHERE r.id_solicitud_alumno = ? AND r.id_reserva <> ?
        AND r.id_estado_reserva = (SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = ?)
      FOR UPDATE`,
    [r?.id_solicitud_alumno ?? -1, idReserva, ESTADOS_RESERVA.PENDIENTE],
  );
  await callProcedure(conn, "sp_confirmar_reserva", [idReserva, idTipoContrato]);
  await recordEvent(conn, {
    entidad: "RESERVA", id: idReserva, accion: "CONFIRMAR",
    antes: ESTADOS_RESERVA.PENDIENTE, despues: ESTADOS_RESERVA.CONFIRMADA, user, detalle,
  });
  const motivo = "Alumno asignado a otra empresa.";
  for (const o of otras) {
    await recordEvent(conn, {
      entidad: "RESERVA", id: o.id_reserva, accion: "CANCELAR",
      antes: ESTADOS_RESERVA.PENDIENTE, despues: ESTADOS_RESERVA.CANCELADA, user, motivo,
      detalle: { por_confirmacion_de: idReserva },
    });
  }
  return otras.map((o) => o.id_reserva);
}

// Reassignment: cancels the origin and creates a new attempt linked to it.
// Returns { idNueva, antes }.
async function reasignar(conn, { idReservaOrigen, idOferta, motivo, user }) {
  assertConn(conn);
  // Lock order: student application here; the procedure then takes the destination
  // company application, offer and the reservations. The previous state is read
  // without a lock, after the application lock: a confirmation needs that lock too,
  // and a concurrent cancellation makes the procedure fail, so if it succeeds the
  // value read is the state it replaced.
  await bloquearSolicitudDeReserva(conn, idReservaOrigen);
  const [[antes]] = await conn.query(
    `SELECT er.nombre AS estado FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
      WHERE r.id_reserva = ?`,
    [idReservaOrigen],
  );
  const row = await callProcedureWithResult(conn, "sp_reasignar_reserva", [idReservaOrigen, idOferta, motivo]);
  const idNueva = Number(row?.id_reserva) || null;
  if (!idNueva) throw new Error("sp_reasignar_reserva no devolvió la reserva creada.");
  await recordEvent(conn, {
    entidad: "RESERVA", id: idReservaOrigen, accion: "REASIGNAR",
    antes: antes?.estado || null, despues: ESTADOS_RESERVA.CANCELADA, user, motivo,
    detalle: { id_reserva_destino: idNueva, id_oferta_destino: idOferta },
  });
  await recordEvent(conn, {
    entidad: "RESERVA", id: idNueva, accion: "RESERVAR", despues: ESTADOS_RESERVA.PENDIENTE,
    user, motivo, detalle: { reasignada_desde: idReservaOrigen, id_oferta: idOferta },
  });
  return { idNueva, antes: antes?.estado || null };
}

module.exports = {
  reservar, cancelarPendiente, cancelarAdmin, confirmar, reasignar,
  estadoBloqueado, bloquearSolicitudDeReserva, bloquearOfertas, bloquearParaConfirmar,
};
