import { useMemo, useState } from "react";
import ReservaDetalle from "../../../components/reservas/ReservaDetalle.jsx";
import ReservaResumenBadges from "../../../components/reservas/ReservaResumenBadges.jsx";
import { isCancelledReserva, isConfirmedReserva } from "../../../utils/reservaEstados.js";

// Staff overview of every reservation, grouped by what is needed next. All
// actions (contract type, annex, signatures, tutor, confirm, cancel, reassign)
// happen in the shared ReservaDetalle panel.
const ACTIVA = "__activa__";

function grupoDe(r) {
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
          {[r.convocatoria, r.tipo_contrato, r.tutor_nombre && `Tutor: ${r.tutor_nombre}`].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
    <div className="flex flex-col gap-2 md:items-end">
      <ReservaResumenBadges estado={r.estado_reserva} resumen={r.documentos_resumen} />
      <button type="button" className="btn btn-secondary btn-sm w-fit" onClick={() => onOpen(r.id_reserva)}>
        Gestionar reserva
      </button>
    </div>
  </div>
);

const ReservasAdmin = ({ reservations, onReservationUpdate }) => {
  const [abierta, setAbierta] = useState(null);
  const [convocatoria, setConvocatoria] = useState(ACTIVA);

  const convocatorias = useMemo(
    () => [...new Set((reservations || []).map((r) => r.convocatoria).filter(Boolean))].sort().reverse(),
    [reservations],
  );
  const hayActiva = (reservations || []).some((r) => Number(r.convocatoria_activa) === 1);
  const filtro = convocatoria === ACTIVA && !hayActiva ? "" : convocatoria;

  const visibles = (reservations || []).filter((r) => {
    if (!filtro) return true;
    if (filtro === ACTIVA) return Number(r.convocatoria_activa) === 1;
    return r.convocatoria === filtro;
  });

  const grupos = {};
  for (const r of visibles) {
    const key = grupoDe(r);
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(r);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <label htmlFor="reservas-convocatoria" className="text-[0.8rem] font-semibold text-muted">
          Convocatoria:
        </label>
        <select
          id="reservas-convocatoria"
          className="select-input w-full py-2 text-sm sm:w-auto"
          value={filtro}
          onChange={(e) => setConvocatoria(e.target.value)}
        >
          {hayActiva && <option value={ACTIVA}>Convocatoria activa</option>}
          <option value="">Todas</option>
          {convocatorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {visibles.length} reserva{visibles.length !== 1 ? "s" : ""}
        </span>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl2 border border-surface-200 bg-white p-10 text-center text-sm text-muted shadow-card">
          {(reservations || []).length === 0
            ? "Todavía no hay reservas."
            : "No hay reservas en esta convocatoria."}
        </p>
      ) : (
        <div className="space-y-6">
          {GRUPOS.map(([key, titulo]) =>
            grupos[key]?.length ? (
              <section key={key} className="space-y-2" aria-label={titulo}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {titulo} ({grupos[key].length})
                </h3>
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

export default ReservasAdmin;
