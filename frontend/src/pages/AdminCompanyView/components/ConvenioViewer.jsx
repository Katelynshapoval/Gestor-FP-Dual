import { useEffect, useState } from "react";

// Modal visor de convenio PDF
const ConvenioViewer = ({ empresa, onClose, onValidate }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresa) return;

    let objectUrl = null;

    // Obtiene el PDF desde el backend y crea una URL local
    const fetchPdf = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/getConvenioFile/${empresa.idAuxEmpresa}`);

        if (!res.ok) throw new Error("Error al cargar el PDF");

        const blob = await res.blob();
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Convenio — {empresa.razonSocial}</h2>

          <div className="modal-actions">
            {!empresa.convenio_validado && (
              <button
                onClick={() => onValidate(empresa.idAuxEmpresa)}
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
              title={`Convenio de ${empresa.razonSocial}`}
              className="w-full h-full block border-none"
            />
          )}

          {!loading && !pdfUrl && (
            <p>
              No se pudo cargar el PDF.{" "}
              <a href={`/getConvenioFile/${empresa.idAuxEmpresa}`} download>
                Descarga el convenio
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConvenioViewer;
