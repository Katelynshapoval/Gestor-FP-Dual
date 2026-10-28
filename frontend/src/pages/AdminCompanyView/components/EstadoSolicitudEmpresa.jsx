import { useState } from "react";
import { postJSON } from "../../../utils/api.js";
import { sectionLabelClass } from "../../../components/ui/cardStyles";
import EstadoBadge from "../../../components/ui/EstadoBadge.jsx";
import MotivoDialog from "../../../components/ui/MotivoDialog.jsx";
import { useToast } from "../../../components/feedback/ToastProvider.jsx";

// State of a company application for the staff: reject a pending one (reason
// required, the company sees it), validate it when its convenio is already
// validated, reopen a rejected one (active convocatoria only). Normally a
// company is validated by validating its signed convenio. «Dar de baja» lives
// in the card's «Cuenta» tab.
export default function EstadoSolicitudEmpresa({ empresa, onUpdated }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // "rechazar" | "reabrir"
  const [busy, setBusy] = useState(false);
  const id = empresa.id_solicitud_empresa;
  const nombre = empresa.razonSocial || empresa.empresa || "la empresa";
  const estado = empresa.estado_validacion;
  const activa = Boolean(Number(empresa.convocatoria_activa));

  const refresh = async () => {
    if (onUpdated) await onUpdated();
  };

  const validar = async () => {
    setBusy(true);
    try {
      await postJSON(`/solicitudes/empresa/${id}/validar`, {});
      toast.success("Solicitud validada.");
      await refresh();
    } catch (err) {
      toast.error(err.message || "No se pudo validar la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className={sectionLabelClass}>Estado de la solicitud</p>
      <EstadoBadge kind="solicitud" value={estado} />
      {estado === "RECHAZADO" && (
        <p className="mb-0 mt-3 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {empresa.motivo || "Sin motivo indicado."}
        </p>
      )}
      {estado === "PENDIENTE" && (
        <p className="mb-0 mt-3 text-xs leading-5 text-muted">
          {empresa.convenio_validado
            ? "El convenio está validado: ya se puede validar la solicitud."
            : "Se valida al validar su convenio firmado."}
        </p>
      )}
      {(estado === "PENDIENTE" || (estado === "RECHAZADO" && activa)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {estado === "PENDIENTE" && Boolean(empresa.convenio_validado) && (
            <button type="button" className="btn btn-outline-brand btn-sm" onClick={validar} disabled={busy}>
              {busy ? "Validando…" : "Validar solicitud"}
            </button>
          )}
          {estado === "PENDIENTE" && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog("rechazar")} disabled={busy}>
              Rechazar solicitud
            </button>
          )}
          {estado === "RECHAZADO" && activa && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog("reabrir")}>
              Reabrir solicitud
            </button>
          )}
        </div>
      )}

      <MotivoDialog
        open={dialog === "rechazar"}
        onClose={() => setDialog(null)}
        onConfirm={async (motivo) => {
          await postJSON(`/solicitudes/empresa/${id}/rechazar`, { motivo });
          setDialog(null);
          toast.success("Solicitud rechazada.");
          await refresh();
        }}
        title="Rechazar solicitud de empresa"
        description={`Esto rechaza la solicitud de ${nombre} en esta convocatoria, no el convenio. La empresa verá el motivo y no podrá reservar alumnos.`}
        label="Motivo del rechazo"
        confirmLabel="Rechazar solicitud"
        busyLabel="Rechazando…"
      />
      <MotivoDialog
        open={dialog === "reabrir"}
        onClose={() => setDialog(null)}
        onConfirm={async (motivo) => {
          await postJSON(`/solicitudes/empresa/${id}/reabrir`, motivo ? { motivo } : {});
          setDialog(null);
          toast.success("Solicitud reabierta: vuelve a estar pendiente de revisión.");
          await refresh();
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
}
