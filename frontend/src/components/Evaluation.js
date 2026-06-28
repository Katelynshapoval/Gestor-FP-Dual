import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFormMessage } from '../hooks/useFormMessage.js';
import { getJSON, postJSON } from '../utils/api.js';
import { verificarId } from '../utils/idObfuscation.js';
import FormMessage from '../components/ui/FormMessage.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';

// Reverses the ofuscarId encoding (multiply by 23 + control letter) to get the real id_solicitud_alumno
function decodificarId(idOfuscado) {
  const numPart = idOfuscado.slice(0, -1);
  return parseInt(numPart, 10) / 23;
}

// Evaluation page — creates or updates the nota for a student application
const Evaluation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, showMessage } = useFormMessage();

  const [idEvaluation, setIdEvaluation] = useState(null);
  const [notaMedia, setNotaMedia] = useState('');
  const [idiomas, setIdiomas] = useState('');
  const [madurez, setMadurez] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [faltas, setFaltas] = useState('');
  const [notaTotal, setNotaTotal] = useState('');
  const [fechaActualizacion, setFechaActualizacion] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [idSolicitudAlumno, setIdSolicitudAlumno] = useState(null);

  const getEvaluation = useCallback(async (idSol) => {
    try {
      const ev = await getJSON(`/evaluaciones/${idSol}`);
      setIdEvaluation(ev.id_evaluacion);
      setNotaMedia(ev.nota_media ?? '');
      setIdiomas(ev.idiomas ?? '');
      setMadurez(ev.madurez ?? '');
      setCompetencia(ev.competencia ?? '');
      setFaltas(ev.faltas ?? '');
      setFechaActualizacion(ev.updated_at ?? '');
      setIsEditing(true);
    } catch {
      setIsEditing(false);
    }
  }, []);

  useEffect(() => {
    if (!verificarId(id)) {
      navigate('/');
      return;
    }
    const idSol = decodificarId(id);
    setIdSolicitudAlumno(idSol);
    getEvaluation(idSol);
  }, [id, navigate, getEvaluation]);

  // Recomputes nota_total in real time so the user sees the projected score while editing
  useEffect(() => {
    const nm = parseFloat(notaMedia) || 0;
    const id2 = parseFloat(idiomas) || 0;
    const ma = parseFloat(madurez) || 0;
    const co = parseFloat(competencia) || 0;
    const fa = parseInt(faltas, 10) || 0;
    const pf = (fa / 1050) * 100;
    const vf = -0.1 * pf + 1.5;
    const total = 0.6 * nm + 0.05 * id2 + 0.1 * ma + 0.1 * co + (vf >= 0 ? vf : 0);
    setNotaTotal(total.toFixed(2));
  }, [notaMedia, idiomas, madurez, competencia, faltas]);

  const formatFecha = (fechaStr) => {
    if (!fechaStr) return null;
    try {
      return new Date(fechaStr).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch {
      return fechaStr;
    }
  };

  const save = async () => {
    try {
      await postJSON('/evaluaciones', {
        id_solicitud_alumno: idSolicitudAlumno,
        nota_media: notaMedia,
        idiomas,
        madurez,
        competencia,
        faltas,
      });
      await showMessage('Evaluación guardada correctamente.');
      getEvaluation(idSolicitudAlumno);
    } catch {
      await showMessage('Error al guardar. Inténtalo de nuevo.');
    }
  };

  const campos = [
    { label: 'Nota Media', val: notaMedia, set: setNotaMedia, step: '0.01', hint: 'Nota académica del alumno (0–10)' },
    { label: 'Idiomas', val: idiomas, set: setIdiomas, hint: 'Puntuación de idiomas (0–10)' },
    { label: 'Madurez', val: madurez, set: setMadurez, step: '0.01', hint: 'Valoración de madurez (0–10)' },
    { label: 'Competencia', val: competencia, set: setCompetencia, step: '0.01', hint: 'Competencia profesional (0–10)' },
  ];

  const fechaMostrada = formatFecha(fechaActualizacion);

  return (
    <div className="page-container">
      <PageHeader
        kicker="Evaluación"
        title={isEditing ? 'Editar evaluación' : 'Nueva evaluación'}
        subtitle="Introduce los valores para calcular la nota final del alumno."
        meta={isEditing && idEvaluation && (
          <div className="eval-meta">
            <span className="eval-badge">ID {idEvaluation}</span>
            {fechaMostrada && <span className="eval-badge">Actualizado: {fechaMostrada}</span>}
          </div>
        )}
      />

      <div className="eval-score-box">
        <div className="score-label">Nota total calculada</div>
        <div className="score-value">{notaTotal || '0.00'}</div>
        <div className="score-formula">0.6×NotaMedia + 0.05×Idiomas + 0.1×Madurez + 0.1×Competencia + 0.15×Faltas</div>
      </div>

      <div className="form-card">
        <div className="form-section-title">Calificaciones</div>
        <div className="grid-2">
          {campos.map(({ label, val, set, step, hint }) => (
            <div className="field" key={label}>
              <label>{label}</label>
              {hint && <p className="field-hint">{hint}</p>}
              <input className="input" type="number" value={val} onChange={e => set(e.target.value)}
                step={step || '1'} min="0" placeholder="0" />
            </div>
          ))}
        </div>
        <div className="field">
          <label>Faltas de asistencia (horas)</label>
          <p className="field-hint">Total de horas de ausencia del alumno</p>
          <input className="input max-w-44" type="number" value={faltas} onChange={e => setFaltas(e.target.value)} min="0" placeholder="0" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={save} className="btn btn-primary">
          {isEditing ? 'Actualizar' : 'Guardar'}
        </button>
        {isEditing && (
          <button type="button" onClick={() => getEvaluation(idSolicitudAlumno)} className="btn btn-secondary">
            Restablecer
          </button>
        )}
        <button type="button" onClick={() => navigate('/linkStudents')} className="btn btn-ghost">
          Cancelar
        </button>
      </div>
      <FormMessage message={message} />
    </div>
  );
};

export default Evaluation;
