const pool = require('../db/pool');

// GET /transportes — opciones de transporte con nombre visible
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT id_transporte, nombre, nombre_mostrar FROM dual_transportes ORDER BY id_transporte'
  );
  return res.json(rows);
};

// GET /tiposContrato — opciones de tipo de contrato con nombre visible
exports.getTiposContrato = async function (req, res) {
  const [rows] = await pool.query(
    'SELECT id_tipo_contrato, nombre, nombre_mostrar FROM dual_tipos_contrato ORDER BY id_tipo_contrato'
  );
  return res.json(rows);
};
