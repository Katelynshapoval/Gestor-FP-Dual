export const ESTADOS_RESERVA = Object.freeze({
  PENDIENTE: "PENDIENTE",
  CONFIRMADA: "CONFIRMADA",
  CANCELADA: "CANCELADA",
});

export const isPendingReserva = (estado) => estado === ESTADOS_RESERVA.PENDIENTE;
export const isConfirmedReserva = (estado) => estado === ESTADOS_RESERVA.CONFIRMADA;
export const isCancelledReserva = (estado) => estado === ESTADOS_RESERVA.CANCELADA;

const BORDERED = {
  [ESTADOS_RESERVA.CONFIRMADA]: "border-green-200 bg-green-50 text-green-800",
  [ESTADOS_RESERVA.PENDIENTE]: "border-amber-200 bg-amber-50 text-amber-800",
  [ESTADOS_RESERVA.CANCELADA]: "border-red-200 bg-red-50 text-red-700",
};

const COMPACT = {
  [ESTADOS_RESERVA.CONFIRMADA]: "bg-green-500/10 text-green-800",
  [ESTADOS_RESERVA.PENDIENTE]: "bg-yellow-400/15 text-yellow-800",
  [ESTADOS_RESERVA.CANCELADA]: "bg-red-500/10 text-red-800",
};

export const reservaEstadoClass = (estado, { bordered = true } = {}) => {
  const map = bordered ? BORDERED : COMPACT;
  return map[estado] || (bordered ? "border-gray-200 bg-gray-50 text-gray-600" : "bg-gray-100 text-gray-600");
};
