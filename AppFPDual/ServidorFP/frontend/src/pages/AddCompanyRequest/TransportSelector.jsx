const TransportSelector = ({ dataTransports, metodosTransporte, onToggle }) => (
  <div className="field">
    <label>Métodos de Transporte posibles</label>

    <p className="field-hint">
      Indica los medios de transporte con los que el alumno puede acceder al
      puesto. Ayuda a la preselección.
    </p>

    <div className="checkbox-grid">
      {dataTransports.map((t) => {
        const checked = metodosTransporte?.includes(t.idTransporte);

        return (
          <div
            key={t.idTransporte}
            className={`checkbox-item ${checked ? "checked" : ""}`}
            onClick={() => onToggle(t.idTransporte)}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => e.stopPropagation()}
                className="accent-brand-500"
              />

              <span className="item-label">{t.transporte}</span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default TransportSelector;
