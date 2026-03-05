// Selector de ciclos de grado con control de cantidad de alumnos por especialidad.
const SpecialitySelector = ({ dataSpecialities, specialities, onToggle, onAmountChange }) => (
  <div className="field">
    <label>Ciclo(s) de Grado solicitados</label>
    <div className="checkbox-grid">
      {dataSpecialities.map((esp) => {
        const isSelected = specialities[0]?.includes(esp.idEspecialidad);
        return (
          <div key={esp.idEspecialidad} className={`checkbox-item ${isSelected ? 'checked' : ''}`}
            onClick={() => onToggle(esp.idEspecialidad)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <input type="checkbox" checked={isSelected} onChange={e => e.stopPropagation()}
                style={{ accentColor: 'var(--brand)' }} />
              <span className="item-label">{esp.nombreEsp}</span>
            </div>
            {isSelected && (
              <div className="count-input" onClick={e => e.stopPropagation()}>
                <label>Alumnos:</label>
                <input className="input" type="number" min="1"
                  value={specialities[1][specialities[0].indexOf(esp.idEspecialidad)]}
                  onChange={e => onAmountChange(esp.idEspecialidad, parseInt(e.target.value) || 1)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
export default SpecialitySelector;
