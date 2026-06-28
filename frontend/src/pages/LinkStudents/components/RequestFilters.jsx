import {
  FILTER_LABEL_CLASS,
  FILTER_SELECT_CLASS,
  SPECIALITY_SELECT_CLASS,
} from "../utils/filters";

// Speciality and convocatoria filter controls for the linking view (staff only)
const RequestFilters = ({
  selectedSpeciality,
  onSpecialityChange,
  selectedConvocatoria,
  onConvocatoriaChange,
  specialities,
  convocatorias,
  isEmpresa,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full sm:w-auto flex-wrap">
    {!isEmpresa && convocatorias.length > 0 && (
      <div className="flex items-center gap-2">
        <label className={FILTER_LABEL_CLASS}>Convocatoria:</label>
        <select
          className={FILTER_SELECT_CLASS}
          value={selectedConvocatoria}
          onChange={(e) => onConvocatoriaChange(e.target.value)}
        >
          <option value="">Todas</option>
          {convocatorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    )}

    <div className="flex items-center gap-2">
      <label className={FILTER_LABEL_CLASS}>Especialidad:</label>
      <select
        className={SPECIALITY_SELECT_CLASS}
        value={selectedSpeciality}
        onChange={(e) => onSpecialityChange(e.target.value)}
      >
        <option value="">Todas</option>
        {specialities.map((esp) => (
          <option key={esp} value={esp}>
            {esp}
          </option>
        ))}
      </select>
    </div>
  </div>
);

export default RequestFilters;
