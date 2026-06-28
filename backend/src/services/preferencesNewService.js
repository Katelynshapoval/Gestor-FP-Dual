const pool = require('../db/pool');

// GET /preferencias?id_especialidad=X
exports.getByEspecialidad = async function (req, res) {
  const { id_especialidad } = req.query;

  if (!id_especialidad) {
    return res.status(400).json({ error: 'Se requiere id_especialidad.' });
  }

  const [rows] = await pool.query(
    `SELECT id_preferencia, descripcion
       FROM dual_preferencias
      WHERE id_especialidad = ?
      ORDER BY descripcion`,
    [id_especialidad]
  );

  return res.json(rows);
};
