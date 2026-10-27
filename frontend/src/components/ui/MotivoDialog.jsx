import { useEffect, useId, useState } from "react";
import Modal from "./Modal.jsx";
import InlineNotice from "./InlineNotice.jsx";

// One dialog for every "give a reason" action: cancel or reassign a reservation,
// reject a document or an application, reopen… (PM-7).
// onConfirm(motivo) may be async; while it runs the dialog is locked, and if it
// throws, its message is shown inside the dialog and the dialog stays open.
// `children` can add extra fields (e.g. the destination offer of a reassignment);
// `canConfirm` lets the caller block the button until those are filled.
export default function MotivoDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  label = "Motivo",
  placeholder = "Indica el motivo…",
  confirmLabel = "Confirmar",
  busyLabel = "Guardando…",
  tone = "danger",
  required = true,
  maxLength = 255,
  canConfirm = true,
  children,
}) {
  const fieldId = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  const trimmed = motivo.trim();
  const disabled = busy || !canConfirm || (required && !trimmed);

  const submit = async (event) => {
    event?.preventDefault();
    if (disabled) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err?.message || "No se pudo completar la acción.");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
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
            className={`btn btn-sm ${tone === "danger" ? "btn-danger" : "btn-primary"} ${disabled ? "btn-disabled" : ""}`}
            disabled={disabled}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <form id={`${fieldId}-form`} className="space-y-3" onSubmit={submit}>
        {children}
        <div className="field">
          <label htmlFor={fieldId}>
            {label}
            {!required && <span className="font-normal text-muted"> (opcional)</span>}
          </label>
          <textarea
            id={fieldId}
            data-autofocus
            className="textarea min-h-24 text-sm"
            rows={3}
            placeholder={placeholder}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            maxLength={maxLength}
            aria-required={required}
            disabled={busy}
          />
          <p className="mt-1 text-right text-xs text-muted">
            {motivo.length}/{maxLength}
          </p>
        </div>
        <InlineNotice tone="error">{error}</InlineNotice>
      </form>
    </Modal>
  );
}
