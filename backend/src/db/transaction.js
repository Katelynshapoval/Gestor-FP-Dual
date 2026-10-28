// Backend-owned transactions (database improvement plan, Stage 2, decision D6).
//
// inTransaction(fn) takes ONE connection from the pool, turns autocommit off,
// runs fn(conn) and commits; any error rolls everything back. fn must do all of
// its work on `conn` — the procedures that need a caller's transaction
// (sp_reservar_alumno, sp_confirmar_reserva, sp_reasignar_reserva,
// sp_cancelar_reserva, sp_cancelar_reserva_admin) refuse to run with
// autocommit = 1, so they cannot be called on the pool by mistake.
//
// Audit events are written with recordEvent(conn, …) inside fn: an event that
// cannot be written rolls the whole change back. Emails and other side effects
// go AFTER inTransaction returns, so nothing is announced that did not commit.
//
// READ COMMITTED: every row these transactions insert or change is serialised by
// an explicit parent lock (student application, offer — migration 018), so gap
// locks add nothing but deadlock risk, and each statement sees the latest
// committed data instead of a snapshot taken at the first read.
//
// A deadlock (ER_LOCK_DEADLOCK) means InnoDB rolled the whole transaction back;
// the whole of fn is then run again on a new connection, at most `retries`
// times. fn must therefore not have side effects outside the database. Other
// errors, including lock-wait timeouts (the transaction is still open and the
// conflict may persist), are not retried.
const pool = require("./pool");

const DEFAULT_RETRIES = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function inTransaction(fn, { retries = DEFAULT_RETRIES, poolImpl = pool } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const conn = await poolImpl.getConnection();
    let reusable = true;
    try {
      await conn.query("SET autocommit = 0");
      await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED"); // this transaction only
      const out = await fn(conn);
      await conn.query("COMMIT");
      return out;
    } catch (err) {
      try {
        await conn.query("ROLLBACK");
      } catch {
        reusable = false;
      }
      if (err && err.code === "ER_LOCK_DEADLOCK" && attempt < retries) {
        console.warn(`[transacción] interbloqueo; se repite la operación completa (intento ${attempt + 2}).`);
        await sleep(20 + Math.floor(Math.random() * 60));
        continue;
      }
      throw err;
    } finally {
      // Never hand a connection with autocommit off back to the pool.
      try {
        if (reusable) await conn.query("SET autocommit = 1");
      } catch {
        reusable = false;
      }
      if (reusable) conn.release();
      else conn.destroy();
    }
  }
}

// Business refusal inside fn: rolls back and reaches the route as an HTTP status.
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

module.exports = { inTransaction, HttpError };
