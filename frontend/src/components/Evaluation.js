import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as FormatValidation from '../functions/FormatValidation.js';
import { useFormMessage } from '../hooks/useFormMessage.js';
import { postJSON } from '../utils/api.js';
import { verificarId } from '../utils/idObfuscation.js';
import FormMessage from '../components/ui/FormMessage.jsx';

// PÁGINA de evaluación de un alumno vinculado a una empresa.
const Evaluation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, showMessage } = useFormMessage();
  const [idEvaluation, setIdEvaluation] = useState('');
  const [notaMedia, setNotaMedia] = useState('');
  const [idiomas, setIdiomas] = useState('');
  const [madurez, setMadurez] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [faltas, setFaltas] = useState('');
  const [notaTotal, setNotaTotal] = useState('');
  const [fecha, setFecha] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const getEvaluation = useCallback(() => {
    postJSON('/getEvaluationByManagementId', { idManagement: id })
      .then(ev => {
        const e = ev[0];
        setIdEvaluation(e.idEvaluacion); setNotaMedia(e.notaMedia); setIdiomas(e.idiomas);
        setMadurez(e.madurez); setCompetencia(e.competencia); setFaltas(e.faltas);
        setFecha(e.fecha); setIsEditing(true);
      }).catch(() => setIsEditing(false));
  }, [id]);

  useEffect(() => {
    if (!verificarId(id)) { navigate('/'); return; }
    getEvaluation();
  }, [id, navigate, getEvaluation]);

  // Recalcula la nota total cuando cambia cualquier campo numérico
  useEffect(() => {
    const pf = (faltas / 1050) * 100;
    const vf = -0.1 * pf + 1.5;
    const total = 0.6 * notaMedia + 0.05 * idiomas + 0.1 * madurez + 0.1 * competencia + (vf >= 0 ? vf : 0);
    setNotaTotal(total.toFixed(2));
  }, [notaMedia, idiomas, madurez, competencia, faltas]);

  const save = async () => {
    try {
      const body = { id: isEditing ? idEvaluation : id, notaMedia, idiomas, madurez, competencia, faltas, notaTotal, fecha: FormatValidation.validDate(new Date()) };
      await postJSON(isEditing ? '/updateEvaluation' : '/createEvaluation', body);
      await showMessage('Evaluación guardada correctamente.');
      getEvaluation();
    } catch { await showMessage('Error al guardar. Inténtalo de nuevo.'); }
  };

  const campos = [
    { label: 'Nota Media', val: notaMedia, set: setNotaMedia, step: '0.01', hint: 'Nota académica del alumno (0–10)' },
    { label: 'Idiomas', val: idiomas, set: setIdiomas, hint: 'Puntuación de idiomas (0–10)' },
    { label: 'Madurez', val: madurez, set: setMadurez, step: '0.01', hint: 'Valoración de madurez (0–10)' },
    { label: 'Competencia', val: competencia, set: setCompetencia, step: '0.01', hint: 'Competencia profesional (0–10)' },
  ];

  return (
    <div className="page-container">
      <div className="eval-header">
        <div>
          <h1 className="page-title">{isEditing ? 'Editar evaluación' : 'Nueva evaluación'}</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Introduce los valores para calcular la nota final del alumno.</p>
        </div>
        {isEditing && idEvaluation && (
          <div className="eval-meta">
            <span className="eval-badge">ID {idEvaluation}</span>
            <span className="eval-badge">Actualizado: {fecha}</span>
          </div>
        )}
      </div>

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
          <input className="input" type="number" value={faltas} onChange={e => setFaltas(e.target.value)} min="0" placeholder="0" style={{ maxWidth: 180 }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} className="btn btn-primary">
          {isEditing ? 'Actualizar' : 'Guardar'}
        </button>
        {isEditing && idEvaluation && (
          <button type="button" onClick={getEvaluation} className="btn btn-secondary">
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
