const pool = require('../db/pool');

// GET /especialidades — all active specialities
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT id_especialidad, codigo, nombre,
            CASE turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
            activa
       FROM dual_especialidades
      WHERE activa = 1
      ORDER BY codigo, turno`
  );
  return res.json(rows);
};
