// «Dar de baja» and «Reactivar» for student and company applications
// (Phase 5, Administración only; migration 016 adds the BAJA state).
//
// Baja is ONE transaction (database improvement plan, Stage 2): the application
// goes to BAJA, the audit event keeps the reason and the previous state, the
// portal account(s) are deactivated (a session already open ends on its next
// request, SEC-8) and every active reservation (pending or confirmed) is
// cancelled with the staff procedure, each with its own event. If anything
// fails, nothing changes. Only after the commit is the other side of each
// cancelled reservation told by email.
// Locks: the application first, then its reservations (the order of migration
// 018), so a reservation being created at the same time either commits first
// and is cancelled here, or waits and is then refused (application not VALIDADO).
//
// Reactivar restores the state recorded by the last BAJA event and the
// account(s). Cancelled reservations are NOT restored.
const pool = require("../db/pool");
const { inTransaction, HttpError } = require("../db/transaction");
const { recordEvent } = require("./auditLog");
const { bajaTransicion } = require("./estadoReglas");
const reservasTx = require("./reservasTx");
const notificar = require("./notificaciones");

const ENTIDADES = {
  SOLICITUD_ALUMNO: {
    table: "dual_solicitudes_alumno",
    pk: "id_solicitud_alumno",
    owner: "sa.id_alumno",
    from: "dual_solicitudes_alumno sa",
    alias: "sa",
    // Reservations of this application.
    reservasWhere: "r.id_solicitud_alumno = ?",
    prefijo: "Baja del alumno en el programa",
  },
  SOLICITUD_EMPRESA: {
    table: "dual_solicitudes_empresa",
    pk: "id_solicitud_empresa",
    owner: "se.id_empresa",
    from: "dual_solicitudes_empresa se",
    alias: "se",
    reservasWhere: "see.id_solicitud_empresa = ?",
    prefijo: "Baja de la empresa en el programa",
  },
};

function cfgOf(entidad) {
  const cfg = ENTIDADES[entidad];
  if (!cfg) throw new Error(`Entidad no válida: ${entidad}`);
  return cfg;
}

// Active reservations that a baja would cancel: for the confirmation dialog, and
// with { lock: true } inside the baja transaction (latest rows, locked).
async function reservasActivas(entidad, id, conn = pool, { lock = false } = {}) {
  const cfg = cfgOf(entidad);
  const [rows] = await conn.query(
    `SELECT r.id_reserva, er.nombre AS estado_reserva,
            a.nombre AS alumno, emp.empresa, esp.nombre AS especialidad
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       JOIN dual_solicitud_empresa_especialidades see
         ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = see.id_especialidad
      WHERE ${cfg.reservasWhere}
        AND er.nombre IN ('PENDIENTE', 'CONFIRMADA')
      ORDER BY er.nombre = 'CONFIRMADA' DESC, r.id_reserva${lock ? " FOR UPDATE OF r" : ""}`,
    [id],
  );
  return rows;
}

// Portal accounts of the application's student or company.
async function setCuentasActivas(conn, entidad, ownerId, activo) {
  if (entidad === "SOLICITUD_ALUMNO") {
    const [r] = await conn.query("UPDATE dual_usuarios SET activo = ? WHERE id_alumno = ?", [activo, ownerId]);
    return r.affectedRows;
  }
  const [r] = await conn.query(
    `UPDATE dual_usuarios u
       JOIN dual_roles ro ON ro.id_rol = u.id_rol
       JOIN ge_contactos c ON c.idcontacto = u.id_contacto
       JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
        SET u.activo = ?
      WHERE ro.nombre = 'EMPRESA' AND d.idempresa = ?`,
    [activo, ownerId],
  );
  return r.affectedRows;
}

async function lockSolicitud(conn, cfg, id) {
  const [rows] = await conn.query(
    `SELECT ev.nombre AS estado, ${cfg.owner} AS owner_id
       FROM ${cfg.from}
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = ${cfg.alias}.id_estado_validacion
      WHERE ${cfg.alias}.${cfg.pk} = ?
      FOR UPDATE`,
    [id],
  );
  return rows[0] || null;
}

// Returns { ok, canceladas } or { status, error, code }. All or nothing.
async function darDeBaja(entidad, id, { user, motivo }) {
  const cfg = cfgOf(entidad);
  const texto = String(motivo || "").trim();
  let reservas;
  try {
    reservas = await inTransaction(async (conn) => {
      const row = await lockSolicitud(conn, cfg, id);
      const denied = bajaTransicion(row?.estado || null, "BAJA", { motivo: texto });
      if (denied) throw new HttpError(denied.status, denied.error, { code: denied.code });
      const [[estadoBaja]] = await conn.query(
        "SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'BAJA'",
      );
      if (!estadoBaja) {
        throw new HttpError(503, "La baja no está disponible: falta aplicar la migración 016 de la base de datos.", { code: "MIGRACION_PENDIENTE" });
      }
      // motivo must be NULL outside RECHAZADO (triggers); the reason lives in the event.
      await conn.query(
        `UPDATE ${cfg.table}
            SET id_estado_validacion = ?, motivo = NULL
          WHERE ${cfg.pk} = ?`,
        [estadoBaja.id_estado_validacion, id],
      );
      const cuentas = await setCuentasActivas(conn, entidad, row.owner_id, 0);
      // Lock order of migration 018: offers (ascending), then the reservations.
      // With the application locked no reservation of it can be created meanwhile.
      const [ofertas] = await conn.query(
        `SELECT DISTINCT r.id_solicitud_empresa_especialidad AS oferta
           FROM dual_reservas r
           JOIN dual_solicitud_empresa_especialidades see
             ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
          WHERE ${cfg.reservasWhere} AND r.id_estado_reserva IN (1, 2)`,
        [id],
      );
      await reservasTx.bloquearOfertas(conn, ofertas.map((o) => o.oferta));
      const activas = await reservasActivas(entidad, id, conn, { lock: true });
      await recordEvent(conn, {
        entidad, id, accion: "BAJA", antes: row.estado, despues: "BAJA", user, motivo: texto,
        detalle: { cuentas_desactivadas: cuentas, reservas_canceladas: activas.map((r) => r.id_reserva) },
      });
      const motivoReserva = `${cfg.prefijo}: ${texto}`;
      for (const r of activas) {
        await reservasTx.cancelarAdmin(conn, {
          idReserva: r.id_reserva, motivo: motivoReserva, user, detalle: { por_baja: { entidad, id } },
        });
      }
      return activas;
    });
  } catch (err) {
    if (err.status) return { status: err.status, error: err.message, code: err.code };
    throw err;
  }

  // After the commit: the withdrawn side gets no email; the other side is told the place is free.
  for (const r of reservas) {
    notificar.reservaCancelada(r.id_reserva, entidad === "SOLICITUD_ALUMNO"
      ? { avisarAlumno: false, avisarEmpresa: true }
      : { avisarAlumno: true, avisarEmpresa: false });
  }
  return { ok: true, canceladas: reservas.map((r) => r.id_reserva) };
}

async function reactivar(entidad, id, { user, motivo }) {
  const cfg = cfgOf(entidad);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const row = await lockSolicitud(conn, cfg, id);
    const denied = bajaTransicion(row?.estado || null, "REACTIVAR");
    if (denied) {
      await conn.rollback();
      return denied;
    }
    const [[baja]] = await conn.query(
      `SELECT estado_anterior FROM dual_eventos
        WHERE entidad = ? AND id_entidad = ? AND accion = 'BAJA'
        ORDER BY id_evento DESC LIMIT 1`,
      [entidad, id],
    );
    const destino = ["PENDIENTE", "VALIDADO", "RECHAZADO"].includes(baja?.estado_anterior)
      ? baja.estado_anterior
      : "PENDIENTE";
    // A rejected application needs its reason back (triggers): the last RECHAZAR event has it.
    let motivoRechazo = null;
    if (destino === "RECHAZADO") {
      const [[rech]] = await conn.query(
        `SELECT motivo FROM dual_eventos
          WHERE entidad = ? AND id_entidad = ? AND accion = 'RECHAZAR'
          ORDER BY id_evento DESC LIMIT 1`,
        [entidad, id],
      );
      motivoRechazo = rech?.motivo || "Solicitud rechazada antes de la baja.";
    }
    await conn.query(
      `UPDATE ${cfg.table}
          SET id_estado_validacion = (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = ?),
              motivo = ?
        WHERE ${cfg.pk} = ?`,
      [destino, motivoRechazo, id],
    );
    const cuentas = await setCuentasActivas(conn, entidad, row.owner_id, 1);
    await recordEvent(conn, {
      entidad, id, accion: "REACTIVAR", antes: "BAJA", despues: destino, user,
      motivo: String(motivo || "").trim() || null,
      detalle: { cuentas_reactivadas: cuentas },
    });
    await conn.commit();
    return { ok: true, estado: destino };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// HTTP handlers. Routes restrict them to ADMINISTRADOR.
function handlers(entidad) {
  const parse = (req) => Number.parseInt(req.params.id, 10) || null;
  return {
    preview: async (req, res) => {
      const id = parse(req);
      if (!id) return res.status(400).json({ error: "Solicitud no válida." });
      return res.json({ reservas: await reservasActivas(entidad, id) });
    },
    baja: async (req, res) => {
      const id = parse(req);
      if (!id) return res.status(400).json({ error: "Solicitud no válida." });
      const out = await darDeBaja(entidad, id, { user: req.user, motivo: req.body?.motivo });
      if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
      const n = out.canceladas.length;
      const message = n
        ? `Baja registrada. Se ${n === 1 ? "ha cancelado 1 reserva" : `han cancelado ${n} reservas`}.`
        : "Baja registrada.";
      // `pendientes` stays in the response for the screen: always empty now (all or nothing).
      return res.json({ message, canceladas: out.canceladas, pendientes: [] });
    },
    reactivar: async (req, res) => {
      const id = parse(req);
      if (!id) return res.status(400).json({ error: "Solicitud no válida." });
      const out = await reactivar(entidad, id, { user: req.user, motivo: req.body?.motivo });
      if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
      return res.json({ message: "Solicitud reactivada. Las reservas canceladas no se recuperan.", estado: out.estado });
    },
  };
}

module.exports = { darDeBaja, reactivar, reservasActivas, handlers };
