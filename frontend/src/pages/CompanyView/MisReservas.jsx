import { useState, useRef } from "react";
import { postForm } from "../../utils/api.js";
import { FaFilePdf } from "react-icons/fa6";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions } from "react-icons/md";
import { RxClock } from "react-icons/rx";

const ESTADO_COLOR = {
  PENDIENTE:  "bg-yellow-50 text-yellow-800 border-yellow-200",
  CONFIRMADA: "bg-green-50 text-green-800 border-green-200",
  CANCELADA:  "bg-red-50 text-red-700 border-red-200",
};

// Status icon for the signed document attached to a reservation
const DocStatusIcon = ({ estado }) => {
  if (estado === "VALIDADO")  return <IoIosCheckmarkCircleOutline className="text-green-600 shrink-0" />;
  if (estado === "RECHAZADO") return <MdOutlineCancel className="text-red-500 shrink-0" />;
  return <MdPendingActions className="text-yellow-500 shrink-0" />;
};

// PDF upload widget for the Anexo H document required to confirm a reservation
const SubirDocReserva = ({ idReserva, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) { setMsg({ ok: false, text: "Selecciona un PDF." }); return; }
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      await postForm(`/documentos/reserva/${idReserva}/anexoh`, fd);
      setMsg({ ok: true, text: "Documento subido. Pendiente de revisión por el centro." });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (onUploaded) onUploaded();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-500">Subir Anexo H firmado (PDF)</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300
          cursor-pointer hover:border-red-400 transition-all text-sm text-gray-500">
          <FaFilePdf className="text-red-400 shrink-0" />
          <span className="truncate">{file ? file.name : "Haz clic para seleccionar…"}</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f && f.type !== "application/pdf") {
                setMsg({ ok: false, text: "Solo se admiten PDFs." });
                return;
              }
              setFile(f);
              setMsg(null);
            }}
          />
        </label>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            !file || uploading
              ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
              : "bg-brand-500 text-white hover:bg-brand-700"
          }`}
        >
          {uploading ? "Subiendo…" : "Subir"}
        </button>
      </div>
      {msg && (
        <p className={`text-xs px-3 py-1.5 rounded-lg ${
          msg.ok
            ? "bg-green-50 text-green-800 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {msg.text}
        </p>
      )}
    </div>
  );
};

// Cancellation modal with a required motivo field
const CancelModal = ({ alumno, onConfirm, onClose }) => {
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!motivo.trim()) return;
    setSubmitting(true);
    await onConfirm(motivo.trim());
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">Cancelar reserva</h3>
        <p className="text-sm text-gray-500">
          Indica el motivo de cancelación para <strong>{alumno}</strong>.
        </p>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
          rows={3}
          placeholder="Motivo de cancelación…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={255}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
            Volver
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivo.trim() || submitting}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
              !motivo.trim() || submitting
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {submitting ? "Cancelando…" : "Confirmar cancelación"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Empresa's reservation list with document upload and cancellation actions
const MisReservas = ({ reservations, onUpload, onCancel }) => {
  const [cancelModal, setCancelModal] = useState(null);

  if (!reservations || reservations.length === 0) {
    return (
      <div className="rounded-xl border border-surface-200 bg-gray-50 px-6 py-10 text-center">
        <RxClock className="mx-auto mb-2 text-2xl text-gray-300" />
        <p className="text-sm text-gray-400">No tienes alumnos reservados todavía.</p>
      </div>
    );
  }

  return (
    <>
      {cancelModal && (
        <CancelModal
          alumno={cancelModal.alumno}
          onConfirm={async (motivo) => {
            await onCancel(cancelModal.idReserva, motivo);
            setCancelModal(null);
          }}
          onClose={() => setCancelModal(null)}
        />
      )}

      <div className="space-y-3">
        {reservations.map((reserva) => {
          const estadoClass = ESTADO_COLOR[reserva.estado_reserva] || "bg-gray-100 text-gray-600 border-gray-200";
          const docEstado = reserva.estado_documento || null;

          return (
            <div
              key={reserva.id_reserva}
              className="rounded-xl border border-surface-200 bg-white px-5 py-4 shadow-sm space-y-3"
            >
              {/* Reservation header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {reserva.alumno || "Alumno"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {reserva.especialidad}{reserva.tipo_contrato ? ` · ${reserva.tipo_contrato}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${estadoClass}`}>
                  {reserva.estado_reserva}
                </span>
              </div>

              {/* Document status indicator */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <DocStatusIcon estado={docEstado} />
                <span>
                  {docEstado === "VALIDADO"
                    ? "Documento firmado validado por el centro"
                    : docEstado === "RECHAZADO"
                      ? "Documento rechazado — vuelve a subirlo"
                      : docEstado
                        ? "Documento entregado — pendiente de revisión"
                        : "Sin documento firmado"}
                </span>
              </div>

              {/* Cancellation reason */}
              {reserva.estado_reserva === "CANCELADA" && reserva.motivo && (
                <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2">
                  Motivo: {reserva.motivo}
                </p>
              )}

              {/* Document upload */}
              {reserva.estado_reserva !== "CANCELADA" && docEstado !== "VALIDADO" && (
                <SubirDocReserva idReserva={reserva.id_reserva} onUploaded={onUpload} />
              )}

              {/* Cancel reservation button (only for pending reservations) */}
              {reserva.estado_reserva === "PENDIENTE" && (
                <button
                  onClick={() => setCancelModal({ idReserva: reserva.id_reserva, alumno: reserva.alumno || "este alumno" })}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline transition-colors"
                >
                  Cancelar reserva
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default MisReservas;
