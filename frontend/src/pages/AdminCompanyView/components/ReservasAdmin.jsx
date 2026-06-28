import { useState } from "react";
import { FaFilePdf } from "react-icons/fa6";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdPendingActions, MdOutlineCancel } from "react-icons/md";
import ReservaDocViewer from "./ReservaDocViewer";

// Estado visual de la reserva según los campos del nuevo modelo
function estadoLabel(r) {
  if (r.estado_reserva === "CONFIRMADA") {
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

// Fila individual de reserva en el panel de admin
const FilaReserva = ({ r, onVerDoc }) => {
  const { text, cls, Icono } = estadoLabel(r);

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-4 rounded-lg border bg-white px-4 py-3 text-sm">
      {/* Empresa */}
      <div>
        <p className="font-medium text-gray-900">{r.empresa}</p>
        <p className="text-xs text-gray-400">{r.email_coordinador}</p>
      </div>

      {/* Alumno */}
      <div>
        <p className="font-medium text-gray-900">{r.alumno}</p>
        <p className="text-xs text-gray-400">
          {r.dni_alumno} · {r.especialidad}
        </p>
      </div>

      {/* Estado */}
      <span className={`flex w-fit items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium ${cls}`}>
        <Icono className="shrink-0 text-sm" />
        {text}
      </span>

      {/* Acciones */}
      <div className="flex items-center gap-2">
        {r.id_documento_reserva && (
          <button
            type="button"
            onClick={() => onVerDoc(r)}
            title="Ver documento firmado"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-100"
          >
            <FaFilePdf className="text-red-500" />
            Ver doc
          </button>
        )}
      </div>
    </div>
  );
};

// Panel completo de reservas para el administrador
const ReservasAdmin = ({ reservations, onReservationUpdate }) => {
  const [viewingDoc, setViewingDoc] = useState(null);

  if (!reservations || reservations.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No hay reservas activas en este momento.
      </p>
    );
  }

  // Agrupa por estado para mostrar primero los que necesitan acción
  const conDocPendiente = reservations.filter(
    (r) => r.id_documento_reserva && r.estado_documento === "PENDIENTE"
  );
  const sinDoc = reservations.filter(
    (r) => !r.id_documento_reserva && r.estado_reserva !== "CANCELADA" && r.estado_reserva !== "CONFIRMADA"
  );
  const definitivas = reservations.filter(
    (r) => r.estado_reserva === "CONFIRMADA"
  );
  const canceladas = reservations.filter(
    (r) => r.estado_reserva === "CANCELADA"
  );

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
          />
        ))}
      </div>
    );

  return (
    <>
      <div className="space-y-6">
        <Grupo titulo="Documentos pendientes de validación" items={conDocPendiente} />
        <Grupo titulo="Pendientes de documento" items={sinDoc} />
        <Grupo titulo="Asignaciones definitivas" items={definitivas} />
        <Grupo titulo="Canceladas" items={canceladas} />
      </div>

      {/* Modal de visualización de documento */}
      <ReservaDocViewer
        reserva={viewingDoc}
        onClose={() => setViewingDoc(null)}
        onReservationUpdate={onReservationUpdate}
      />
    </>
  );
};

export default ReservasAdmin;
