import { useEffect, useState } from "react";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdOutlineFileUpload, MdPendingActions } from "react-icons/md";
import ReservaDocViewer from "./ReservaDocViewer";
import {
  isCancelledReserva,
  isConfirmedReserva,
  isPendingReserva,
} from "../../../utils/reservaEstados.js";

function estadoLabel(r) {
  if (isConfirmedReserva(r.estado_reserva)) {
    return {
      text: "Asignado definitivamente",
      cls: "bg-green-50 text-green-700 border-green-200",
      Icono: IoIosCheckmarkCircleOutline,
    };
  }
  if (r.id_documento_reserva && r.estado_documento === "PENDIENTE") {
    return {
      text: "Documento entregado",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      Icono: MdPendingActions,
    };
  }
  if (r.id_documento_reserva && r.estado_documento === "VALIDADO") {
    return {
      text: "Documento validado",
      cls: "bg-green-50 text-green-700 border-green-200",
      Icono: IoIosCheckmarkCircleOutline,
    };
  }
  return {
    text: "Solo reservado",
    cls: "bg-gray-50 text-gray-500 border-gray-200",
    Icono: MdOutlineCancel,
  };
}

const CancelModal = ({ reserva, onConfirm, onClose }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-xl2 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">Cancelar reserva</h3>
        <p className="text-sm text-gray-500">
          Indica el motivo de cancelación para <strong>{reserva.alumno}</strong> en{" "}
          <strong>{reserva.empresa}</strong>.
        </p>
        <textarea
          className="textarea min-h-24 text-sm"
          rows={3}
          placeholder="Motivo de cancelación..."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={255}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!motivo.trim() || submitting}
            className={`btn btn-primary btn-sm shadow-none ${!motivo.trim() || submitting ? "btn-disabled" : ""}`}
          >
            {submitting ? "Cancelando..." : "Confirmar cancelación"}
          </button>
        </div>
      </div>
    </div>
  );
};

const FilaReserva = ({ r, onVerDoc, onCancel }) => {
  const { text, cls, Icono } = estadoLabel(r);
  const canCancel = isPendingReserva(r.estado_reserva) || isConfirmedReserva(r.estado_reserva);

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-4 rounded-lg border bg-white px-4 py-3 text-sm">
      <div>
        <p className="font-medium text-gray-900">{r.empresa}</p>
        <p className="text-xs text-gray-400">{r.email_coordinador}</p>
      </div>

      <div>
        <p className="font-medium text-gray-900">{r.alumno}</p>
        <p className="text-xs text-gray-400">
          {r.dni_alumno} · {r.especialidad}
        </p>
      </div>

      <span className={`flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${cls}`}>
        <Icono className="shrink-0 text-sm" />
        {text}
      </span>

      <div className="flex items-center gap-2">
        {r.id_documento_reserva && (
          <button
            type="button"
            onClick={() => onVerDoc(r)}
            title="Ver documento firmado"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-[background-color,border-color,color] duration-150 ease-out hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25"
          >
            <MdOutlineFileUpload className="text-brand-600" />
            Ver doc
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => onCancel(r)}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
};

const ReservasAdmin = ({ reservations, onReservationUpdate, onAdminCancel }) => {
  const [viewingDoc, setViewingDoc] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  useEffect(() => {
    if (!viewingDoc) return;
    const updated = (reservations || []).find((r) => r.id_reserva === viewingDoc.id_reserva);
    if (!updated) return;
    if (
      updated.estado_documento !== viewingDoc.estado_documento ||
      updated.estado_reserva !== viewingDoc.estado_reserva
    ) {
      setViewingDoc(updated);
    }
  }, [reservations, viewingDoc]);

  if (!reservations || reservations.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No hay reservas activas en este momento.
      </p>
    );
  }

  const conDocPendiente = reservations.filter(
    (r) => r.id_documento_reserva && r.estado_documento === "PENDIENTE"
  );
  const sinDoc = reservations.filter(
    (r) => !r.id_documento_reserva && isPendingReserva(r.estado_reserva)
  );
  const definitivas = reservations.filter((r) => isConfirmedReserva(r.estado_reserva));
  const canceladas = reservations.filter((r) => isCancelledReserva(r.estado_reserva));

  const Grupo = ({ titulo, items }) =>
    items.length === 0 ? null : (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {titulo} ({items.length})
        </p>
        {items.map((r) => (
          <FilaReserva
            key={r.id_reserva}
            r={r}
            onVerDoc={setViewingDoc}
            onCancel={setCancelTarget}
          />
        ))}
      </div>
    );

  return (
    <>
      {cancelTarget && (
        <CancelModal
          reserva={cancelTarget}
          onConfirm={async (motivo) => {
            await onAdminCancel(cancelTarget.id_reserva, motivo);
            setCancelTarget(null);
          }}
          onClose={() => setCancelTarget(null)}
        />
      )}

      <div className="space-y-6">
        <Grupo titulo="Documentos pendientes de validación" items={conDocPendiente} />
        <Grupo titulo="Pendientes de documento" items={sinDoc} />
        <Grupo titulo="Asignaciones definitivas" items={definitivas} />
        <Grupo titulo="Canceladas" items={canceladas} />
      </div>

      <ReservaDocViewer
        reserva={viewingDoc}
        onClose={() => setViewingDoc(null)}
        onReservationUpdate={onReservationUpdate}
      />
    </>
  );
};

export default ReservasAdmin;
