import { useEffect, useState } from "react";
import { getBlob } from "../../../utils/api.js";

const ConvenioViewer = ({ empresa, onClose, onValidate, onReject }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setShowReject(false);
    setMotivo("");
  }, [empresa]);

  const handleReject = async () => {
    if (!motivo.trim() || submitting || !onReject) return;
    setSubmitting(true);
    try {
      await onReject(empresa.id_documento_convenio, motivo.trim());
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!empresa) return;

    let objectUrl = null;

    const fetchPdf = async () => {
      setLoading(true);
      try {
        const idDoc = empresa.id_documento_convenio;
        if (!idDoc) throw new Error("Sin documento");
        const blob = await getBlob(`/documentos/${idDoc}/descargar`);
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err) {
        console.error("Error al obtener el convenio:", err);
        setPdfUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPdf();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [empresa]);

  if (!empresa) return null;

  const razonSocial = empresa.empresa || empresa.razonSocial;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Convenio - {razonSocial}</h2>

          <div className="modal-actions">
            {!empresa.convenio_validado && empresa.id_documento_convenio && (
              <button
                onClick={() => onValidate(empresa.id_documento_convenio)}
                className="btn btn-primary btn-sm shadow-none"
              >
                Validar convenio
              </button>
            )}

            {!empresa.convenio_validado && empresa.id_documento_convenio && onReject && (
              <button
                onClick={() => setShowReject(true)}
                className="btn btn-secondary btn-sm"
                disabled={showReject}
              >
                Rechazar convenio
              </button>
            )}

            <button
              onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
              className="btn btn-secondary btn-sm"
              disabled={!pdfUrl}
            >
              Nueva pestaña
            </button>

            <button className="modal-close" onClick={onClose} aria-label="Cerrar visor">
              ×
            </button>
          </div>
        </div>

        {showReject && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3">
            <label htmlFor="motivo-rechazo-convenio" className="mb-2 block text-sm font-medium text-red-800">
              Motivo del rechazo del convenio
            </label>
            <textarea
              id="motivo-rechazo-convenio"
              className="textarea min-h-20 text-sm"
              rows={3}
              placeholder="Indica qué debe corregir la empresa..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={255}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleReject}
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

        <div className="modal-body">
          {loading && <p>Cargando PDF...</p>}

          {!loading && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={`Convenio de ${razonSocial}`}
              className="block h-full w-full border-none"
            />
          )}

          {!loading && !pdfUrl && (
            <p className="py-8 text-center text-sm text-gray-500">
              No se pudo cargar el PDF del convenio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConvenioViewer;
