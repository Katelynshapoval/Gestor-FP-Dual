// Ciclos and places of a company application: adding a ciclo (may renew the
// convenio, migration 026) and changing the places of one, cancelling pending
// reservations when they no longer fit.
const pool = require("../db/pool");
const conveniosEmpresa = require("./conveniosEmpresa");
const notificar = require("./notificaciones");
const { recordEvent } = require("./auditLog");
const reservasTx = require("./reservasTx");
const {
  sendSqlError,
} = require("../helpers/dbHelpers");
const { inTransaction, HttpError } = require("../db/transaction");
const {
  MAX_PLAZAS_POR_CICLO,
  PLAZAS_EXCEDIDAS,
  AMPLIACION_REQUIERE_CENTRO,
  empresaNoPuedeAmpliar,
  resolveSolicitudForUser,
  generarConvenio,
} = require("./solicitudEmpresaComun");

const ERROR_CUPO_CONFIRMADAS =
  "No se puede reducir el número de plazas por debajo de los alumnos ya confirmados. Cancela o reasigna primero las reservas confirmadas desde administración.";

// POST /solicitudes/empresa/:id/especialidades
exports.addEspecialidad = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  const idEspecialidad = parseInt(req.body?.id_especialidad, 10);

  const raw = req.body?.cantidad;

  const cantidad = typeof raw === "number" ? raw : Number(raw);

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(idEspecialidad) ||
    idEspecialidad <= 0
  ) {
    return res.status(400).json({ error: "Identificador no válido." });
  }

  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return res.status(400).json({
      error: "Indica al menos un alumno para añadir el ciclo.",
    });
  }
  if (cantidad > MAX_PLAZAS_POR_CICLO) {
    return res.status(400).json({ error: PLAZAS_EXCEDIDAS });
  }

  const { datos, error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  if (!datos.convocatoria_activa) {
    return res.status(400).json({
      error: "Solo se puede añadir un ciclo en la convocatoria activa.",
    });
  }

  if (empresaNoPuedeAmpliar(req, datos)) {
    return res.status(403).json({ error: AMPLIACION_REQUIERE_CENTRO, code: "REQUIERE_CENTRO" });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [locked] = await conn.query(
      `SELECT id_solicitud_empresa
       FROM dual_solicitudes_empresa
       WHERE id_solicitud_empresa = ?
       FOR UPDATE`,
      [id],
    );

    if (!locked[0]) {
      await conn.rollback();

      return res.status(404).json({ error: "Solicitud no encontrada." });
    }

    const [espRows] = await conn.query(
      `SELECT id_especialidad, nombre
       FROM dual_especialidades
       WHERE id_especialidad = ?
         AND activa = 1`,
      [idEspecialidad],
    );

    if (!espRows[0]) {
      await conn.rollback();

      return res.status(400).json({
        error: "El ciclo seleccionado no está disponible.",
      });
    }

    const [existing] = await conn.query(
      `SELECT id_solicitud_empresa_especialidad
       FROM dual_solicitud_empresa_especialidades
       WHERE id_solicitud_empresa = ?
         AND id_especialidad = ?`,
      [id, idEspecialidad],
    );

    if (existing[0]) {
      await conn.rollback();

      return res
        .status(409)
        .json({ error: "Este ciclo ya está en la solicitud." });
    }

    const [ins] = await conn.query(
      `INSERT INTO dual_solicitud_empresa_especialidades (
         id_solicitud_empresa,
         id_especialidad,
         cantidad_alumnos
       )
       VALUES (?, ?, ?)`,
      [id, idEspecialidad, cantidad],
    );

    await recordEvent(conn, {
      entidad: "OFERTA", id: ins.insertId, accion: "ALTA", despues: String(cantidad), user: req.user,
      detalle: { id_solicitud_empresa: id, id_especialidad: idEspecialidad },
    });

    // Migration 026: the convenio covers the ciclos it was made for. If one
    // exists (or a renewal is already open), a new ciclo means a new convenio.
    let renovacion = null;
    if ((await conveniosEmpresa.convenioActual(conn, id)) || (await conveniosEmpresa.renovacionAbierta(conn, id))) {
      const ahora = await conveniosEmpresa.ciclosDe(conn, id);
      const antes = ahora.filter((c) => c.id !== idEspecialidad);
      const nombre = espRows[0].nombre;
      const porEmpresa = req.user.rol === "EMPRESA";
      await conveniosEmpresa.abrirRenovacion(conn, {
        idSolicitud: id,
        motivo: "CICLOS",
        detalle: `${porEmpresa ? "La empresa" : "El centro"} ha añadido el ciclo ${nombre}`,
        ciclosAntes: conveniosEmpresa.nombres(antes),
        ciclosAhora: conveniosEmpresa.nombres(ahora),
        user: req.user,
      });
      renovacion = {
        motivoEmpresa: porEmpresa ? `habéis añadido el ciclo ${nombre}` : `el centro ha añadido el ciclo ${nombre} a vuestra solicitud`,
        motivoCentro: porEmpresa ? `la empresa ha añadido el ciclo ${nombre}` : `se ha añadido el ciclo ${nombre} desde el centro`,
        ciclosAntes: conveniosEmpresa.nombres(antes),
        ciclosAhora: conveniosEmpresa.nombres(ahora),
      };
    }

    await conn.commit();

    if (renovacion) {
      conveniosEmpresa.despuesDeAbrir(id, { generar: generarConvenio(req.user.id), ...renovacion })
        .catch((err) => console.error("[convenio] renovación:", err.message));
    }

    return res.status(201).json({
      message: renovacion
        ? "Ciclo añadido. Como cambian los ciclos, la empresa tendrá que firmar un convenio nuevo."
        : "Ciclo añadido.",
      convenio_renovado: Boolean(renovacion),
      id_solicitud_empresa_especialidad: ins.insertId,
      id_especialidad: idEspecialidad,
      nombre: espRows[0].nombre,
      cantidad,
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// PUT /solicitudes/empresa/:id/especialidades/:idOferta/cantidad
exports.updateCupoEspecialidad = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  const idOferta = parseInt(req.params.idOferta, 10);

  const raw = req.body?.cantidad;

  const cantidad = typeof raw === "number" ? raw : Number(raw);

  const confirmarCancelaciones = Boolean(req.body?.confirmar_cancelaciones);

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(idOferta) ||
    idOferta <= 0
  ) {
    return res.status(400).json({
      error: "Identificador de oferta no válido.",
    });
  }

  if (!Number.isInteger(cantidad) || cantidad < 0) {
    return res.status(400).json({
      error: "La cantidad debe ser un entero mayor o igual que 0.",
    });
  }
  if (cantidad > MAX_PLAZAS_POR_CICLO) {
    return res.status(400).json({ error: PLAZAS_EXCEDIDAS });
  }

  const { datos, error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  if (!datos.convocatoria_activa) {
    return res.status(400).json({
      error: "Solo se puede modificar el cupo de la convocatoria activa.",
    });
  }

  const motivo =
    req.user.rol === "EMPRESA"
      ? "Cupo reducido por la empresa."
      : "Cupo reducido por administración.";

  // Stage 2: one transaction (src/db/transaction.js). Lock order of migration 018:
  // the offer, then its reservations; each cancellation goes through the common
  // procedure (sp_cancelar_reserva, which keeps the contract type) with its own
  // audit event, the quota change is recorded as an OFERTA event, and
  // trg_dsee_bu_cupo re-checks the floor. Any failure rolls everything back.
  let out;
  try {
    out = await inTransaction(async (conn) => {
      const [locked] = await conn.query(
        `SELECT cantidad_alumnos
           FROM dual_solicitud_empresa_especialidades
          WHERE id_solicitud_empresa_especialidad = ?
            AND id_solicitud_empresa = ?
          FOR UPDATE`,
        [idOferta, id],
      );
      if (!locked[0]) throw new HttpError(404, "La especialidad no pertenece a esta solicitud.");

      const [[offer]] = await conn.query(
        `SELECT esp.nombre AS especialidad, emp.empresa, coord.email AS email_coordinador
           FROM dual_solicitud_empresa_especialidades ee
           JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
           JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
           JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
           JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
          WHERE ee.id_solicitud_empresa_especialidad = ?`,
        [idOferta],
      );

      const [reservas] = await conn.query(
        `SELECT r.id_reserva, er.nombre AS estado_reserva, a.nombre AS alumno, a.dni AS dni_alumno
           FROM dual_reservas r
           JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
           JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
           JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
          WHERE r.id_solicitud_empresa_especialidad = ?
            AND er.nombre IN ('PENDIENTE', 'CONFIRMADA')
          ORDER BY r.id_reserva DESC
          FOR UPDATE OF r`,
        [idOferta],
      );

      const confirmadas = reservas.filter((r) => r.estado_reserva === "CONFIRMADA");
      const pendientes = reservas.filter((r) => r.estado_reserva === "PENDIENTE");
      const activas = confirmadas.length + pendientes.length;
      const cantidadAnterior = Number(locked[0].cantidad_alumnos);
      const ctx = {
        cantidadAnterior,
        especialidadNombre: offer.especialidad,
        emailCoordinador: offer.email_coordinador,
        empresaNombre: offer.empresa,
        canceladas: [],
      };

      // SEC-002: a validated company may lower its places, never raise them.
      if (cantidad > cantidadAnterior && empresaNoPuedeAmpliar(req, datos)) {
        throw new HttpError(403, AMPLIACION_REQUIERE_CENTRO, { payload: { code: "REQUIERE_CENTRO" } });
      }

      if (cantidad === cantidadAnterior) {
        return {
          ...ctx,
          sinCambio: {
            message: "La cantidad no ha cambiado.",
            cantidad,
            plazas_ocupadas: activas,
            plazas_confirmadas: confirmadas.length,
            plazas_pendientes: pendientes.length,
            plazas_disponibles: Math.max(0, cantidad - activas),
            canceladas: [],
          },
        };
      }

      if (cantidad < confirmadas.length) {
        throw new HttpError(400, ERROR_CUPO_CONFIRMADAS, {
          payload: {
            plazas_confirmadas: confirmadas.length,
            plazas_pendientes: pendientes.length,
            plazas_ocupadas: activas,
          },
        });
      }

      if (cantidad < activas) {
        const nCancelar = activas - cantidad;
        const requested = Array.isArray(req.body?.ids_reservas_cancelar)
          ? [...new Set(req.body.ids_reservas_cancelar.map((value) => parseInt(value, 10)).filter((value) => value > 0))]
          : [];
        const aviso =
          `Al reducir de ${cantidadAnterior} a ${cantidad} plazas hay que cancelar ${nCancelar} reserva${
            nCancelar !== 1 ? "s" : ""
          } pendiente${nCancelar !== 1 ? "s" : ""}. Elige cuáles. Las reservas confirmadas no se modifican.`;

        const selected = pendientes.filter((row) => requested.includes(row.id_reserva));
        if (!confirmarCancelaciones || selected.length !== nCancelar) {
          throw new HttpError(409, aviso, {
            payload: {
              requires_confirm: true,
              requires_selection: true,
              cancelar_pendientes: nCancelar,
              cantidad_actual: cantidadAnterior,
              cantidad_nueva: cantidad,
              plazas_confirmadas: confirmadas.length,
              plazas_pendientes: pendientes.length,
              pendientes: pendientes.map((row) => ({
                id_reserva: row.id_reserva,
                alumno: row.alumno,
                dni_alumno: row.dni_alumno,
              })),
            },
          });
        }

        for (const row of selected) {
          await reservasTx.cancelarPendiente(conn, {
            idReserva: row.id_reserva, motivo, user: req.user,
            detalle: { por_reduccion_cupo: { id_oferta: idOferta, de: cantidadAnterior, a: cantidad } },
          });
          ctx.canceladas.push({
            id_reserva: row.id_reserva,
            alumno: row.alumno,
            dni_alumno: row.dni_alumno,
            especialidad: offer.especialidad,
            motivo,
          });
        }
      }

      await conn.query(
        `UPDATE dual_solicitud_empresa_especialidades
         SET cantidad_alumnos = ?
         WHERE id_solicitud_empresa_especialidad = ?`,
        [cantidad, idOferta],
      );
      await recordEvent(conn, {
        entidad: "OFERTA", id: idOferta, accion: "CUPO",
        antes: String(cantidadAnterior), despues: String(cantidad), user: req.user,
        detalle: {
          id_solicitud_empresa: id,
          ...(ctx.canceladas.length ? { reservas_canceladas: ctx.canceladas.map((c) => c.id_reserva) } : {}),
        },
      });
      return ctx;
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, ...(err.payload || {}) });
    return sendSqlError(res, err);
  }

  if (out.sinCambio) return res.json(out.sinCambio);
  const { canceladas, cantidadAnterior, especialidadNombre, emailCoordinador, empresaNombre } = out;

  if (canceladas.length) {
    await notificar.cupoReducido({
      email: emailCoordinador,
      empresa: empresaNombre,
      especialidad: especialidadNombre,
      cantidadAnterior,
      cantidadNueva: cantidad,
      canceladas,
    });
    // The company gets the summary above; each affected student is told too.
    for (const c of canceladas) notificar.reservaCancelada(c.id_reserva);
  }

  const [ocup] = await pool.query(
    `SELECT
       fn_reservas_activas(?) AS plazas_ocupadas,
       fn_cupos_disponibles(?) AS plazas_disponibles,
       (
         SELECT COUNT(*)
         FROM dual_reservas r
         JOIN dual_estados_reserva er
           ON er.id_estado_reserva = r.id_estado_reserva
         WHERE
           r.id_solicitud_empresa_especialidad = ?
           AND er.nombre = 'CONFIRMADA'
       ) AS plazas_confirmadas,
       (
         SELECT COUNT(*)
         FROM dual_reservas r
         JOIN dual_estados_reserva er
           ON er.id_estado_reserva = r.id_estado_reserva
         WHERE
           r.id_solicitud_empresa_especialidad = ?
           AND er.nombre = 'PENDIENTE'
       ) AS plazas_pendientes`,
    [idOferta, idOferta, idOferta, idOferta],
  );

  const stats = ocup[0] || {};

  return res.json({
    message: canceladas.length
      ? `Plazas actualizadas. Se han cancelado ${canceladas.length} reserva${
          canceladas.length !== 1 ? "s" : ""
        } pendiente${canceladas.length !== 1 ? "s" : ""}.`
      : "Número de plazas actualizado.",
    cantidad,
    cantidad_anterior: cantidadAnterior,
    plazas_ocupadas: Number(stats.plazas_ocupadas) || 0,
    plazas_disponibles: Number(stats.plazas_disponibles) || 0,
    plazas_confirmadas: Number(stats.plazas_confirmadas) || 0,
    plazas_pendientes: Number(stats.plazas_pendientes) || 0,
    canceladas,
  });
};
