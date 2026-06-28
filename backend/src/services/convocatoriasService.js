const pool = require('../db/pool');
const { sendSqlError } = require('../helpers/dbHelpers');

// Sets activa=1 for the convocatoria whose date range includes today, clears all others.
async function autoActivar() {
  await pool.query(`
    UPDATE dual_convocatorias
       SET activa = CASE
         WHEN fecha_inicio <= CURDATE() AND fecha_fin >= CURDATE() THEN 1
         ELSE 0
       END
  `);
}

// GET /convocatorias — runs auto-activation before returning the list
exports.getAll = async function (req, res) {
  try {
    await autoActivar();
  } catch {
    // auto-activation failure is non-fatal; return existing data anyway
  }
  const [rows] = await pool.query(
    'SELECT * FROM dual_convocatorias ORDER BY id_convocatoria DESC'
  );
  return res.json(rows);
};

// GET /convocatorias/activa
exports.getActiva = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1 LIMIT 1'
  );
  if (!rows[0]) return res.status(404).json({ error: 'No hay ninguna convocatoria activa en este momento.' });
  return res.json(rows[0]);
};

// POST /convocatorias — creates a new convocatoria, inactive by default
exports.create = async function (req, res) {
  const { nombre, fecha_inicio, fecha_fin } = req.body;
  if (!nombre || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'nombre, fecha_inicio y fecha_fin son obligatorios.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO dual_convocatorias (nombre, fecha_inicio, fecha_fin, activa) VALUES (?, ?, ?, 0)',
      [nombre, fecha_inicio, fecha_fin]
    );
    const [rows] = await pool.query(
      'SELECT * FROM dual_convocatorias WHERE id_convocatoria = ?',
      [result.insertId]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// PUT /convocatorias/:id — updates a future (not yet active) convocatoria
exports.update = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { nombre, fecha_inicio, fecha_fin } = req.body;
  if (!nombre || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'nombre, fecha_inicio y fecha_fin son obligatorios.' });
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

    await pool.query(
      'UPDATE dual_convocatorias SET nombre = ?, fecha_inicio = ?, fecha_fin = ? WHERE id_convocatoria = ?',
      [nombre, fecha_inicio, fecha_fin, id]
    );
    const [rows] = await pool.query(
      'SELECT * FROM dual_convocatorias WHERE id_convocatoria = ?',
      [id]
    );
    return res.json(rows[0]);
  } catch (err) {
    return sendSqlError(res, err);
  }
};
