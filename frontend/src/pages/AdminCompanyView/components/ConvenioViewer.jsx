import { useEffect, useState } from "react";
import { getBlob } from "../../../utils/api.js";

// Modal visor del convenio PDF de una empresa.
// Descarga el documento autenticado y lo muestra en un iframe.
const ConvenioViewer = ({ empresa, onClose, onValidate }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

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

    // Libera la URL al desmontar el componente
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
          <h2 className="modal-title">Convenio — {razonSocial}</h2>

          <div className="modal-actions">
            {!empresa.convenio_validado && empresa.id_documento_convenio && (
              <button
                onClick={() => onValidate(empresa.id_documento_convenio)}
                className="btn btn-primary btn-sm"
              >
                ✓ Validar convenio
              </button>
            )}

            <button
              onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
              className="btn btn-secondary btn-sm"
              disabled={!pdfUrl}
            >
              Nueva pestaña
            </button>

            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          {loading && <p>Cargando PDF...</p>}

          {!loading && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={`Convenio de ${razonSocial}`}
              className="w-full h-full block border-none"
            />
          )}

          {!loading && !pdfUrl && (
            <p className="text-sm text-gray-500 py-8 text-center">
              No se pudo cargar el PDF del convenio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConvenioViewer;
