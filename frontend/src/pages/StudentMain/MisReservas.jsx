import { useState } from "react";
import EstadoBadge from "../../components/ui/EstadoBadge.jsx";
import ReservaDetalle from "../../components/reservas/ReservaDetalle.jsx";
import ReservaResumenBadges from "../../components/reservas/ReservaResumenBadges.jsx";
import { isCancelledReserva, isConfirmedReserva, isPendingReserva } from "../../utils/reservaEstados.js";
import { tipoContratoLabel } from "../../utils/labels.js";

function DatosReserva({ reserva, onOpen }) {
  return (
    <>
      {reserva.especialidad && <p className="mt-1 text-xs text-muted">{reserva.especialidad}</p>}
      {reserva.tipo_contrato && <p className="mt-1 text-xs text-muted">Contrato: {tipoContratoLabel(reserva.tipo_contrato)}</p>}
      {reserva.tutor_nombre && (
        <div className="mt-3 rounded-md border border-surface-200 bg-white/70 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Tutor de empresa</p>
          <p className="mt-1 text-sm font-medium text-charcoal-950">{reserva.tutor_nombre}</p>
          {reserva.tutor_email && <p className="mt-0.5 text-xs text-muted">{reserva.tutor_email}</p>}
          {reserva.tutor_telefono && <p className="mt-0.5 text-xs text-muted">{reserva.tutor_telefono}</p>}
        </div>
      )}
      {!isCancelledReserva(reserva.estado_reserva) && (
        <ReservaResumenBadges className="mt-3" estado={reserva.estado_reserva} resumen={reserva.documentos_resumen} showEstado={false} />
      )}
      <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => onOpen(reserva.id_reserva)}>
        Ver detalle y documentos
      </button>
    </>
  );
}

export default function MisReservas({ reservas = [], onChanged }) {
  const [abierta, setAbierta] = useState(null);
  const confirmed = reservas.filter((r) => isConfirmedReserva(r.estado_reserva));
  const pending = reservas.filter((r) => isPendingReserva(r.estado_reserva));
  const cancelled = reservas.filter((r) => isCancelledReserva(r.estado_reserva));
  const hasDefinitive = confirmed.length > 0;

  return (
    <div className="form-card">
      <p className="form-section-title">Mis reservas</p>
      <p className="field-hint">
        Las empresas eligen candidatos. Aquí solo aparecen reservas reales sobre tu solicitud.
      </p>

      {reservas.length === 0 && (
        <p className="text-sm text-muted">Actualmente ninguna empresa ha reservado tu candidatura.</p>
      )}

      {hasDefinitive && (
        <div className="mb-5 space-y-3">
          {confirmed.map((r) => (
            <div key={r.id_reserva} className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <EstadoBadge kind="reserva" value="CONFIRMADA" labelOverride="Plaza confirmada" />
              <p className="mt-3 text-sm font-semibold text-charcoal-950">
                Tu plaza con {r.empresa} está confirmada.
              </p>
              <DatosReserva reserva={r} onOpen={setAbierta} />
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-5 space-y-3">
          {pending.map((r) => (
            <div
              key={r.id_reserva}
              className={`rounded-lg border px-4 py-3 ${
                hasDefinitive ? "border-surface-200 bg-surface-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <EstadoBadge kind="reserva" value="PENDIENTE" labelOverride="Reserva pendiente" />
              <p className="mt-3 text-sm font-semibold text-charcoal-950">
                {r.empresa} ha reservado tu candidatura. El proceso está pendiente de confirmación.
              </p>
              {hasDefinitive && (
                <p className="mt-1 text-xs text-muted">Esta reserva no es la plaza definitiva.</p>
              )}
              <DatosReserva reserva={r} onOpen={setAbierta} />
            </div>
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Historial</p>
          {cancelled.map((r) => (
            <div key={r.id_reserva} className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <EstadoBadge kind="reserva" value="CANCELADA" labelOverride="Reserva cancelada" />
              <p className="mt-3 text-sm text-charcoal-800">La reserva de {r.empresa} fue cancelada.</p>
              <DatosReserva reserva={r} onOpen={setAbierta} />
              {r.motivo && <p className="mt-1 text-xs italic text-muted">Motivo: {r.motivo}</p>}
            </div>
          ))}
        </div>
      )}
      <ReservaDetalle
        idReserva={abierta}
        open={Boolean(abierta)}
        onClose={() => setAbierta(null)}
        onChanged={onChanged}
      />
    </div>
  );
}
