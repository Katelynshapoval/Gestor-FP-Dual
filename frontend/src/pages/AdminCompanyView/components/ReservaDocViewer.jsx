import { useEffect, useState } from "react";
import { getBlob, postJSON } from "../../../utils/api.js";

// Modal para visualizar el documento firmado de una reserva.
// Descarga el PDF autenticado y permite validarlo o rechazarlo.
const ReservaDocViewer = ({ reserva, onClose, onReservationUpdate }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!reserva) return;

    let objectUrl = null;

    const fetchPdf = async () => {
      setLoading(true);
      try {
        if (!reserva.id_documento_reserva) throw new Error("Sin documento");
        const blob = await getBlob(`/documentos/${reserva.id_documento_reserva}/descargar`);
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

  const puedeValidar =
    reserva.id_documento_reserva &&
    reserva.estado_documento !== "VALIDADO" &&
    reserva.estado_reserva !== "CANCELADA";

  const handleValidar = async () => {
    setSubmitting(true);
    setActionMsg(null);
    try {
      // Valida el documento y confirma la reserva
      await postJSON(`/documentos/${reserva.id_documento_reserva}/validar`, {});
      await postJSON(`/reservas/${reserva.id_reserva}/confirmar`, {});
      setActionMsg({ ok: true, text: "Reserva confirmada correctamente." });
      if (onReservationUpdate) onReservationUpdate();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setActionMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    if (!motivoRechazo.trim()) return;
    setSubmitting(true);
    setActionMsg(null);
    try {
      await postJSON(`/documentos/${reserva.id_documento_reserva}/rechazar`, { motivo: motivoRechazo });
      setActionMsg({ ok: true, text: "Documento rechazado." });
      setShowReject(false);
      if (onReservationUpdate) onReservationUpdate();
    } catch (err) {
      setActionMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const empresaNombre = reserva.empresa || reserva.miEmpresa || "Empresa";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Acuerdo firmado — {empresaNombre}
          </h2>

          <div className="modal-actions">
            {puedeValidar && !showReject && (
              <>
                <button
                  onClick={handleValidar}
                  disabled={submitting}
                  className="btn btn-primary btn-sm"
                >
                  ✓ Confirmar reserva
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="btn btn-secondary btn-sm"
                >
                  ✗ Rechazar
                </button>
              </>
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

        {/* Formulario de rechazo */}
        {showReject && (
          <div className="px-4 py-3 border-b border-gray-200 bg-red-50">
            <p className="text-sm font-medium text-red-700 mb-2">
              Motivo del rechazo
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="Indica el motivo…"
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                maxLength={255}
              />
              <button
                onClick={handleRechazar}
                disabled={!motivoRechazo.trim() || submitting}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                onClick={() => setShowReject(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Mensaje de acción */}
        {actionMsg && (
          <p
            className={`px-4 py-2 text-sm ${
              actionMsg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
            }`}
          >
            {actionMsg.text}
          </p>
        )}

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
