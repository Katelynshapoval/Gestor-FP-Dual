const pool = require('../db/pool');
const { sendSqlError } = require('../helpers/dbHelpers');

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Date-driven activation (WF-3, decision: automatic by dates).
// The convocatoria whose range contains today (MySQL CURDATE()) becomes the
// only active one; if none does, none is active. Runs in one transaction and
// deactivates before activating, so the one-active trigger is never violated.
// If ranges overlap (legacy data), the one that started most recently wins.
async function syncConvocatoriaActiva() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id_convocatoria, activa,
              (fecha_inicio <= CURDATE() AND fecha_fin >= CURDATE()) AS vigente
         FROM dual_convocatorias
        ORDER BY fecha_inicio DESC, id_convocatoria DESC
        FOR UPDATE`
    );
    const target = rows.find((r) => Number(r.vigente) === 1) || null;
    const targetId = target ? target.id_convocatoria : null;
    const toDeactivate = rows
      .filter((r) => Number(r.activa) === 1 && r.id_convocatoria !== targetId)
      .map((r) => r.id_convocatoria);

    if (toDeactivate.length) {
      await conn.query(
        'UPDATE dual_convocatorias SET activa = 0 WHERE id_convocatoria IN (?)',
        [toDeactivate]
      );
    }
    if (target && Number(target.activa) !== 1) {
      await conn.query(
        'UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = ?',
        [targetId]
      );
    }
    await conn.commit();
    const changed = toDeactivate.length > 0 || (target && Number(target.activa) !== 1);
    if (changed) {
      console.log(`[convocatorias] Convocatoria activa: ${targetId ?? 'ninguna'}`);
    }
    return { activeId: targetId, changed: !!changed };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// Logs instead of throwing: used by the scheduler and by read endpoints.
async function safeSync() {
  try {
    return await syncConvocatoriaActiva();
  } catch (err) {
    console.error('[convocatorias] Error al sincronizar la convocatoria activa:', err.message);
    return null;
  }
}

// Runs at startup and every 15 minutes, so the flag follows the dates
// without anyone opening the Convocatorias page.
function startConvocatoriaScheduler(intervalMs = SYNC_INTERVAL_MS) {
  safeSync();
  const timer = setInterval(safeSync, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

// Validates dates and rejects ranges that overlap another convocatoria.
async function validateRange(nombre, fechaInicio, fechaFin, excludeId = null) {
  if (!nombre || !fechaInicio || !fechaFin) {
    return { status: 400, error: 'nombre, fecha_inicio y fecha_fin son obligatorios.' };
  }
  if (!DATE_RE.test(String(fechaInicio)) || !DATE_RE.test(String(fechaFin))) {
    return { status: 400, error: 'Las fechas deben tener el formato AAAA-MM-DD.' };
  }
  if (String(fechaInicio) > String(fechaFin)) {
    return { status: 400, error: 'La fecha de inicio no puede ser posterior a la fecha de fin.' };
  }
  const [overlap] = await pool.query(
    `SELECT nombre FROM dual_convocatorias
      WHERE fecha_inicio <= ? AND fecha_fin >= ?
        AND (? IS NULL OR id_convocatoria <> ?)
      LIMIT 1`,
    [fechaFin, fechaInicio, excludeId, excludeId]
  );
  if (overlap[0]) {
    return {
      status: 409,
      error: `Las fechas se solapan con la convocatoria «${overlap[0].nombre}».`,
    };
  }
  return null;
}

exports.syncConvocatoriaActiva = syncConvocatoriaActiva;
exports.startConvocatoriaScheduler = startConvocatoriaScheduler;

// GET /convocatorias — syncs the active flag before returning the list
exports.getAll = async function (req, res) {
  await safeSync();
  const [rows] = await pool.query(
    'SELECT * FROM dual_convocatorias ORDER BY id_convocatoria DESC'
  );
  return res.json(rows);
};

// GET /convocatorias/activa
exports.getActiva = async function (req, res) {
  await safeSync();
  const [rows] = await pool.query(
    'SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1 LIMIT 1'
  );
  if (!rows[0]) return res.status(404).json({ error: 'No hay ninguna convocatoria activa en este momento.' });
  return res.json(rows[0]);
};

// POST /convocatorias — creates a new convocatoria, inactive by default
exports.create = async function (req, res) {
  const { nombre, fecha_inicio, fecha_fin } = req.body;
  const invalid = await validateRange(nombre, fecha_inicio, fecha_fin);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });
  try {
    const [result] = await pool.query(
      'INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES (?, ?, ?, 0)',
      [nombre, fecha_inicio, fecha_fin]
    );
    const [rows] = await pool.query(
      'SELECT * FROM dual_convocatorias WHERE id_convocatoria = ?',
      [result.insertId]
    );
    // A convocatoria created with a range that includes today opens immediately
    const sync = await safeSync();
    if (sync?.activeId === result.insertId) rows[0].activa = 1;
    return res.status(201).json(rows[0]);
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// PUT /convocatorias/:id — updates a future (not yet active) convocatoria
exports.update = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { nombre, fecha_inicio, fecha_fin } = req.body;
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Convocatoria no válida.' });
  }
  try {
    const [check] = await pool.query(
      'SELECT fecha_inicio, activa FROM dual_convocatorias WHERE id_convocatoria = ?',
      [id]
    );
    if (!check[0]) return res.status(404).json({ error: 'Convocatoria no encontrada.' });
    if (check[0].activa) {
      return res.status(400).json({ error: 'No se puede editar una convocatoria activa.' });
    }
    const invalid = await validateRange(nombre, fecha_inicio, fecha_fin, id);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });

    await pool.query(
      'UPDATE dual_convocatorias SET nombre = ?, fecha_inicio = ?, fecha_fin = ? WHERE id_convocatoria = ?',
      [nombre, fecha_inicio, fecha_fin, id]
    );
    const [rows] = await pool.query(
      'SELECT * FROM dual_convocatorias WHERE id_convocatoria = ?',
      [id]
    );
    const sync = await safeSync();
    if (sync?.activeId === id) rows[0].activa = 1;
    return res.json(rows[0]);
  } catch (err) {
    return sendSqlError(res, err);
  }
};
