import { useEffect, useState } from "react";

export default function CupoReductionDialog({
  open,
  desde,
  hasta,
  pendientes = [],
  requiredCount = 0,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    setSelected([]);
  }, [open, requiredCount]);

  if (!open) return null;

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= requiredCount) return prev;
      return [...prev, id];
    });
  };

  const ready = selected.length === requiredCount;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg space-y-4 rounded-xl2 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900">Elegir reservas a cancelar</h3>
        <p className="text-sm leading-6 text-gray-600">
          Al reducir de {desde} a {hasta} plazas hay que cancelar {requiredCount} reserva
          {requiredCount === 1 ? "" : "s"} pendiente{requiredCount === 1 ? "" : "s"}. Las confirmadas no se modifican.
        </p>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {pendientes.map((row) => (
            <label key={row.id_reserva} className="flex items-start gap-3 rounded-lg border border-surface-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(row.id_reserva)}
                disabled={busy || (!selected.includes(row.id_reserva) && selected.length >= requiredCount)}
                onChange={() => toggle(row.id_reserva)}
              />
              <span>
                <span className="font-medium text-charcoal-950">{row.alumno}</span>
                {row.dni_alumno && <span className="mt-0.5 block text-xs text-muted">{row.dni_alumno}</span>}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn btn-primary btn-sm ${!ready || busy ? "btn-disabled" : ""}`}
            disabled={!ready || busy}
            onClick={() => onConfirm(selected)}
          >
            {busy ? "Guardando…" : "Reducir plazas"}
          </button>
        </div>
      </div>
    </div>
  );
}
