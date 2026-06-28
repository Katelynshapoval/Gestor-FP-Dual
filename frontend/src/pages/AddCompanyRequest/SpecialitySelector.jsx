// Speciality selector with per-speciality student count input
const SpecialitySelector = ({
  dataSpecialities,
  specialities,
  onToggle,
  onAmountChange,
}) => (
  <div className="field">
    <label>Ciclo(s) de Grado solicitados</label>

    <div className="checkbox-grid">
      {dataSpecialities.map((esp) => {
        const id = esp.id_especialidad ?? esp.idEspecialidad;
        const nombre = esp.nombre ?? esp.nombreEsp ?? `ID ${id}`;
        const codigo = esp.codigo;
        const turnoRaw = esp.turno;
        const turnoLabel =
          turnoRaw === 0 || turnoRaw === '0' ? 'Diurno'
          : turnoRaw === 1 || turnoRaw === '1' ? 'Vespertino'
          : turnoRaw === 'VESPERTINO' ? 'Vespertino'
          : null;
        const isSelected = specialities[0]?.includes(id);

        return (
          <div
            key={id}
            className={`checkbox-item ${isSelected ? "checked items-start flex-col gap-2" : ""}`}
            onClick={() => onToggle(id)}
          >
            <div className="checkbox-left">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => e.stopPropagation()}
              />
              <span className="item-label">
                {nombre}
                {codigo && (
                  <span className="ml-1 text-xs text-gray-400">({codigo})</span>
                )}
                {turnoLabel && turnoLabel !== 'Diurno' && (
                  <span className="ml-1 text-xs text-gray-400">· {turnoLabel}</span>
                )}
              </span>
            </div>

            {isSelected && (
              <div
                className="flex items-center gap-2 pl-5"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-sm text-gray-500">Alumnos</span>
                <input
                  type="number"
                  min="1"
                  className="w-14 text-center text-sm border border-surface-200 rounded px-1 py-[2px]"
                  value={specialities[1][specialities[0].indexOf(id)] || ""}
                  onChange={(e) => onAmountChange(id, parseInt(e.target.value) || 1)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export default SpecialitySelector;
