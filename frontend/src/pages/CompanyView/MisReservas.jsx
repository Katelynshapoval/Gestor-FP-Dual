import { useState } from "react";
import { RxClock } from "react-icons/rx";
import { isCancelledReserva } from "../../utils/reservaEstados.js";
import ReservaDetalle from "../../components/reservas/ReservaDetalle.jsx";
import ReservaResumenBadges from "../../components/reservas/ReservaResumenBadges.jsx";
import { tipoContratoLabel } from "../../utils/labels.js";

// Company portal › Mis reservas. Each reservation opens the shared ReservaDetalle
// panel, where the company uploads/signs its Anexo II or III, assigns a tutor and
// cancels a pending reservation (the same panel staff use, limited to the
// company's own actions; PM-7: one annex upload path).
const MisReservas = ({ reservations, onChanged }) => {
  const [abierta, setAbierta] = useState(null);

  if (!reservations || reservations.length === 0) {
    return (
      <div className="rounded-xl2 border border-surface-200 bg-surface-50 px-6 py-10 text-center">
        <RxClock className="mx-auto mb-2 text-2xl text-surface-300" aria-hidden="true" />
        <p className="text-sm text-muted">No tienes alumnos reservados todavía.</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-surface-200 overflow-hidden rounded-xl2 border border-surface-200 bg-white">
        {reservations.map((reserva) => {
          const isCancelled = isCancelledReserva(reserva.estado_reserva);
          return (
            <article
              key={reserva.id_reserva}
              className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between ${
                isCancelled ? "bg-surface-50/70" : "bg-white"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-charcoal-950" title={reserva.alumno || undefined}>{reserva.alumno || "Alumno"}</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {[reserva.especialidad, tipoContratoLabel(reserva.tipo_contrato), reserva.tutor_nombre && `Tutor: ${reserva.tutor_nombre}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {isCancelled && reserva.motivo && (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    <span className="font-semibold text-charcoal-700">Motivo:</span> {reserva.motivo}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <ReservaResumenBadges estado={reserva.estado_reserva} resumen={reserva.documentos_resumen} />
                <button type="button" className="btn btn-secondary btn-sm w-fit" onClick={() => setAbierta(reserva.id_reserva)}>
                  {isCancelled ? "Ver detalle" : "Ver y gestionar"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <ReservaDetalle
        idReserva={abierta}
        open={Boolean(abierta)}
        onClose={() => setAbierta(null)}
        onChanged={onChanged}
      />
    </>
  );
};

export default MisReservas;
