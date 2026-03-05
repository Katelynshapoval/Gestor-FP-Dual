// Mapas de estilos y textos según el código de estado de empresa
const BADGE_CLASS = { 0:'estado-0', 1:'estado-1', 2:'estado-2', 3:'estado-3', 4:'estado-4', 5:'estado-5' };
const EMOJI = { 5:'✅', 3:'❌', 1:'🟠', 2:'📤', 4:'⚠️' };
const TOOLTIP = { 5:'Finalizado / Aceptado', 3:'Rechazado', 1:'Asignado (no finalizado)', 2:'Información enviada', 4:'Pendiente' };

export const getEmpresaEmoji = (estid) => EMOJI[estid] ?? '⚪';
export const getEmpresaTooltip = (estid) => TOOLTIP[estid] ?? 'Sin asignar';
export const getBadgeClass = (estid) => BADGE_CLASS[estid] ?? 'estado-5';

// Badge de estado de empresa
export const EmpresaBadge = ({ estid, label }) => (
  <span className={`estado-badge ${getBadgeClass(estid)}`}>{label}</span>
);

// Selector de empresa filtrado por especialidad
export const EmpresaSelect = ({ label, defaultValue, onChange, options }) => (
  <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginTop:'.5rem' }}>
    <span style={{ fontSize:'.75rem', fontWeight:600, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{label}</span>
    <select className="select-input" style={{ fontSize:'.8rem', padding:'.3rem .6rem' }} defaultValue={defaultValue} onChange={onChange}>
      <option value="">Selecciona empresa...</option>
      {options.map(cr => (
        <option key={cr.idEmpresa} value={cr.idEmpresa}>{cr.empresa} (Disponibilidad: {cr.cantidad})</option>
      ))}
    </select>
  </div>
);

// Bloque completo para un slot de empresa: badge/selector, botones y observaciones
const EmpresaControl = ({ slot, r, isExpanded, companyRequests, onAssign, onSendInfo, onCompanyChange, sendingInfo, canSendInfo }) => {
  const idEmpresa = r[`idEmpresa${slot}`];
  const em = r[`em${slot}`];
  const estid = r[`estid${slot}`];
  const est = r[`est${slot}`];
  const tipo = r[`tipo${slot}`];
  const obv = r[`obv${slot}`];
  const buttonKey = `${r.idGestion}-${slot}`;
  const isSending = sendingInfo.has(buttonKey);
  const showBadge = !isExpanded || [2,3,4,5].includes(estid);
  const showSelect = isExpanded && [0,1].includes(estid);

  return (
    <div className="empresa-slot">
      <div className="empresa-slot-label">Empresa {slot}</div>
      {(slot===1||em) && showBadge && <EmpresaBadge estid={estid} label={em || 'Sin asignar'} />}
      {(slot===1||em) && showSelect && (
        <EmpresaSelect label="" defaultValue={idEmpresa} onChange={(e) => onCompanyChange(r.idGestion, slot)(e)}
          options={companyRequests.filter(cr=>cr.idEspecialidad===r.idEspecialidad)} />
      )}
      {isExpanded && [0,1].includes(estid) && (
        <button onClick={() => onAssign(r.idGestion, slot)} className="btn btn-outline-brand btn-sm"
          style={{ marginTop:'.5rem' }}>
          {estid===0 ? 'Asignar' : 'Reasignar'}
        </button>
      )}
      {canSendInfo && estid===1 && r.anexo2FirmadoRecibido===1 && (
        <button onClick={() => onSendInfo(r.idGestion, r.idAlumno, idEmpresa)}
          className={`btn btn-sm ${isSending?'btn-disabled btn-secondary':'btn-primary'}`}
          style={{ marginTop:'.5rem', display:'block' }} disabled={isSending}>
          {isSending ? 'Enviando...' : 'Enviar info a empresa'}
        </button>
      )}
      {isExpanded && est && <div style={{ marginTop:'.35rem' }}><EmpresaBadge estid={estid} label={est} /></div>}
      {tipo && <p style={{ fontSize:'.75rem', color:'var(--text-muted)', margin:'.4rem 0 0' }}>Contrato: {tipo}</p>}
      {obv && <p style={{ fontSize:'.75rem', color:'var(--text-muted)', margin:'.25rem 0 0' }}>Obs: {obv}</p>}
    </div>
  );
};

export default EmpresaControl;
