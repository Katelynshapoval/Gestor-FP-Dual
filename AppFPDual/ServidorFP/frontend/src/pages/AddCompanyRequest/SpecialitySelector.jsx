// Selector de ciclos de grado con control de cantidad de alumnos por especialidad.
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
        const isSelected = specialities[0]?.includes(esp.idEspecialidad);

        return (
          <div
            key={esp.idEspecialidad}
            className={`checkbox-item ${isSelected ? "checked" : ""}`}
            onClick={() => onToggle(esp.idEspecialidad)}
          >
            <div className="checkbox-left">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => e.stopPropagation()}
              />
              <span className="item-label capitalize">
                {esp.nombreEsp.toLowerCase()}
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
                    specialities[1][specialities[0].indexOf(esp.idEspecialidad)]
                  }
                  onChange={(e) =>
                    onAmountChange(
                      esp.idEspecialidad,
                      parseInt(e.target.value) || 1,
                    )
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
