import EmpresaControl, { getEmpresaEmoji, getEmpresaTooltip } from './EmpresaControl.jsx';

// Tarjeta de alumno con cabecera compacta y panel de detalle expandible.
const StudentCard = ({ r, isExpanded, onToggle, companyRequests, sendingInfo, canSendInfo,
  onAssign, onSendInfo, onCompanyChange, onGetDoc, onGetAnexo, onGetEvaluation }) => {

  const props = { r, isExpanded, companyRequests, onAssign, onSendInfo, onCompanyChange, sendingInfo, canSendInfo };

  return (
    <div className="student-card">
      <div className="student-card-header" onClick={() => onToggle(r.idGestion)}>
        <div>
          <p className="student-name">{r.nombre} <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:'.8rem' }}>({r.dni})</span></p>
          {r.nombreEsp && <p className="student-esp">{r.nombreEsp}</p>}
        </div>

        <div className="student-chips">
          <span className="signed-badge">
            A2/A3: {r.anexo2FirmadoRecibido||r.anexo3FirmadoRecibido?'✅':'❌'}
            &nbsp;&nbsp;Cal: {r.calendarioComprobado?'✅':'❌'}
          </span>
          {[1,2,3].map(slot => {
            const em = r[`em${slot}`]; const estid = r[`estid${slot}`];
            return em ? (
              <span key={slot} className="empresa-chip" title={getEmpresaTooltip(estid)}>
                E{slot}: {em} {getEmpresaEmoji(estid)}
              </span>
            ) : null;
          })}
        </div>

        <button className="toggle-btn" onClick={e => { e.stopPropagation(); onToggle(r.idGestion); }}>
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {isExpanded && (
        <div className="student-card-body">
          {/* Grid de empresas */}
          <div className="empresas-grid">
            {[1,2,3].map(slot => <EmpresaControl key={slot} slot={slot} {...props} />)}
          </div>

          {/* Datos de contacto */}
          <div className="contact-grid">
            <div className="contact-item"><span>Email: </span>{r.email||'—'}</div>
            <div className="contact-item"><span>Teléfono: </span>{r.telalumno||'—'}</div>
            <div className="contact-item"><span>Carnet conducir: </span>{r.carnetDeConducir?'✅':'❌'}</div>
            <div className="contact-item"><span>Vehículo: </span>{r.tieneCoche?'✅':'❌'}</div>
          </div>

          {/* Documentos, evaluación y nota */}
          <div className="docs-row">
            <div>
              <p className="docs-label">Documentos</p>
              <div style={{ display:'flex', gap:'.4rem', flexWrap:'wrap' }}>
                <button onClick={() => onGetDoc(r.idGestion,'cv')} className="btn btn-secondary btn-sm">CV</button>
                <button onClick={() => onGetAnexo(r)} className="btn btn-secondary btn-sm">Anexo 2/3</button>
                <button onClick={() => onGetDoc(r.idGestion,'calendario')} className="btn btn-secondary btn-sm">Calendario</button>
              </div>
            </div>
            <div>
              <p className="docs-label">Evaluación</p>
              <button onClick={() => onGetEvaluation(r.idGestion)} className="btn btn-outline-brand btn-sm">
                {r.idEvaluacion !== null ? 'Ver evaluación' : 'Evaluar'}
              </button>
            </div>
            <div>
              <p className="docs-label">Nota total</p>
              <p style={{ fontSize:'1.3rem', fontWeight:700, fontFamily:"'Playfair Display',serif", color:'var(--brand)', margin:0 }}>
                {r.notaTotal ? r.notaTotal.toFixed(2) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentCard;
