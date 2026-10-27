export const ESTADOS_RESERVA = Object.freeze({
  PENDIENTE: "PENDIENTE",
  CONFIRMADA: "CONFIRMADA",
  CANCELADA: "CANCELADA",
});

export const isPendingReserva = (estado) => estado === ESTADOS_RESERVA.PENDIENTE;
export const isConfirmedReserva = (estado) => estado === ESTADOS_RESERVA.CONFIRMADA;
export const isCancelledReserva = (estado) => estado === ESTADOS_RESERVA.CANCELADA;
