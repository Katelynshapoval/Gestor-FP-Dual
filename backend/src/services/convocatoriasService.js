const pool = require('../db/pool');
const { sendSqlError } = require('../helpers/dbHelpers');

// GET /convocatorias — list all
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT * FROM dual_convocatorias ORDER BY id_convocatoria DESC'
  );
  return res.json(rows);
};

// GET /convocatorias/activa — public endpoint to get active convocatoria
exports.getActiva = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1 LIMIT 1'
  );
  if (!rows[0]) return res.status(404).json({ error: 'No hay ninguna convocatoria activa en este momento.' });
  return res.json(rows[0]);
};

// POST /convocatorias — create
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

// POST /convocatorias/:id/activar — activate using stored procedure
exports.activar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('CALL sp_activar_convocatoria(?)', [id]);
    const [rows] = await pool.query(
      'SELECT * FROM dual_convocatorias WHERE id_convocatoria = ?',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Convocatoria no encontrada.' });
    return res.json(rows[0]);
  } catch (err) {
    return sendSqlError(res, err);
  }
};
