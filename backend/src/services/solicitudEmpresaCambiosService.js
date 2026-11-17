// Company data and data-change requests of an application: the company asks
// for a change (copy-on-write, empresaDatos), staff approve or reject it, and
// staff can edit the data directly.
const pool = require("../db/pool");
const empresaDatos = require("./empresaDatos");
const {
  sendSqlError,
} = require("../helpers/dbHelpers");
const {
  resolveSolicitudForUser,
} = require("./solicitudEmpresaComun");

async function transportLabelMap(conn) {
  const [rows] = await conn.query(
    `SELECT
       id_transporte,
       nombre,
       nombre_mostrar
     FROM dual_transportes`,
  );

  const map = {};

  rows.forEach((r) => {
    map[r.id_transporte] = r.nombre_mostrar || r.nombre;
  });

  return map;
}

function presentCambio(row, actualSnap, labels) {
  const payload = empresaDatos.parsePayload(row.payload) || {};
  const proposed = payload.proposed || {};

  return {
    id_cambio: row.id_cambio,
    id_solicitud_empresa: row.id_solicitud_empresa,
    estado: row.estado,
    fecha_solicitud: row.fecha_solicitud,
    fecha_resolucion: row.fecha_resolucion,
    motivo: row.motivo,
    proposed,
    snapshot: payload.snapshot || {},
    diff: empresaDatos.buildDiff(actualSnap, proposed, labels),
  };
}

exports.getDatos = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  const { datos, error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  return res.json(datos);
};

exports.putDatos = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  const { datos, error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  if (!datos.convocatoria_activa) {
    return res.status(400).json({
      error: "Solo se pueden editar los datos de la convocatoria activa.",
    });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const snapshot = empresaDatos.pickSnapshot(datos);

    const proposedAll = empresaDatos.sanitizeProposed(req.body, {
      allowCif: true,
    });

    const proposed = empresaDatos.diffProposed(snapshot, proposedAll);

    if (!Object.keys(proposed).length) {
      await conn.rollback();

      return res
        .status(400)
        .json({ error: "No hay cambios respecto a los datos actuales." });
    }

    await empresaDatos.applyEmpresaDatos(conn, datos, proposed, {
      allowCif: true,
    });

    await conn.commit();

    const updated = await empresaDatos.loadEmpresaDatosRead(pool, id);

    return res.json({
      message: "Datos de la empresa actualizados.",
      datos: updated,
    });
  } catch (err) {
    await conn.rollback();

    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }

    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.getCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  const { datos, error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const [pend] = await pool.query(
    `SELECT *
     FROM dual_empresa_cambios
     WHERE id_solicitud_empresa = ?
       AND estado = ?
     ORDER BY id_cambio DESC
     LIMIT 1`,
    [id, empresaDatos.ESTADOS_CAMBIO.PENDIENTE],
  );

  const [ultimo] = await pool.query(
    `SELECT *
     FROM dual_empresa_cambios
     WHERE id_solicitud_empresa = ?
       AND estado <> ?
     ORDER BY
       COALESCE(fecha_resolucion, fecha_solicitud) DESC,
       id_cambio DESC
     LIMIT 1`,
    [id, empresaDatos.ESTADOS_CAMBIO.PENDIENTE],
  );

  const labels = await transportLabelMap(pool);
  const actualSnap = empresaDatos.pickSnapshot(datos);

  return res.json({
    pending: pend[0] ? presentCambio(pend[0], actualSnap, labels) : null,
    ultimo: ultimo[0] ? presentCambio(ultimo[0], actualSnap, labels) : null,
  });
};

exports.upsertCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  const { datos, error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  if (!datos.convocatoria_activa) {
    return res.status(400).json({
      error: "Solo se pueden solicitar cambios sobre la convocatoria activa.",
    });
  }

  if ("cif" in (req.body || {})) {
    return res
      .status(403)
      .json({ error: "El CIF no se puede modificar desde la empresa." });
  }

  const proposedAll = empresaDatos.sanitizeProposed(req.body, {
    allowCif: false,
  });

  const snapshot = empresaDatos.pickSnapshot(datos);

  const proposed = empresaDatos.diffProposed(snapshot, proposedAll);

  if (!Object.keys(proposed).length) {
    return res
      .status(400)
      .json({ error: "No hay cambios respecto a los datos actuales." });
  }

  const invalid = empresaDatos.validateMerged(
    {
      ...snapshot,
      ...proposed,
    },
    {
      allowCif: false,
    },
  );

  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [pend] = await conn.query(
      `SELECT id_cambio
       FROM dual_empresa_cambios
       WHERE id_solicitud_empresa = ?
         AND estado = ?
       FOR UPDATE`,
      [id, empresaDatos.ESTADOS_CAMBIO.PENDIENTE],
    );

    const payload = JSON.stringify({
      proposed,
      snapshot,
    });

    let idCambio;

    if (pend[0]) {
      await conn.query(
        `UPDATE dual_empresa_cambios
         SET
           payload = ?,
           fecha_solicitud = NOW(),
           motivo = NULL
         WHERE id_cambio = ?`,
        [payload, pend[0].id_cambio],
      );

      idCambio = pend[0].id_cambio;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO dual_empresa_cambios (
           id_solicitud_empresa,
           id_empresa,
           id_usuario_solicitante,
           payload,
           estado
         )
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          datos.id_empresa,
          req.user.id,
          payload,
          empresaDatos.ESTADOS_CAMBIO.PENDIENTE,
        ],
      );

      idCambio = ins.insertId;
    }

    await conn.commit();

    const labels = await transportLabelMap(pool);

    const [row] = await pool.query(
      "SELECT * FROM dual_empresa_cambios WHERE id_cambio = ?",
      [idCambio],
    );

    return res.status(pend[0] ? 200 : 201).json({
      message: "Cambios enviados para revisión",
      cambio: presentCambio(row[0], snapshot, labels),
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.aprobarCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const idCambio = parseInt(req.params.idCambio, 10);

  const confirmarConflicto = Boolean(req.body?.confirmar_conflicto);

  const { error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT *
       FROM dual_empresa_cambios
       WHERE id_cambio = ?
         AND id_solicitud_empresa = ?
       FOR UPDATE`,
      [idCambio, id],
    );

    const cambio = rows[0];

    if (!cambio) {
      await conn.rollback();

      return res
        .status(404)
        .json({ error: "Solicitud de cambio no encontrada." });
    }

    if (cambio.estado !== empresaDatos.ESTADOS_CAMBIO.PENDIENTE) {
      await conn.rollback();

      return res
        .status(400)
        .json({ error: "Esta solicitud de cambio ya está resuelta." });
    }

    const payload = empresaDatos.parsePayload(cambio.payload) || {};

    const proposed = payload.proposed || {};
    const snapshot = payload.snapshot || {};

    const live = await empresaDatos.loadEmpresaDatos(conn, id);

    const liveSnap = empresaDatos.pickSnapshot(live);

    const conflictos = empresaDatos.detectConflicts(
      snapshot,
      liveSnap,
      proposed,
    );

    if (conflictos.length && !confirmarConflicto) {
      await conn.rollback();

      const labels = await transportLabelMap(pool);

      return res.status(409).json({
        error:
          "Los datos actuales han cambiado desde que se envió la solicitud.",
        conflictos: conflictos.map((c) => ({
          ...c,
          label: empresaDatos.FIELD_DEFS[c.field]?.label || c.field,
        })),
        diff: empresaDatos.buildDiff(liveSnap, proposed, labels),
        requires_confirm: true,
      });
    }

    await empresaDatos.applyEmpresaDatos(conn, live, proposed, {
      allowCif: false,
    });

    await conn.query(
      `UPDATE dual_empresa_cambios
       SET
         estado = ?,
         fecha_resolucion = NOW(),
         id_usuario_resolutor = ?,
         motivo = NULL
       WHERE id_cambio = ?`,
      [empresaDatos.ESTADOS_CAMBIO.APROBADO, req.user.id, idCambio],
    );

    await conn.commit();

    const updated = await empresaDatos.loadEmpresaDatosRead(pool, id);

    return res.json({
      message: "Cambios aprobados y aplicados.",
      datos: updated,
    });
  } catch (err) {
    await conn.rollback();

    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }

    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.rechazarCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const idCambio = parseInt(req.params.idCambio, 10);

  const motivo = String(req.body?.motivo || "").trim();

  if (!motivo) {
    return res
      .status(400)
      .json({ error: "Debe indicar el motivo del rechazo." });
  }

  const { error } = await resolveSolicitudForUser(req, id);

  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const [rows] = await pool.query(
    `SELECT id_cambio, estado
     FROM dual_empresa_cambios
     WHERE id_cambio = ?
       AND id_solicitud_empresa = ?`,
    [idCambio, id],
  );

  if (!rows[0]) {
    return res
      .status(404)
      .json({ error: "Solicitud de cambio no encontrada." });
  }

  if (rows[0].estado !== empresaDatos.ESTADOS_CAMBIO.PENDIENTE) {
    return res
      .status(400)
      .json({ error: "Esta solicitud de cambio ya está resuelta." });
  }

  // Only a change still PENDIENTE is rejected: if someone resolved it in the
  // meantime, nothing is overwritten and the answer says so.
  const [upd] = await pool.query(
    `UPDATE dual_empresa_cambios
     SET
       estado = ?,
       fecha_resolucion = NOW(),
       id_usuario_resolutor = ?,
       motivo = ?
     WHERE id_cambio = ?
       AND estado = ?`,
    [empresaDatos.ESTADOS_CAMBIO.RECHAZADO, req.user.id, motivo, idCambio, empresaDatos.ESTADOS_CAMBIO.PENDIENTE],
  );
  if (!upd.affectedRows) {
    return res.status(409).json({ error: "Esta solicitud de cambio ya está resuelta.", code: "CAMBIO_RESUELTO" });
  }

  return res.json({
    message: "Solicitud de cambio rechazada.",
  });
};
