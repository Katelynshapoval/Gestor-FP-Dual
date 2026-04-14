import { useEffect, useState } from "react";

// MODAL VISOR DE CONVENIO
const ConvenioViewer = ({ empresa, onClose, onValidate }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresa) return;

    let objectUrl = null;

    // Función para obtener el PDF desde el backend
    const fetchPdf = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/getConvenioFile/${empresa.idAuxEmpresa}`);

        if (!res.ok) throw new Error("Error al cargar el PDF");

        // Convertimos la respuesta en blob (archivo binario)
        const blob = await res.blob();

        // Creamos una URL local para poder usarla en el iframe
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

    // Limpieza: liberamos la URL cuando el componente se desmonta
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
            {/* Botón para validar el convenio si aún no está validado */}
            {!empresa.convenio_validado && (
              <button
                onClick={() => onValidate(empresa.idAuxEmpresa)}
                className="btn btn-primary btn-sm"
              >
                ✓ Validar convenio
              </button>
            )}

            {/* Abrir el PDF en una nueva pestaña */}
            <button
              onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
              className="btn btn-secondary btn-sm"
              disabled={!pdfUrl}
            >
              Nueva pestaña
            </button>

            {/* Cerrar el modal */}
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          {/* Estado de carga */}
          {loading && <p>Cargando PDF...</p>}

          {/* Mostrar el PDF cuando esté listo */}
          {!loading && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={`Convenio de ${empresa.razonSocial}`}
              style={{ width: "100%", height: "100%" }}
            />
          )}

          {/* Fallback si falla la carga */}
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
