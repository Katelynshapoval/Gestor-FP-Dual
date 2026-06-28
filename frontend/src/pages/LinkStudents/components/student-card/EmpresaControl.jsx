import { empresaSlotClass } from "../../../../components/ui/cardStyles";

const ESTADO_CLS = {
  PENDIENTE:  "bg-yellow-50 text-yellow-800 border-yellow-200",
  CONFIRMADA: "bg-green-50 text-green-800 border-green-200",
  CANCELADA:  "bg-red-50 text-red-700 border-red-200",
};

// Displays the dynamic list of reservations for a student (staff view).
const EmpresaControl = ({ r }) => {
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

        return (
          <div key={rv.id_reserva} className={empresaSlotClass}>
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <p className="text-base font-semibold">{rv.empresa}</p>
                {rv.tipo_contrato && (
                  <span className="text-xs text-muted">Contrato: {rv.tipo_contrato}</span>
                )}
                {rv.motivo && rv.estado_reserva === "CANCELADA" && (
                  <span className="text-xs italic text-muted">Motivo: {rv.motivo}</span>
                )}
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusCls}`}>
                {rv.estado_reserva}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EmpresaControl;
