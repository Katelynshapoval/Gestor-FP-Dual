import { empresaSlotClass } from "../../../../components/ui/cardStyles";

// Colores de estado de la reserva
const ESTADO_CLS = {
  PENDIENTE: "bg-yellow-50 text-yellow-800 border-yellow-200",
  CONFIRMADA: "bg-green-50 text-green-800 border-green-200",
  CANCELADA: "bg-red-50 text-red-700 border-red-200",
};

// Muestra las reservas activas de un alumno para que el staff las vea.
// Reemplaza el modelo de 3 slots fijos con una lista dinámica de reservas.
const EmpresaControl = ({ r, sendingInfo, canSendInfo, onSendInfo }) => {
  const reservas = r.reservas || [];

  if (reservas.length === 0) {
    return (
      <div className={empresaSlotClass}>
        <p className="text-sm text-gray-400">Sin reservas</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reservas.map((rv) => {
        const statusCls = ESTADO_CLS[rv.estado_reserva] || "bg-gray-50 text-gray-600 border-gray-200";
        const buttonId = `${r.id_solicitud_alumno}-${rv.id_empresa}`;
        const isSending = sendingInfo.has(buttonId);
        const confirmedAndDoc = rv.estado_reserva === "CONFIRMADA" && rv.id_documento_reserva;

        return (
          <div key={rv.id_reserva} className={empresaSlotClass}>
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <p className="text-base font-semibold">{rv.empresa}</p>
                {rv.tipo_contrato && (
                  <span className="text-xs text-muted">Contrato: {rv.tipo_contrato}</span>
                )}
                {rv.motivo && rv.estado_reserva === "CANCELADA" && (
                  <span className="text-xs text-muted italic">Motivo: {rv.motivo}</span>
                )}
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCls}`}
              >
                {rv.estado_reserva}
              </span>
            </div>

            {canSendInfo && confirmedAndDoc && (
              <button
                onClick={() => onSendInfo(r.id_solicitud_alumno, rv.id_empresa)}
                className={`btn btn-sm w-fit ${
                  isSending ? "btn-disabled btn-secondary" : "btn-primary"
                }`}
                disabled={isSending}
              >
                {isSending ? "Enviando..." : "Enviar info a empresa"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default EmpresaControl;
