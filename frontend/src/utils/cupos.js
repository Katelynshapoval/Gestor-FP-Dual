export const warnReducePending = (desde, hasta, pendientesACancelar) => {
  const n = Number(pendientesACancelar) || 0;
  const reserva = n === 1 ? "reserva" : "reservas";
  const pendiente = n === 1 ? "pendiente" : "pendientes";
  return `Al reducir de ${desde} a ${hasta} plazas se cancelarán ${n} ${reserva} ${pendiente}. Las reservas confirmadas no se modificarán.`;
};
