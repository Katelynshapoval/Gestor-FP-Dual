import { useState } from "react";
import { sectionLabelClass } from "../../../../components/ui/cardStyles";
import StatusBadge from "../../../../components/ui/StatusBadge";
import EstadoBadge from "../../../../components/ui/EstadoBadge.jsx";
import MotivoDialog from "../../../../components/ui/MotivoDialog.jsx";
import { useToast } from "../../../../components/feedback/ToastProvider.jsx";

function validateHint(r) {
  const required = (r.documentos || []).filter((d) => d.requerido_para_validar);
  if (!required.length) return "No hay documentos configurados para validar la solicitud.";
  const rejected = required.filter((d) => d.estado_validacion === "RECHAZADO");
  if (rejected.length) {
    return `Hay documentación rechazada: ${rejected.map((d) => d.nombre).join(", ")}.`;
  }
  const pending = required.filter((d) => d.estado_validacion !== "VALIDADO");
  if (pending.length) {
    return `Para validar al alumno, primero valida: ${pending.map((d) => d.nombre).join(", ")}.`;
  }
  return null;
}

// Review of the student's application: validate, reject (reason required) and,
// for rejected ones, reopen (D7, reason optional and audited). The portal
// account and «Dar de baja» are in the card's «Cuenta» tab (CuentaPanel).
const EstadoSolicitud = ({ r, onValidar, onRechazar, onReabrir }) => {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // "rechazar" | "reabrir"
  const [submitting, setSubmitting] = useState(false);

  const pending = r.estado_validacion === "PENDIENTE";
  const hint = pending ? validateHint(r) : null;
  const canValidar = pending && !hint;

  const handleValidar = async () => {
    if (!canValidar || submitting) return;
    setSubmitting(true);
    try {
      await onValidar(r.id_solicitud_alumno);
      toast.success("Solicitud validada.");
    } catch (err) {
      toast.error(err.message || "No se pudo validar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-surface-200 pt-4">
      <p className={sectionLabelClass}>Estado de la solicitud</p>
      <div className="mb-3">
        {canValidar ? (
          <StatusBadge variant="info">Documentación completa</StatusBadge>
        ) : (
          <EstadoBadge kind="solicitud" value={r.estado_validacion} />
        )}
      </div>

      {r.estado_validacion === "RECHAZADO" && (
        <p className="mb-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {r.motivo || "Sin motivo indicado."}
        </p>
      )}

      {r.estado_validacion === "RECHAZADO" && onReabrir && (
        <button type="button" onClick={() => setDialog("reabrir")} className="btn btn-secondary btn-sm mb-3">
          Reabrir solicitud
        </button>
      )}

      {pending && hint && <p className="mb-3 text-xs leading-5 text-muted">{hint}</p>}

      {pending && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleValidar}
            disabled={!canValidar || submitting}
            className={`btn btn-outline-brand btn-sm ${!canValidar || submitting ? "btn-disabled" : ""}`}
          >
            {submitting ? "Validando…" : "Validar alumno"}
          </button>
          <button type="button" onClick={() => setDialog("rechazar")} disabled={submitting} className="btn btn-danger btn-sm">
            Rechazar solicitud
          </button>
        </div>
      )}

      <MotivoDialog
        open={dialog === "rechazar"}
        onClose={() => setDialog(null)}
        onConfirm={async (motivo) => {
          await onRechazar(r.id_solicitud_alumno, motivo);
          setDialog(null);
          toast.success("Solicitud rechazada.");
        }}
        title="Rechazar solicitud"
        description={`Esto rechaza la candidatura de ${r.nombre}, no un documento concreto. El alumno verá el motivo.`}
        label="Motivo del rechazo"
        confirmLabel="Rechazar solicitud"
        busyLabel="Rechazando…"
      />

      <MotivoDialog
        open={dialog === "reabrir"}
        onClose={() => setDialog(null)}
        onConfirm={async (motivo) => {
          await onReabrir(r.id_solicitud_alumno, motivo);
          setDialog(null);
          toast.success("Solicitud reabierta: vuelve a estar pendiente de revisión.");
        }}
        title="Reabrir solicitud"
        description="La solicitud vuelve a «Pendiente de revisión». Solo es posible en la convocatoria activa y queda registrado."
        label="Motivo de la reapertura"
        required={false}
        confirmLabel="Reabrir solicitud"
        busyLabel="Reabriendo…"
        tone="primary"
      />
    </div>
  );
};

export default EstadoSolicitud;
