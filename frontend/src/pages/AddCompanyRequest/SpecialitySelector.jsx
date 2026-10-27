// Ciclos requested by the company and places per ciclo. Real checkboxes and a
// labelled number input, so the whole selector works with a keyboard.
function turnoLabel(turno) {
  if (turno === 1 || turno === "1" || turno === "VESPERTINO") return "Vespertino";
  return null;
}

const SpecialitySelector = ({ dataSpecialities, selected, onToggle, onAmountChange, error }) => (
  <fieldset className="field" aria-describedby={error ? "campo-especialidades-error" : undefined}>
    <legend className="mb-1 block text-sm font-semibold text-charcoal-800">
      Ciclos y plazas<span aria-hidden="true" className="ml-0.5 text-brand-700">*</span>
      <span className="sr-only"> (obligatorio)</span>
    </legend>
    <p className="mb-3 text-xs leading-5 text-muted">Marca los ciclos que os interesan e indica cuántos alumnos podéis acoger en cada uno.</p>
    <div className="checkbox-grid">
      {dataSpecialities.map((esp, index) => {
        const id = esp.id_especialidad ?? esp.idEspecialidad;
        const nombre = esp.nombre ?? esp.nombreEsp ?? `ID ${id}`;
        const turno = turnoLabel(esp.turno);
        const plazas = selected[id];
        const isSelected = plazas !== undefined;
        // The first checkbox carries the field id the error summary links to.
        const checkId = index === 0 ? "campo-especialidades" : `esp-${id}`;
        return (
          <div key={id} className={`checkbox-item flex-col !items-stretch gap-2 ${isSelected ? "checked" : ""}`}>
            <label htmlFor={checkId} className="flex cursor-pointer items-center gap-2">
              <input
                id={checkId}
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(id)}
              />
              <span className="item-label">
                {nombre}
                {esp.codigo && <span className="ml-1 text-xs text-muted">({esp.codigo})</span>}
                {turno && <span className="ml-1 text-xs text-muted">· {turno}</span>}
              </span>
            </label>
            {isSelected && (
              <div className="flex items-center gap-2 pl-6">
                <label htmlFor={`plazas-${id}`} className="text-sm text-charcoal-700">
                  Alumnos
                </label>
                <input
                  id={`plazas-${id}`}
                  type="number"
                  min="1"
                  max="99"
                  inputMode="numeric"
                  className="h-9 w-20 rounded-lg border border-surface-200 px-2 text-center text-sm focus-visible:border-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
                  value={plazas || ""}
                  onChange={(e) => onAmountChange(id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
    {error && (
      <p id="campo-especialidades-error" className="mb-0 mt-1.5 text-sm font-medium text-red-700">
        <span aria-hidden="true">! </span>
        {error}
      </p>
    )}
  </fieldset>
);

export default SpecialitySelector;
