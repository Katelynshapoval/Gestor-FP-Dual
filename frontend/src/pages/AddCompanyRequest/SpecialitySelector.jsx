// Selector de ciclos de grado con control de cantidad de alumnos por especialidad.
// Acepta tanto el formato legacy (idEspecialidad/nombreEsp) como el nuevo (id_especialidad/nombre).
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
        // Compatibilidad con ambos formatos de datos
        const id = esp.id_especialidad ?? esp.idEspecialidad;
        const label = esp.nombre ?? esp.nombreEsp ?? `ID ${id}`;
        const turno = esp.turno;
        const isSelected = specialities[0]?.includes(id);

        return (
          <div
            key={id}
            className={`checkbox-item ${isSelected ? "checked" : ""}`}
            onClick={() => onToggle(id)}
          >
            <div className="checkbox-left">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => e.stopPropagation()}
              />
              <span className="item-label capitalize">
                {label.toLowerCase()}
                {turno && turno !== "DIURNO" && (
                  <span className="ml-1 text-xs text-gray-400">({turno})</span>
                )}
              </span>
            </div>

            {isSelected && (
              <div
                className="flex items-center gap-2 rounded-md px-2 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-sm text-gray-500">Alumnos</span>

                <input
                  type="number"
                  min="1"
                  className="w-14 text-center text-sm border border-surface-200 rounded px-1 py-[2px]"
                  value={
                    specialities[1][specialities[0].indexOf(id)] || ""
                  }
                  onChange={(e) =>
                    onAmountChange(id, parseInt(e.target.value) || 1)
                  }
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
