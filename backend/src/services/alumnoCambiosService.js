// Student data change requests (migration 020, dual_alumno_cambios).
// The student proposes corrections to their own data (never the DNI/NIE);
// nothing changes until Administración approves. Approval applies the same
// rules as the direct edit (alumnoDatos.corregir): a new ciclo is refused
// while the application has active reservations.
//
// payload  = only the fields the student wants changed
// snapshot = the values those fields had when the request was sent; if staff
//            changed one meanwhile, approval stops and asks to confirm.
const pool = require('../db/pool');
const { getStudentIdFromUser, sendSqlError } = require('../helpers/dbHelpers');
const alumnoDatos = require('./alumnoDatos');
const { recordEvent } = require('./auditLog');
const { cicloCorregido, cambioDatosResuelto } = require('./notificaciones');

function sendError(res, err) {
  if (err.status && err.code) {
    const body = { error: err.message, code: err.code };
    for (const k of ['errores', 'reservas', 'conflictos', 'diff', 'requires_confirm']) {
      if (err[k] !== undefined) body[k] = err[k];
    }
    return res.status(err.status).json(body);
  }
  return sendSqlError(res, err);
}

// The student's application for the active convocatoria (the only one a
// request can be made on), or null.
async function solicitudActivaDe(user) {
  const idAlumno = await getStudentIdFromUser(user.id);
  if (!idAlumno) return null;
  const [rows] = await pool.query(
    `SELECT sa.id_solicitud_alumno
       FROM dual_solicitudes_alumno sa
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
      WHERE sa.id_alumno = ? AND c.activa = 1
      LIMIT 1`,
    [idAlumno],
  );
  return rows[0]?.id_solicitud_alumno || null;
}

// { pending, ultimo } for one application, with the diff against live data.
async function cambiosDe(conn, idSolicitud, live) {
  const [rows] = await conn.query(
    `SELECT id_cambio, estado, payload, snapshot, fecha_solicitud, fecha_resolucion, motivo
       FROM dual_alumno_cambios
      WHERE id_solicitud_alumno = ?
      ORDER BY id_cambio DESC
      LIMIT 2`,
    [idSolicitud],
  );
  const pendingRow = rows.find((r) => r.estado === 'PENDIENTE');
  const ultimoRow = rows.find((r) => r.estado !== 'PENDIENTE');
  let pending = null;
  if (pendingRow) {
    const payload = alumnoDatos.parseJson(pendingRow.payload);
    const snapshot = alumnoDatos.parseJson(pendingRow.snapshot);
    const names = await alumnoDatos.nombres(conn, [live, payload, snapshot]);
    pending = {
      id_cambio: pendingRow.id_cambio,
      fecha_solicitud: pendingRow.fecha_solicitud,
      propuesta: payload,
      diff: alumnoDatos.buildDiff(live, payload, names),
      conflictos: alumnoDatos.labelConflicts(alumnoDatos.detectConflicts(snapshot, live, payload), names),
    };
  }
  const ultimo = ultimoRow
    ? {
      id_cambio: ultimoRow.id_cambio,
      estado: ultimoRow.estado,
      motivo: ultimoRow.motivo,
      fecha_resolucion: ultimoRow.fecha_resolucion,
    }
    : null;
  return { pending, ultimo };
}

// ── Student ─────────────────────────────────────────────────────────────────

// GET /solicitudes/alumno/mia/datos — the student's own data for the request form.
exports.getMisDatos = async function (req, res) {
  const id = await solicitudActivaDe(req.user);
  if (!id) return res.status(404).json({ error: 'No tienes una solicitud en la convocatoria activa.', code: 'SIN_SOLICITUD' });
  const row = await alumnoDatos.loadDatos(pool, id);
  let bloqueo = null;
  try {
    alumnoDatos.assertEditable(row);
  } catch (err) {
    bloqueo = err.message;
  }
  const live = alumnoDatos.pickSnapshot(row);
  return res.json({
    id_solicitud_alumno: id,
    dni: row.dni,
    editable: !bloqueo,
    motivo_no_editable: bloqueo,
    datos: live,
    ...(await cambiosDe(pool, id, live)),
  });
};

// POST /solicitudes/alumno/mia/cambios — create or replace the pending request.
exports.upsertMiCambio = async function (req, res) {
  let proposed;
  try {
    proposed = alumnoDatos.sanitizeProposed(req.body);
  } catch (err) {
    return sendError(res, err);
  }
  const id = await solicitudActivaDe(req.user);
  if (!id) return res.status(404).json({ error: 'No tienes una solicitud en la convocatoria activa.', code: 'SIN_SOLICITUD' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const row = await alumnoDatos.loadDatos(conn, id, { lock: true });
    alumnoDatos.assertEditable(row);
    const live = alumnoDatos.pickSnapshot(row);
    const changes = alumnoDatos.diffProposed(live, proposed);
    if (!Object.keys(changes).length) {
      throw alumnoDatos.httpError(400, 'SIN_CAMBIOS', 'No has cambiado ningún dato.');
    }
    const errores = alumnoDatos.validateChanges(changes);
    if (Object.keys(errores).length) {
      throw alumnoDatos.httpError(400, 'DATOS_INVALIDOS', 'Revisa los campos marcados.', { errores });
    }
    const snapshot = Object.fromEntries(Object.keys(changes).map((k) => [k, live[k] ?? null]));

    const [pending] = await conn.query(
      "SELECT id_cambio FROM dual_alumno_cambios WHERE id_solicitud_alumno = ? AND estado = 'PENDIENTE' FOR UPDATE",
      [id],
    );
    let idCambio;
    if (pending[0]) {
      idCambio = pending[0].id_cambio;
      await conn.query(
        'UPDATE dual_alumno_cambios SET payload = ?, snapshot = ?, id_usuario_solicitante = ? WHERE id_cambio = ?',
        [JSON.stringify(changes), JSON.stringify(snapshot), req.user.id, idCambio],
      );
    } else {
      const [ins] = await conn.query(
        'INSERT INTO dual_alumno_cambios (id_solicitud_alumno, id_usuario_solicitante, payload, snapshot) VALUES (?, ?, ?, ?)',
        [id, req.user.id, JSON.stringify(changes), JSON.stringify(snapshot)],
      );
      idCambio = ins.insertId;
    }
    await recordEvent(conn, {
      entidad: 'SOLICITUD_ALUMNO', id, accion: 'CAMBIO_SOLICITADO', user: req.user,
      detalle: { id_cambio: idCambio, campos: Object.keys(changes) },
    });
    await conn.commit();
    return res.status(pending[0] ? 200 : 201).json({
      message: 'Hemos recibido tu petición. El centro la revisará.',
      id_cambio: idCambio,
    });
  } catch (err) {
    await conn.rollback();
    return sendError(res, err);
  } finally {
    conn.release();
  }
};

// ── Administración ──────────────────────────────────────────────────────────

// GET /solicitudes/alumno/:id/cambios
exports.getCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Solicitud no válida.' });
  const row = await alumnoDatos.loadDatos(pool, id);
  if (!row) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  return res.json(await cambiosDe(pool, id, alumnoDatos.pickSnapshot(row)));
};

async function lockCambio(conn, id, idCambio) {
  const [rows] = await conn.query(
    'SELECT * FROM dual_alumno_cambios WHERE id_cambio = ? AND id_solicitud_alumno = ? FOR UPDATE',
    [idCambio, id],
  );
  if (!rows[0]) throw alumnoDatos.httpError(404, 'NO_ENCONTRADA', 'Petición de cambio no encontrada.');
  if (rows[0].estado !== 'PENDIENTE') {
    throw alumnoDatos.httpError(400, 'YA_RESUELTA', 'Esta petición de cambio ya está resuelta.');
  }
  return rows[0];
}

// POST /solicitudes/alumno/:id/cambios/:idCambio/aprobar { confirmar_conflicto }
exports.aprobarCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const idCambio = parseInt(req.params.idCambio, 10);
  if (!id || !idCambio) return res.status(400).json({ error: 'Petición no válida.' });
  const confirmar = Boolean(req.body?.confirmar_conflicto);

  const conn = await pool.getConnection();
  let campos = [];
  try {
    await conn.beginTransaction();
    // Application first, then the request: the same order as the direct edit.
    const row = await alumnoDatos.loadDatos(conn, id, { lock: true });
    alumnoDatos.assertEditable(row);
    const cambio = await lockCambio(conn, id, idCambio);
    const payload = alumnoDatos.parseJson(cambio.payload);
    const snapshot = alumnoDatos.parseJson(cambio.snapshot);
    const live = alumnoDatos.pickSnapshot(row);

    const conflictos = alumnoDatos.detectConflicts(snapshot, live, payload);
    if (conflictos.length && !confirmar) {
      const names = await alumnoDatos.nombres(conn, [live, payload, snapshot]);
      throw alumnoDatos.httpError(409, 'CONFLICTO', 'Los datos actuales han cambiado desde que el alumno envió la petición.', {
        conflictos: alumnoDatos.labelConflicts(conflictos, names),
        diff: alumnoDatos.buildDiff(live, payload, names),
        requires_confirm: true,
      });
    }

    // The request may already match the live data (staff made the same fix):
    // then it is approved without writing anything.
    try {
      ({ campos } = await alumnoDatos.corregir(conn, row, payload));
    } catch (err) {
      if (err.code !== 'SIN_CAMBIOS') throw err;
    }

    await conn.query(
      `UPDATE dual_alumno_cambios
          SET estado = 'APROBADO', fecha_resolucion = NOW(), id_usuario_resolutor = ?, motivo = NULL
        WHERE id_cambio = ?`,
      [req.user.id, idCambio],
    );
    await recordEvent(conn, {
      entidad: 'SOLICITUD_ALUMNO', id, accion: 'CAMBIO_APROBADO', user: req.user,
      detalle: {
        id_cambio: idCambio,
        campos,
        ...(campos.includes('id_especialidad')
          ? { especialidad_anterior: row.id_especialidad, especialidad_nueva: payload.id_especialidad }
          : {}),
        ...(conflictos.length ? { conflicto_confirmado: conflictos.map((c) => c.field) } : {}),
      },
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return sendError(res, err);
  } finally {
    conn.release();
  }

  cambioDatosResuelto(id, true);
  if (campos.includes('id_especialidad')) cicloCorregido(id);
  return res.json({ message: 'Cambios aprobados y aplicados.', campos });
};

// POST /solicitudes/alumno/:id/cambios/:idCambio/rechazar { motivo }
exports.rechazarCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const idCambio = parseInt(req.params.idCambio, 10);
  const motivo = String(req.body?.motivo || '').trim();
  if (!id || !idCambio) return res.status(400).json({ error: 'Petición no válida.' });
  if (!motivo) return res.status(400).json({ error: 'Indica el motivo del rechazo.', code: 'MOTIVO_REQUERIDO' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCambio(conn, id, idCambio);
    await conn.query(
      `UPDATE dual_alumno_cambios
          SET estado = 'RECHAZADO', fecha_resolucion = NOW(), id_usuario_resolutor = ?, motivo = ?
        WHERE id_cambio = ?`,
      [req.user.id, motivo, idCambio],
    );
    await recordEvent(conn, {
      entidad: 'SOLICITUD_ALUMNO', id, accion: 'CAMBIO_RECHAZADO', user: req.user, motivo,
      detalle: { id_cambio: idCambio },
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return sendError(res, err);
  } finally {
    conn.release();
  }

  cambioDatosResuelto(id, false, motivo);
  return res.json({ message: 'Petición de cambio rechazada.' });
};
