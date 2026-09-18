import { useState } from "react";
import StatusBadge from "../../../components/ui/StatusBadge";

const DOC_BADGE = {
  PENDIENTE: { label: "Pendiente", variant: "warning" },
  VALIDADO: { label: "Validado", variant: "success" },
  RECHAZADO: { label: "Rechazado", variant: "danger" },
};

const isStudentDoc = (tipo) => tipo === "cv" || tipo === "anexo2";

const DocViewer = ({ showDoc, onClose, onValidate, onReject }) => {
  const [showReject, setShowReject] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  if (!showDoc) return null;

  const estado = showDoc.estado || null;
  const canReview = Boolean(showDoc.canReview) && isStudentDoc(showDoc.tipo);
  const canValidate = canReview && estado !== "VALIDADO" && estado !== "RECHAZADO";
  const canReject = canReview && estado !== "VALIDADO" && estado !== "RECHAZADO";
  const badge = DOC_BADGE[estado];

  const handleValidar = async () => {
    if (!canValidate || submitting) return;
    setSubmitting(true);
    setActionMsg(null);
    try {
      await onValidate();
    } catch (err) {
      setActionMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    if (!motivo.trim() || submitting) return;
    setSubmitting(true);
    setActionMsg(null);
    try {
      await onReject(motivo.trim());
      setShowReject(false);
      setMotivo("");
    } catch (err) {
      setActionMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-[92%] flex-col overflow-hidden rounded-xl2 bg-white shadow-[0_24px_80px_rgb(0_0_0/0.25)] animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-surface-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="m-0 font-display text-[0.95rem] font-semibold text-gray-900">
              {showDoc.nombreAlumno} — {showDoc.nombre}
            </h2>
            {badge && (
              <div className="mt-1">
                <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canValidate && !showReject && (
              <button
                type="button"
                onClick={handleValidar}
                disabled={submitting}
                className="btn btn-primary btn-sm"
              >
                Validar documento
              </button>
            )}
            {canReject && !showReject && (
              <button
                type="button"
                onClick={() => setShowReject(true)}
                disabled={submitting}
                className="btn btn-secondary btn-sm"
              >
                Rechazar documento
              </button>
            )}
            <button
              type="button"
              onClick={() => window.open(showDoc.url, "_blank")}
              className="btn btn-secondary btn-sm"
            >
              Nueva pestaña
            </button>
            <button
              type="button"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-surface-200 bg-white text-[0.85rem] text-gray-500 transition-colors duration-150 hover:border-brand-500 hover:text-brand-500"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {estado === "RECHAZADO" && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
            <span className="font-semibold">Motivo del rechazo:</span> {showDoc.motivo || "Sin motivo indicado."}
          </div>
        )}

        {showReject && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <p className="mb-2 text-sm font-medium text-red-800">Motivo del rechazo del documento</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="Indica el motivo..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={255}
              />
              <button
                type="button"
                onClick={handleRechazar}
                disabled={!motivo.trim() || submitting}
                className={`btn btn-primary btn-sm shadow-none ${!motivo.trim() || submitting ? "btn-disabled" : ""}`}
              >
                Confirmar
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

        {actionMsg && (
          <p className={`px-5 py-2 text-sm ${actionMsg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            {actionMsg.text}
          </p>
        )}

        <div className="flex-1 overflow-hidden">
          <iframe
            src={showDoc.url}
            title={`Documento de ${showDoc.nombreAlumno}`}
            className="block h-full w-full border-0"
          >
            <p>
              Tu navegador no soporta PDFs.{" "}
              <a href={showDoc.url} download>
                Descarga el documento
              </a>
              .
            </p>
          </iframe>
        </div>
      </div>
    </div>
  );
};

export default DocViewer;
