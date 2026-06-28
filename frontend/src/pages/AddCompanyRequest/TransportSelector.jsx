// Transport selector for the company application form
const TransportSelector = ({ dataTransports, metodosTransporte, onToggle }) => (
  <div className="field">
    <label>Métodos de Transporte posibles</label>

    <p className="field-hint">
      Indica los medios de transporte con los que el alumno puede acceder al
      puesto. Ayuda a la preselección.
    </p>

    <div className="checkbox-grid">
      {dataTransports.map((t) => {
        const id = t.id_transporte ?? t.idTransporte;
        // nombre_mostrar is the human-readable label; nombre is the stable technical key
        const label = t.nombre_mostrar ?? t.nombre ?? t.transporte ?? `Transporte ${id}`;
        const checked = metodosTransporte?.includes(id) || metodosTransporte?.includes(Number(id));

        return (
          <div
            key={id}
            className={`checkbox-item ${checked ? "checked" : ""}`}
            onClick={() => onToggle(id)}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => e.stopPropagation()}
                className="accent-brand-500"
              />
              <span className="item-label">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default TransportSelector;
