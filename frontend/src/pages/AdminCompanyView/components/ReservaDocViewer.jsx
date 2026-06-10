import { useEffect, useState } from "react";

// Modal para visualizar el documento firmado de una reserva.
// Funciona igual que ConvenioViewer: fetch → blob → object URL → iframe.
const ReservaDocViewer = ({ reserva, onClose, onValidate }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reserva) return;

    let objectUrl = null;

    const fetchPdf = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/reservationDoc/${reserva.idGestion}/${reserva.idAuxEmpresa}`,
        );
        if (!res.ok) throw new Error("Error al cargar el PDF");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err) {
        console.error("Error al obtener el documento:", err);
        setPdfUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPdf();

    // Libera la URL al desmontar o cambiar de reserva
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reserva]);

  if (!reserva) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Acuerdo firmado —{" "}
            {reserva.empresa ?? reserva.miEmpresa ?? "Empresa"}
          </h2>

          <div className="modal-actions">
            {/* Botón de validar solo para admin, cuando el doc no ha sido validado */}
            {onValidate && !reserva.documentoValidado && (
              <button
                onClick={() => onValidate(reserva.idGestion, reserva.idAuxEmpresa)}
                className="btn btn-primary btn-sm"
              >
                ✓ Confirmar reserva
              </button>
            )}

            {pdfUrl && (
              <button
                onClick={() => window.open(pdfUrl, "_blank")}
                className="btn btn-secondary btn-sm"
              >
                Nueva pestaña
              </button>
            )}

            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body">
          {loading && (
            <p className="text-sm text-gray-500 py-8 text-center">
              Cargando documento…
            </p>
          )}

          {!loading && pdfUrl && (
            <iframe
              src={pdfUrl}
              title="Documento de reserva"
              className="w-full h-full block border-none"
            />
          )}

          {!loading && !pdfUrl && (
            <p className="text-sm text-gray-500 py-8 text-center">
              No se pudo cargar el documento.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReservaDocViewer;
