import { useEffect, useId, useState } from "react";
import Modal from "../ui/Modal.jsx";
import InlineNotice from "../ui/InlineNotice.jsx";
import { familiaAnexo, loadTiposContrato } from "../TipoContratoSelect.jsx";

const ANEXO = { ANEXO_III: "Anexo III", ANEXO_II: "Anexo II" };

/**
 * The company books a student and chooses the contract type at the same time:
 * beca → Anexo III, any other type → Anexo II. onConfirm(idTipoContrato) may be
 * async; if it throws, its message stays in the dialog.
 */
export default function ReservarDialog({ open, onClose, onConfirm, nombre }) {
  const fieldId = useId();
  const [tipos, setTipos] = useState([]);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setValue("");
    setError("");
    setBusy(false);
    let cancelled = false;
    loadTiposContrato()
      .then((rows) => !cancelled && setTipos(rows))
      .catch(() => !cancelled && setError("No se pudieron cargar los tipos de contrato."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const elegido = tipos.find((t) => String(t.id_tipo_contrato) === value);
  const disabled = busy || !value;

  const submit = async (event) => {
    event?.preventDefault();
    if (disabled) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(Number(value));
    } catch (err) {
      setError(err?.message || "No se pudo reservar el alumno.");
    }
    setBusy(false);
  };

  return (
    // The dialog is a portal: React still bubbles its clicks to the card header,
    // which would fold the card. Stop them here.
    <span onClick={(e) => e.stopPropagation()}>
      <Modal
        open={open}
        onClose={onClose}
        title="Reservar alumno"
        description={nombre ? `Reserva de ${nombre}.` : undefined}
        size="sm"
        busy={busy}
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
              Volver
            </button>
            <button
              type="submit"
              form={`${fieldId}-form`}
              className={`btn btn-primary btn-sm`}
              disabled={disabled}
            >
              {busy ? "Reservando…" : "Reservar"}
            </button>
          </>
        }
      >
        <form id={`${fieldId}-form`} className="space-y-3" onSubmit={submit}>
          <div className="field">
            <label htmlFor={fieldId}>Tipo de contrato</label>
            <select
              id={fieldId}
              data-autofocus
              className="select-input w-full py-2 text-sm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-required="true"
              disabled={busy}
            >
              <option value="" disabled>
                Elige beca o contrato…
              </option>
              {tipos.map((t) => (
                <option key={t.id_tipo_contrato} value={t.id_tipo_contrato}>
                  {t.nombre_mostrar || t.nombre}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              {elegido
                ? `Esta reserva usará el ${ANEXO[familiaAnexo(elegido)]}.`
                : "Beca usa el Anexo III; el resto de tipos, el Anexo II."}
            </p>
          </div>
          <InlineNotice tone="error">{error}</InlineNotice>
        </form>
      </Modal>
    </span>
  );
}
