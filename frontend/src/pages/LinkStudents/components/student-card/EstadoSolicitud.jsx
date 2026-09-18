import { useState } from "react";
import { sectionLabelClass } from "../../../../components/ui/cardStyles";
import StatusBadge from "../../../../components/ui/StatusBadge";

function validateHint(r) {
  const cvOk = r.cv_estado === "VALIDADO";
  const anexoOk = r.anexo2_estado === "VALIDADO";
  if (r.cv_estado === "RECHAZADO" || r.anexo2_estado === "RECHAZADO") {
    return "Hay documentación rechazada pendiente de corrección.";
  }
  if (!cvOk && !anexoOk) {
    return "Para validar al alumno, primero debes validar el CV y el ANEXO 2.";
  }
  if (!cvOk) return "Falta validar el CV.";
  if (!anexoOk) return "Falta validar el ANEXO 2.";
  return null;
}

const APP_BADGE = {
  PENDIENTE: { label: "Pendiente de revisión", variant: "warning" },
  VALIDADO: { label: "Solicitud validada", variant: "success" },
  RECHAZADO: { label: "Solicitud rechazada", variant: "danger" },
};

const EstadoSolicitud = ({ r, onValidar, onRechazar }) => {
  const [showReject, setShowReject] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const pending = r.estado_validacion === "PENDIENTE";
  const hint = pending ? validateHint(r) : null;
  const canValidar = pending && !hint;
  const badge = pending && canValidar
    ? { label: "Documentación completa", variant: "info" }
    : (APP_BADGE[r.estado_validacion] || { label: r.estado_validacion || "Sin estado", variant: "neutral" });

  const handleValidar = async () => {
    if (!canValidar || submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await onValidar(r.id_solicitud_alumno);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    if (!motivo.trim() || submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await onRechazar(r.id_solicitud_alumno, motivo.trim());
      setShowReject(false);
      setMotivo("");
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-surface-200 pt-4">
      <p className={sectionLabelClass}>Estado de la solicitud</p>
      <div className="mb-3">
        <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
      </div>

      {r.estado_validacion === "RECHAZADO" && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {r.motivo || "Sin motivo indicado."}
        </p>
      )}

      {pending && hint && (
        <p className="mb-3 text-xs leading-5 text-muted">{hint}</p>
      )}

      {msg && (
        <p className={`mb-3 rounded-md border px-3 py-2 text-xs ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      {pending && !showReject && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleValidar}
            disabled={!canValidar || submitting}
            className={`btn btn-primary btn-sm shadow-none ${!canValidar || submitting ? "btn-disabled" : ""}`}
          >
            Validar alumno
          </button>
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={submitting}
            className="btn btn-secondary btn-sm"
          >
            Rechazar solicitud
          </button>
        </div>
      )}

      {pending && showReject && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
          <p className="mb-2 text-sm font-medium text-red-800">Motivo del rechazo de la solicitud</p>
          <p className="mb-2 text-xs text-red-700">Esto rechaza la candidatura, no un documento concreto.</p>
          <textarea
            className="textarea min-h-20 text-sm"
            rows={3}
            placeholder="Indica el motivo..."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={255}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRechazar}
              disabled={!motivo.trim() || submitting}
              className={`btn btn-primary btn-sm shadow-none ${!motivo.trim() || submitting ? "btn-disabled" : ""}`}
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={() => { setShowReject(false); setMotivo(""); }}
              className="btn btn-secondary btn-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstadoSolicitud;
