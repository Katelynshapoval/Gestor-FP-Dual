import { useEffect, useState } from "react";
import { getBlob, getJSON, postJSON } from "../../../utils/api.js";
import { isCancelledReserva, isPendingReserva } from "../../../utils/reservaEstados.js";

const ReservaDocViewer = ({ reserva, onClose, onReservationUpdate }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [estadoDoc, setEstadoDoc] = useState(reserva?.estado_documento || null);
  const [tiposContrato, setTiposContrato] = useState([]);
  const [idTipoContrato, setIdTipoContrato] = useState("");

  useEffect(() => {
    setEstadoDoc(reserva?.estado_documento || null);
    setActionMsg(null);
    setShowReject(false);
    setMotivoRechazo("");
  }, [reserva]);

  useEffect(() => {
    getJSON("/tiposContrato")
      .then((rows) => setTiposContrato(Array.isArray(rows) ? rows : []))
      .catch(() => setTiposContrato([]));
  }, []);

  useEffect(() => {
    if (!reserva) return;

    let objectUrl = null;
    let cancelled = false;

    const fetchPdf = async () => {
      setLoading(true);
      try {
        if (!reserva.id_documento_reserva) throw new Error("Sin documento");
        const blob = await getBlob(`/documentos/${reserva.id_documento_reserva}/descargar`);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPdfUrl(objectUrl);
      } catch (err) {
        console.error("Error al obtener el documento:", err);
        if (!cancelled) setPdfUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPdf();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reserva]);

  if (!reserva) return null;

  const cancelled = isCancelledReserva(reserva.estado_reserva);
  const puedeValidarDoc =
    reserva.id_documento_reserva &&
    estadoDoc !== "VALIDADO" &&
    estadoDoc !== "RECHAZADO" &&
    !cancelled;
  const puedeConfirmar =
    estadoDoc === "VALIDADO" &&
    isPendingReserva(reserva.estado_reserva);

  const refresh = async () => {
    if (onReservationUpdate) await onReservationUpdate();
  };

  const handleValidarDocumento = async () => {
    setSubmitting(true);
    setActionMsg(null);
    try {
      await postJSON(`/documentos/${reserva.id_documento_reserva}/validar`, {});
      setEstadoDoc("VALIDADO");
      setActionMsg({ ok: true, text: "Documento validado. El estado ya no está en revisión." });
      await refresh();
    } catch (err) {
      setActionMsg({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmarReserva = async () => {
    if (!idTipoContrato) {
      setActionMsg({ ok: false, text: "Selecciona el tipo de contrato para confirmar la reserva." });
      return;
    }
    setSubmitting(true);
    setActionMsg(null);
    try {
      await postJSON(`/reservas/${reserva.id_reserva}/confirmar`, {
        id_tipo_contrato: Number(idTipoContrato),
      });
      setActionMsg({ ok: true, text: "Reserva confirmada correctamente." });
      await refresh();
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
      setEstadoDoc("RECHAZADO");
      setActionMsg({ ok: true, text: "Documento rechazado." });
      setShowReject(false);
      await refresh();
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
            Acuerdo firmado - {empresaNombre}
          </h2>

          <div className="modal-actions">
            {puedeValidarDoc && !showReject && (
              <>
                <button
                  onClick={handleValidarDocumento}
                  disabled={submitting}
                  className="btn btn-primary btn-sm shadow-none"
                >
                  Validar documento
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="btn btn-secondary btn-sm"
                >
                  Rechazar
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

            <button className="modal-close" onClick={onClose} aria-label="Cerrar visor">
              ×
            </button>
          </div>
        </div>

        {puedeConfirmar && !showReject && (
          <div className="border-b border-gray-200 bg-green-50 px-4 py-3">
            <p className="mb-2 text-sm font-medium text-green-800">
              Documento validado. Confirma la reserva eligiendo el tipo de contrato.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="input flex-1 text-sm"
                value={idTipoContrato}
                onChange={(e) => setIdTipoContrato(e.target.value)}
              >
                <option value="">Tipo de contrato…</option>
                {tiposContrato.map((t) => (
                  <option key={t.id_tipo_contrato} value={t.id_tipo_contrato}>
                    {t.nombre_mostrar || t.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={handleConfirmarReserva}
                disabled={submitting || !idTipoContrato}
                className={`btn btn-primary btn-sm shadow-none ${submitting || !idTipoContrato ? "btn-disabled" : ""}`}
              >
                Confirmar reserva
              </button>
            </div>
          </div>
        )}

        {showReject && (
          <div className="border-b border-gray-200 bg-red-50 px-4 py-3">
            <p className="mb-2 text-sm font-medium text-red-700">
              Motivo del rechazo
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="Indica el motivo..."
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                maxLength={255}
              />
              <button
                onClick={handleRechazar}
                disabled={!motivoRechazo.trim() || submitting}
                className={`btn btn-primary btn-sm shadow-none ${!motivoRechazo.trim() || submitting ? "btn-disabled" : ""}`}
              >
                Confirmar
              </button>
              <button
                onClick={() => setShowReject(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

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
            <p className="py-8 text-center text-sm text-gray-500">
              Cargando documento...
            </p>
          )}

          {!loading && pdfUrl && (
            <iframe
              src={pdfUrl}
              title="Documento de reserva"
              className="block h-full w-full border-none"
            />
          )}

          {!loading && !pdfUrl && (
            <p className="py-8 text-center text-sm text-gray-500">
              No se pudo cargar el documento.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReservaDocViewer;
