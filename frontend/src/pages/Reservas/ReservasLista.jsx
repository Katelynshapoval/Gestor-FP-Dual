import { useMemo, useState } from "react";
import ReservaDetalle from "../../components/reservas/ReservaDetalle.jsx";
import ReservaResumenBadges from "../../components/reservas/ReservaResumenBadges.jsx";
import FilterBar, { FilterSelect, SearchField, countLabel } from "../../components/ui/FilterBar.jsx";
import { useUrlFilters } from "../../hooks/useUrlFilters.js";
import { coincide } from "../../utils/busqueda.js";
import { isCancelledReserva, isConfirmedReserva } from "../../utils/reservaEstados.js";
import { tipoContratoLabel } from "../../utils/labels.js";

// Staff overview of every reservation, grouped by what is needed next. All
// actions (contract type, annex, signatures, tutor, confirm, cancel, reassign)
// happen in the shared ReservaDetalle panel.
// The dashboard links here with ?grupo=…, using these same group keys
// (backend panelService.contarReservas mirrors grupoDe).
const FILTER_DEFAULTS = { q: "", convocatoria: "activa", grupo: "", especialidad: "" };

export function grupoDe(r) {
  if (isConfirmedReserva(r.estado_reserva)) return "definitivas";
  if (isCancelledReserva(r.estado_reserva)) return "canceladas";
  const anexo = r.documentos_resumen?.anexo;
  if (!anexo) return "sinTipo";
  if (anexo.estado_operativo === "VALIDADO") return "listas";
  if (anexo.estado_operativo === "PENDIENTE_VALIDACION") return "revisar";
  if (anexo.estado_operativo === "PENDIENTE_FIRMA") return "firmas";
  return "documento"; // pending upload/generation or rejected
}

const GRUPOS = [
  ["revisar", "Anexo pendiente de validar"],
  ["listas", "Anexo validado · pendientes de confirmar"],
  ["firmas", "Anexo pendiente de firmas"],
  ["documento", "Falta el anexo o fue rechazado"],
  ["sinTipo", "Pendientes de tipo de contrato"],
  ["definitivas", "Confirmadas"],
  ["canceladas", "Canceladas"],
];

const FilaReserva = ({ r, onOpen }) => (
  <div className="flex flex-col gap-3 rounded-lg border border-surface-200 bg-white px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-charcoal-950">{r.alumno}</p>
        <p className="text-xs text-muted">
          {r.dni_alumno} · {r.especialidad}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-charcoal-950">{r.empresa}</p>
        <p className="text-xs text-muted">
          {[r.convocatoria, tipoContratoLabel(r.tipo_contrato), r.tutor_nombre && `Tutor: ${r.tutor_nombre}`].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
    <div className="flex flex-col gap-2 md:items-end">
      <ReservaResumenBadges estado={r.estado_reserva} resumen={r.documentos_resumen} />
      <button
        type="button"
        className="btn btn-secondary btn-sm w-fit"
        onClick={() => onOpen(r.id_reserva)}
        aria-label={`Gestionar la reserva de ${r.alumno} en ${r.empresa}`}
      >
        Gestionar reserva
      </button>
    </div>
  </div>
);

const ReservasLista = ({ reservations, onReservationUpdate, activaNombre }) => {
  const [abierta, setAbierta] = useState(null);
  const { filters, setFilter, reset, active } = useUrlFilters(FILTER_DEFAULTS);
  const todas = useMemo(() => reservations || [], [reservations]);

  const convocatorias = useMemo(
    () => [...new Set(todas.map((r) => r.convocatoria).filter(Boolean))].sort().reverse(),
    [todas],
  );
  const especialidades = useMemo(
    () => [...new Set(todas.map((r) => r.especialidad).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [todas],
  );
  const hayActiva = todas.some((r) => Number(r.convocatoria_activa) === 1);

  const visibles = todas.filter((r) => {
    if (filters.convocatoria === "activa" && hayActiva && Number(r.convocatoria_activa) !== 1) return false;
    if (!["activa", "todas"].includes(filters.convocatoria) && r.convocatoria !== filters.convocatoria) return false;
    if (filters.grupo && grupoDe(r) !== filters.grupo) return false;
    if (filters.especialidad && r.especialidad !== filters.especialidad) return false;
    return coincide(filters.q, [r.alumno, r.dni_alumno, r.empresa, r.especialidad, r.tutor_nombre]);
  });

  const grupos = {};
  for (const r of visibles) {
    const key = grupoDe(r);
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(r);
  }

  return (
    <>
      <FilterBar
        label="Buscar y filtrar reservas"
        active={active}
        onReset={reset}
        count={active ? `${countLabel(visibles.length, "reserva", "reservas")} de ${todas.length}` : countLabel(visibles.length, "reserva", "reservas")}
      >
        <SearchField
          value={filters.q}
          onChange={(v) => setFilter("q", v)}
          placeholder="Alumno, DNI/NIE, empresa o tutor"
          className="sm:col-span-2 lg:col-span-1"
        />
        <FilterSelect
          label="Convocatoria"
          value={filters.convocatoria}
          onChange={(v) => setFilter("convocatoria", v)}
          options={[
            { value: "activa", label: activaNombre ? `Activa (${activaNombre})` : "Activa (ninguna)" },
            { value: "todas", label: "Todas" },
            ...convocatorias.map((c) => ({ value: c, label: c })),
          ]}
        />
        <FilterSelect
          label="Situación"
          value={filters.grupo}
          onChange={(v) => setFilter("grupo", v)}
          allLabel="Todas"
          options={GRUPOS.map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          label="Especialidad"
          value={filters.especialidad}
          onChange={(v) => setFilter("especialidad", v)}
          allLabel="Todas"
          options={especialidades.map((e) => ({ value: e, label: e }))}
        />
      </FilterBar>

      {visibles.length === 0 ? (
        <div role="status" className="rounded-xl2 border border-surface-200 bg-white p-10 text-center text-sm text-muted shadow-card">
          {todas.length === 0
            ? "Todavía no hay reservas."
            : active
              ? "No hay reservas que coincidan con la búsqueda o los filtros."
              : "No hay reservas en la convocatoria activa."}
          {todas.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-4 flex mx-auto"
              onClick={active ? reset : () => setFilter("convocatoria", "todas")}
            >
              {active ? "Quitar filtros" : "Ver todas las convocatorias"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {GRUPOS.map(([key, titulo]) =>
            grupos[key]?.length ? (
              <section key={key} className="space-y-2" aria-label={titulo}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-charcoal-700">
                  {titulo} ({grupos[key].length})
                </h2>
                {grupos[key].map((r) => (
                  <FilaReserva key={r.id_reserva} r={r} onOpen={setAbierta} />
                ))}
              </section>
            ) : null,
          )}
        </div>
      )}

      <ReservaDetalle
        idReserva={abierta}
        open={Boolean(abierta)}
        onClose={() => setAbierta(null)}
        onChanged={onReservationUpdate}
      />
    </>
  );
};

export default ReservasLista;
