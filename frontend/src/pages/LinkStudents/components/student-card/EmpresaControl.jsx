import { useEffect, useState } from "react";
import { getJSON } from "../../../../utils/api.js";
import { empresaSlotClass } from "../../../../components/ui/cardStyles";
import {
  ESTADOS_RESERVA,
  isCancelledReserva,
  isConfirmedReserva,
  isPendingReserva,
} from "../../../../utils/reservaEstados.js";

const ESTADO_CLS = {
  [ESTADOS_RESERVA.PENDIENTE]: "bg-yellow-50 text-yellow-800 border-yellow-200",
  [ESTADOS_RESERVA.CONFIRMADA]: "bg-green-50 text-green-800 border-green-200",
  [ESTADOS_RESERVA.CANCELADA]: "bg-red-50 text-red-700 border-red-200",
};

const MotivoModal = ({ title, description, confirmLabel, onConfirm, onClose }) => {
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!motivo.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(motivo.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md space-y-4 rounded-xl2 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          rows={3}
          placeholder="Motivo…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={255}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!motivo.trim() || submitting}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              !motivo.trim() || submitting
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {submitting ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReassignModal = ({ ofertas, onConfirm, onClose }) => {
  const [idOferta, setIdOferta] = useState(ofertas[0]?.id_solicitud_empresa_especialidad || "");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!idOferta || !motivo.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(Number(idOferta), motivo.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md space-y-4 rounded-xl2 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900">Reasignar alumno</h3>
        <p className="text-sm text-gray-500">
          La reserva actual se cancelará y se creará una nueva reserva pendiente en la empresa
          seleccionada. Si la nueva reserva no puede crearse, se mantiene la anterior.
        </p>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          value={idOferta}
          onChange={(e) => setIdOferta(e.target.value)}
        >
          {ofertas.map((o) => (
            <option key={o.id_solicitud_empresa_especialidad} value={o.id_solicitud_empresa_especialidad}>
              {o.empresa} · {o.especialidad} ({o.plazas_disponibles} plazas)
            </option>
          ))}
        </select>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          rows={3}
          placeholder="Motivo de la reasignación…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={255}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!idOferta || !motivo.trim() || submitting}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              !idOferta || !motivo.trim() || submitting
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {submitting ? "Reasignando…" : "Confirmar reasignación"}
          </button>
        </div>
      </div>
    </div>
  );
};

const EmpresaControl = ({ r, onAdminReserve, onAdminCancel, onAdminReassign }) => {
  const reservas = r.reservas || [];
  const [ofertas, setOfertas] = useState([]);
  const [idOfertaNueva, setIdOfertaNueva] = useState("");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!r.id_solicitud_alumno) return;
    getJSON(`/reservas/ofertas-elegibles?id_solicitud_alumno=${r.id_solicitud_alumno}`)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setOfertas(list);
        setIdOfertaNueva(list[0]?.id_solicitud_empresa_especialidad || "");
      })
      .catch(() => {
        setOfertas([]);
        setIdOfertaNueva("");
      });
  }, [r.id_solicitud_alumno, r.reservas]);

  const handleNewReserve = async () => {
    if (!idOfertaNueva) return;
    const oferta = ofertas.find(
      (o) => String(o.id_solicitud_empresa_especialidad) === String(idOfertaNueva),
    );
    if (!window.confirm(`¿Crear una reserva pendiente con ${oferta?.empresa || "esta empresa"}?`)) {
      return;
    }
    setBusy(true);
    try {
      await onAdminReserve(r.id_solicitud_alumno, Number(idOfertaNueva));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {cancelTarget && (
        <MotivoModal
          title="Cancelar reserva"
          description={`Indica el motivo de cancelación para la reserva de ${cancelTarget.empresa}.`}
          confirmLabel="Confirmar cancelación"
          onConfirm={async (motivo) => {
            await onAdminCancel(cancelTarget.id_reserva, motivo);
            setCancelTarget(null);
          }}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {reassignTarget && (
        <ReassignModal
          ofertas={ofertas}
          onConfirm={async (idOferta, motivo) => {
            await onAdminReassign(reassignTarget.id_reserva, idOferta, motivo);
            setReassignTarget(null);
          }}
          onClose={() => setReassignTarget(null)}
        />
      )}

      {reservas.length === 0 && (
        <div className={empresaSlotClass}>
          <p className="text-sm text-gray-400">Sin reservas</p>
        </div>
      )}

      {reservas.map((rv) => {
        const statusCls = ESTADO_CLS[rv.estado_reserva] || "bg-gray-50 text-gray-600 border-gray-200";
        const canMutate = isPendingReserva(rv.estado_reserva) || isConfirmedReserva(rv.estado_reserva);

        return (
          <div key={rv.id_reserva} className={empresaSlotClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <p className="text-base font-semibold">{rv.empresa}</p>
                {rv.tipo_contrato && (
                  <span className="text-xs text-muted">Contrato: {rv.tipo_contrato}</span>
                )}
                {rv.motivo && isCancelledReserva(rv.estado_reserva) && (
                  <span className="text-xs italic text-muted">Motivo: {rv.motivo}</span>
                )}
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusCls}`}>
                {rv.estado_reserva}
              </span>
            </div>
            {canMutate && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCancelTarget(rv)}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
                >
                  Cancelar
                </button>
                {ofertas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReassignTarget(rv)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                  >
                    Reasignar
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className={empresaSlotClass}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
          Reservar en empresa
        </p>
        {ofertas.length === 0 ? (
          <p className="text-sm text-gray-400">
            No hay ofertas elegibles (misma especialidad y convocatoria, empresa validada y con
            plazas).
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
              value={idOfertaNueva}
              onChange={(e) => setIdOfertaNueva(e.target.value)}
            >
              {ofertas.map((o) => (
                <option key={o.id_solicitud_empresa_especialidad} value={o.id_solicitud_empresa_especialidad}>
                  {o.empresa} · {o.especialidad} ({o.plazas_disponibles} plazas)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleNewReserve}
              disabled={!idOfertaNueva || busy}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-colors duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reservar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmpresaControl;
