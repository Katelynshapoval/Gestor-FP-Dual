import { useEffect, useState } from "react";
import Modal from "./ui/Modal.jsx";

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
    <Modal
      open={open}
      onClose={onCancel}
      title="Elegir reservas a cancelar"
      description={`Al reducir de ${desde} a ${hasta} plazas hay que cancelar ${requiredCount} reserva${
        requiredCount === 1 ? "" : "s"
      } pendiente${requiredCount === 1 ? "" : "s"}. Las confirmadas no se modifican.`}
      size="md"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
            Volver
          </button>
          <button
            type="button"
            className={`btn btn-danger btn-sm ${!ready || busy ? "btn-disabled" : ""}`}
            disabled={!ready || busy}
            onClick={() => onConfirm(selected)}
          >
            {busy ? "Guardando…" : "Reducir plazas"}
          </button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm text-muted">
          Seleccionadas {selected.length} de {requiredCount}
        </legend>
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
      </fieldset>
    </Modal>
  );
}
