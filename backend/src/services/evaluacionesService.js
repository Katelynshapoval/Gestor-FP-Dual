const pool = require('../db/pool');
const { sendSqlError } = require('../helpers/dbHelpers');

// Calcula nota_total usando la misma fórmula que el frontend (Evaluation.js)
function computeNotaTotal(nota_media, idiomas, madurez, competencia, faltas) {
  const nm = parseFloat(nota_media) || 0;
  const id = parseFloat(idiomas) || 0;
  const ma = parseFloat(madurez) || 0;
  const co = parseFloat(competencia) || 0;
  const fa = parseInt(faltas, 10) || 0;

  const pf = (fa / 1050) * 100;
  const vf = Math.max(0, -0.1 * pf + 1.5);
  const total = 0.6 * nm + 0.05 * id + 0.1 * ma + 0.1 * co + vf;
  return parseFloat(Math.min(10, Math.max(0, total)).toFixed(2));
}

// GET /evaluaciones/:idSolicitudAlumno
exports.getByIdSolicitudAlumno = async function (req, res) {
  const idSolicitudAlumno = parseInt(req.params.idSolicitudAlumno, 10);
  const [rows] = await pool.query(
    `SELECT e.*, a.nombre AS alumno, sa.id_convocatoria
       FROM dual_evaluaciones e
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = e.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
      WHERE e.id_solicitud_alumno = ?`,
    [idSolicitudAlumno]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Evaluación no encontrada.' });
  return res.json(rows[0]);
};

// POST /evaluaciones — create or update evaluation
exports.guardar = async function (req, res) {
  const { id_solicitud_alumno, nota_media, idiomas, madurez, competencia, faltas } = req.body;

  if (id_solicitud_alumno == null) {
    return res.status(400).json({ error: 'id_solicitud_alumno es obligatorio.' });
  }

  const nm = parseFloat(nota_media);
  const id = parseFloat(idiomas);
  const ma = parseFloat(madurez);
  const co = parseFloat(competencia);
  const fa = parseInt(faltas, 10);

  if ([nm, id, ma, co].some(v => isNaN(v) || v < 0 || v > 10)) {
    return res.status(400).json({ error: 'Las notas deben estar entre 0 y 10.' });
  }
  if (isNaN(fa) || fa < 0) {
    return res.status(400).json({ error: 'Las faltas deben ser un número no negativo.' });
  }

  const nota_total = computeNotaTotal(nm, id, ma, co, fa);

  try {
    await pool.query('CALL sp_guardar_evaluacion(?, ?, ?, ?, ?, ?, ?)', [
      id_solicitud_alumno, nm, id, ma, co, fa, nota_total,
    ]);

    const [rows] = await pool.query(
      'SELECT * FROM dual_evaluaciones WHERE id_solicitud_alumno = ?',
      [id_solicitud_alumno]
    );
    return res.status(200).json(rows[0]);
  } catch (err) {
    return sendSqlError(res, err);
  }
};
