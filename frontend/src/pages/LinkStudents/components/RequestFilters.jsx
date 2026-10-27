import FilterBar, { FilterSelect, SearchField, countLabel } from "../../../components/ui/FilterBar.jsx";
import { SOLICITUD } from "../../../utils/labels.js";
import { CONVOCATORIA_ACTIVA, CONVOCATORIA_TODAS } from "../hooks/useLinkStudents";

const RESERVA_OPCIONES = [
  { value: "SIN_RESERVA", label: "Sin reserva" },
  { value: "PENDIENTE", label: "Con reserva pendiente" },
  { value: "CONFIRMADA", label: "Con plaza confirmada" },
];

// Search and filters of the Alumnos list. Companies only search and filter by
// especialidad: their list is already limited to the active convocatoria.
const RequestFilters = ({ filters, setFilter, onReset, active, specialities, convocatorias, activaNombre, isEmpresa, count }) => (
  <FilterBar count={count} onReset={onReset} active={active} label="Buscar y filtrar alumnos">
    <SearchField
      label="Buscar"
      value={filters.q}
      onChange={(v) => setFilter("q", v)}
      placeholder={isEmpresa ? "Nombre o DNI/NIE" : "Nombre, DNI/NIE o empresa"}
      className="sm:col-span-2 lg:col-span-1"
    />
    {!isEmpresa && (
      <FilterSelect
        label="Convocatoria"
        value={filters.convocatoria}
        onChange={(v) => setFilter("convocatoria", v)}
        options={[
          { value: CONVOCATORIA_ACTIVA, label: activaNombre ? `Activa (${activaNombre})` : "Activa (ninguna)" },
          { value: CONVOCATORIA_TODAS, label: "Todas" },
          ...convocatorias.map((c) => ({ value: c, label: c })),
        ]}
      />
    )}
    <FilterSelect
      label="Especialidad"
      value={filters.especialidad}
      onChange={(v) => setFilter("especialidad", v)}
      allLabel="Todas"
      options={specialities.map((e) => ({ value: e, label: e }))}
    />
    {!isEmpresa && (
      <FilterSelect
        label="Solicitud"
        value={filters.estado}
        onChange={(v) => setFilter("estado", v)}
        allLabel="Todos los estados"
        options={Object.entries(SOLICITUD).map(([value, { label }]) => ({ value, label }))}
      />
    )}
    {!isEmpresa && (
      <FilterSelect
        label="Reserva"
        value={filters.reserva}
        onChange={(v) => setFilter("reserva", v)}
        allLabel="Cualquiera"
        options={RESERVA_OPCIONES}
      />
    )}
  </FilterBar>
);

export { countLabel };
export default RequestFilters;
