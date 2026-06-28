import { useRef, useState } from "react";
import { postForm } from "../../utils/api.js";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdOutlineFileUpload, MdPendingActions } from "react-icons/md";
import { RxClock } from "react-icons/rx";

const ESTADO_COLOR = {
  PENDIENTE: "bg-amber-50 text-amber-800 border-amber-200",
  CONFIRMADA: "bg-green-50 text-green-800 border-green-200",
  CANCELADA: "bg-red-50 text-red-700 border-red-200",
};

const DocStatusIcon = ({ estado }) => {
  if (estado === "VALIDADO") return <IoIosCheckmarkCircleOutline className="shrink-0 text-green-600" />;
  if (estado === "RECHAZADO") return <MdOutlineCancel className="shrink-0 text-red-500" />;
  return <MdPendingActions className="shrink-0 text-amber-500" />;
};

const SubirDocReserva = ({ idReserva, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputRef = useRef(null);

  const handleUpload = async () => {
    if (!file) {
      setMsg({ ok: false, text: "Selecciona un PDF." });
      return;
    }
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
    <div className="border-t border-surface-200 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
        Anexo H firmado (PDF)
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="file-upload min-h-10 flex-1 px-3 py-2">
          <MdOutlineFileUpload className="file-upload-icon" />
          <span className="file-upload-text text-sm">
            {file ? file.name : "Seleccionar archivo"}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
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
          className={`btn btn-primary btn-sm shrink-0 shadow-none ${!file || uploading ? "btn-disabled" : ""}`}
        >
          {uploading ? "Subiendo..." : "Subir"}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-2 rounded-md border px-3 py-2 text-xs ${
            msg.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
};

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-xl2 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900">Cancelar reserva</h3>
        <p className="text-sm text-gray-500">
          Indica el motivo de cancelación para <strong>{alumno}</strong>.
        </p>
        <textarea
          className="textarea min-h-24 text-sm"
          rows={3}
          placeholder="Motivo de cancelación..."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={255}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Volver
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivo.trim() || submitting}
            className={`btn btn-primary btn-sm shadow-none ${!motivo.trim() || submitting ? "btn-disabled" : ""}`}
          >
            {submitting ? "Cancelando..." : "Confirmar cancelación"}
          </button>
        </div>
      </div>
    </div>
  );
};

const documentText = (docEstado) => {
  if (docEstado === "VALIDADO") return "Documento firmado validado por el centro";
  if (docEstado === "RECHAZADO") return "Documento rechazado, vuelve a subirlo";
  if (docEstado) return "Documento entregado, pendiente de revisión";
  return "Sin documento firmado";
};

const MisReservas = ({ reservations, onUpload, onCancel }) => {
  const [cancelModal, setCancelModal] = useState(null);

  if (!reservations || reservations.length === 0) {
    return (
      <div className="rounded-xl2 border border-surface-200 bg-surface-50 px-6 py-10 text-center">
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

      <div className="divide-y divide-surface-200 overflow-hidden rounded-xl2 border border-surface-200 bg-white">
        {reservations.map((reserva) => {
          const estadoClass = ESTADO_COLOR[reserva.estado_reserva] || "bg-gray-100 text-gray-600 border-gray-200";
          const docEstado = reserva.estado_documento || null;
          const isCancelled = reserva.estado_reserva === "CANCELADA";
          const needsUpload = !isCancelled && docEstado !== "VALIDADO";

          return (
            <article
              key={reserva.id_reserva}
              className={`px-4 py-4 transition-[background-color] duration-150 ease-out ${
                isCancelled ? "bg-surface-50/70" : "bg-white hover:bg-surface-50/60"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-charcoal-950">
                    {reserva.alumno || "Alumno"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {reserva.especialidad}{reserva.tipo_contrato ? ` · ${reserva.tipo_contrato}` : ""}
                  </p>
                </div>
                <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${estadoClass}`}>
                  {reserva.estado_reserva}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs leading-5 text-muted">
                <DocStatusIcon estado={docEstado} />
                <span>{documentText(docEstado)}</span>
              </div>

              {isCancelled && reserva.motivo && (
                <p className="mt-3 border-t border-surface-200 pt-3 text-xs leading-5 text-muted">
                  <span className="font-semibold text-charcoal-700">Motivo:</span> {reserva.motivo}
                </p>
              )}

              {needsUpload && (
                <SubirDocReserva idReserva={reserva.id_reserva} onUploaded={onUpload} />
              )}

              {reserva.estado_reserva === "PENDIENTE" && (
                <button
                  onClick={() => setCancelModal({ idReserva: reserva.id_reserva, alumno: reserva.alumno || "este alumno" })}
                  className="mt-3 text-xs font-semibold text-red-600 transition-colors duration-150 hover:text-red-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25"
                >
                  Cancelar reserva
                </button>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
};

export default MisReservas;
