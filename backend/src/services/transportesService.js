const pool = require('../db/pool');

// GET /transportes — all transport options
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT id_transporte, nombre FROM dual_transportes ORDER BY id_transporte'
  );
  return res.json(rows);
};

// GET /tiposContrato — all contract types
exports.getTiposContrato = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT id_tipo_contrato, nombre FROM dual_tipos_contrato ORDER BY id_tipo_contrato'
  );
  return res.json(rows);
};
