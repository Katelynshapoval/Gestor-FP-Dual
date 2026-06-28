const pool = require('../db/pool');
const { sendSqlError } = require('../helpers/dbHelpers');

// Calcula nota_total a partir de los cinco valores almacenados.
// Esta es la única implementación de la fórmula en el servidor.
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

exports.computeNotaTotal = computeNotaTotal;

// GET /evaluaciones/:idSolicitudAlumno
exports.getByIdSolicitudAlumno = async function (req, res) {
  const idSolicitudAlumno = parseInt(req.params.idSolicitudAlumno, 10);
  const [rows] = await pool.query(
    `SELECT e.id_evaluacion, e.id_solicitud_alumno,
            e.nota_media, e.idiomas, e.madurez, e.competencia, e.faltas,
            a.nombre AS alumno, sa.id_convocatoria
       FROM dual_evaluaciones e
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = e.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
      WHERE e.id_solicitud_alumno = ?`,
    [idSolicitudAlumno]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Evaluación no encontrada.' });

  const ev = rows[0];
  return res.json({
    ...ev,
    nota_total: computeNotaTotal(ev.nota_media, ev.idiomas, ev.madurez, ev.competencia, ev.faltas),
  });
};

// POST /evaluaciones — crear o actualizar evaluación (sin persistir nota_total)
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

  try {
    // Seis parámetros: sin nota_total (se eliminó el campo)
    await pool.query('CALL sp_guardar_evaluacion(?, ?, ?, ?, ?, ?)', [
      id_solicitud_alumno, nm, id, ma, co, fa,
    ]);

    const [rows] = await pool.query(
      `SELECT id_evaluacion, id_solicitud_alumno,
              nota_media, idiomas, madurez, competencia, faltas
         FROM dual_evaluaciones
        WHERE id_solicitud_alumno = ?`,
      [id_solicitud_alumno]
    );
    const saved = rows[0];
    return res.status(200).json({
      ...saved,
      nota_total: computeNotaTotal(saved.nota_media, saved.idiomas, saved.madurez, saved.competencia, saved.faltas),
    });
  } catch (err) {
    return sendSqlError(res, err);
  }
};
