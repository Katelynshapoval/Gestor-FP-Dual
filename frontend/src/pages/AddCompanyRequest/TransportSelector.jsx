// Ways the student can reach the workplace (optional; helps preselection).
const TransportSelector = ({ dataTransports, metodosTransporte, onToggle, className = "" }) => (
  <fieldset className={`field ${className}`}>
    <legend className="mb-1 block text-sm font-semibold text-charcoal-800">Transporte para llegar al puesto</legend>
    <p className="mb-3 text-xs leading-5 text-muted">Opcional. Ayuda al centro a proponer alumnos que puedan llegar.</p>
    <div className="checkbox-grid">
      {dataTransports.map((t) => {
        const id = t.id_transporte ?? t.idTransporte;
        // nombre_mostrar is the human-readable label; nombre is the stable technical key
        const label = t.nombre_mostrar ?? t.nombre ?? t.transporte ?? `Transporte ${id}`;
        const checked = metodosTransporte.includes(id) || metodosTransporte.includes(Number(id));
        return (
          <label key={id} className={`checkbox-item ${checked ? "checked" : ""}`}>
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={checked} onChange={() => onToggle(id)} className="accent-brand-500" />
              <span className="item-label">{label}</span>
            </span>
          </label>
        );
      })}
    </div>
  </fieldset>
);

export default TransportSelector;
