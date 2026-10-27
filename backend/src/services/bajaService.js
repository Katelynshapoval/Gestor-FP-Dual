// «Dar de baja» and «Reactivar» for student and company applications
// (Phase 5, Administración only; migration 016 adds the BAJA state).
//
// Baja, in this order:
//   1. one transaction: the application goes to BAJA, the audit event keeps the
//      reason and the previous state, and the portal account(s) are deactivated
//      (a session already open ends on its next request, SEC-8);
//   2. each active reservation (pending or confirmed) is cancelled with the
//      existing staff procedure, which commits on its own, and the other side
//      is told by email. Nothing new can be reserved meanwhile: reservations
//      need both applications VALIDADO.
// If a cancellation fails, the baja stays and the response lists what is left;
// calling baja again is refused (already BAJA), so the remaining reservations
// are cancelled one by one from their panel.
//
// Reactivar restores the state recorded by the last BAJA event and the
// account(s). Cancelled reservations are NOT restored.
const pool = require("../db/pool");
const { recordEvent, recordEventAfterCommit } = require("./auditLog");
const { bajaTransicion } = require("./estadoReglas");
const { callProcedure } = require("../helpers/dbHelpers");
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

// Active reservations that a baja would cancel, for the confirmation dialog.
async function reservasActivas(entidad, id, conn = pool) {
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
      ORDER BY er.nombre = 'CONFIRMADA' DESC, r.id_reserva`,
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

// Returns { ok, canceladas, pendientes } or { status, error, code }.
async function darDeBaja(entidad, id, { user, motivo }) {
  const cfg = cfgOf(entidad);
  const texto = String(motivo || "").trim();
  const conn = await pool.getConnection();
  let reservas;
  try {
    await conn.beginTransaction();
    const row = await lockSolicitud(conn, cfg, id);
    const denied = bajaTransicion(row?.estado || null, "BAJA", { motivo: texto });
    if (denied) {
      await conn.rollback();
      return denied;
    }
    const [[estadoBaja]] = await conn.query(
      "SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'BAJA'",
    );
    if (!estadoBaja) {
      await conn.rollback();
      return { status: 503, code: "MIGRACION_PENDIENTE", error: "La baja no está disponible: falta aplicar la migración 016 de la base de datos." };
    }
    // motivo must be NULL outside RECHAZADO (triggers); the reason lives in the event.
    await conn.query(
      `UPDATE ${cfg.table}
          SET id_estado_validacion = (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'BAJA'),
              motivo = NULL
        WHERE ${cfg.pk} = ?`,
      [id],
    );
    const cuentas = await setCuentasActivas(conn, entidad, row.owner_id, 0);
    reservas = await reservasActivas(entidad, id, conn);
    await recordEvent(conn, {
      entidad, id, accion: "BAJA", antes: row.estado, despues: "BAJA", user, motivo: texto,
      detalle: { cuentas_desactivadas: cuentas, reservas_a_cancelar: reservas.map((r) => r.id_reserva) },
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const motivoReserva = `${cfg.prefijo}: ${texto}`;
  const canceladas = [];
  const pendientes = [];
  for (const r of reservas) {
    try {
      await callProcedure(pool, "sp_cancelar_reserva_admin", [r.id_reserva, motivoReserva]);
      canceladas.push(r.id_reserva);
      await recordEventAfterCommit({
        entidad: "RESERVA", id: r.id_reserva, accion: "CANCELAR",
        antes: r.estado_reserva, despues: "CANCELADA", user, motivo: motivoReserva,
        detalle: { administrativa: true, por_baja: { entidad, id } },
      });
      // The withdrawn side gets no email; the other side is told the place is free.
      notificar.reservaCancelada(r.id_reserva, entidad === "SOLICITUD_ALUMNO"
        ? { avisarAlumno: false, avisarEmpresa: true }
        : { avisarAlumno: true, avisarEmpresa: false });
    } catch (err) {
      console.error("[baja] no se pudo cancelar la reserva", r.id_reserva, err.message);
      pendientes.push(r.id_reserva);
    }
  }
  return { ok: true, canceladas, pendientes };
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
      let message = n
        ? `Baja registrada. Se ${n === 1 ? "ha cancelado 1 reserva" : `han cancelado ${n} reservas`}.`
        : "Baja registrada.";
      if (out.pendientes.length) {
        message += ` No se pudieron cancelar ${out.pendientes.length}; cancélalas desde su reserva.`;
      }
      return res.json({ message, canceladas: out.canceladas, pendientes: out.pendientes });
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
