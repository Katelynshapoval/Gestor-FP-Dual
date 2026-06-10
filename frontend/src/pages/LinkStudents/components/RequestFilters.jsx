import {
  buildYearOptions,
  FILTER_LABEL_CLASS,
  FILTER_SELECT_CLASS,
  SPECIALITY_SELECT_CLASS,
} from "../utils/filters";

const RequestFilters = ({
  selectedYear,
  onYearChange,
  selectedSpeciality,
  onSpecialityChange,
  specialities,
  yearOptionCount,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full sm:w-auto flex-wrap">
    <div className="flex items-center gap-2">
      <label className={FILTER_LABEL_CLASS}>Curso:</label>
      <select
        className={FILTER_SELECT_CLASS}
        value={selectedYear}
        onChange={(e) => onYearChange(e.target.value)}
      >
        {buildYearOptions(yearOptionCount).map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>

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
