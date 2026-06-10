import { useRef, useState, useEffect } from "react";
import { IoIosCheckmarkCircleOutline } from "react-icons/io";
import { MdOutlineCancel, MdPendingActions, MdOutlineFileUpload } from "react-icons/md";
import { FaFilePdf } from "react-icons/fa6";
import { RxLockClosed } from "react-icons/rx";

// Calcula el estado de la reserva para una fila concreta
function calcularEstado(r) {
  const asignadoDefinitivo = r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido;

  if (asignadoDefinitivo && r.miSlot > 0) return "asignado_a_mi";
  if (asignadoDefinitivo && r.miSlot === 0) return "asignado_otra";
  if (r.miSlot > 0) return "slot_confirmado";
  if (r.documentoSubido) return "doc_subido";
  return "solo_reservado";
}

// Etiqueta e icono por estado
const ESTADO_CONFIG = {
  asignado_a_mi: {
    label: "Asignado a tu empresa",
    icon: IoIosCheckmarkCircleOutline,
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  asignado_otra: {
    label: "Asignado a otra empresa",
    icon: RxLockClosed,
    cls: "bg-gray-50 text-gray-500 border-gray-200",
  },
  slot_confirmado: {
    label: "Confirmado — pendiente de firma",
    icon: MdPendingActions,
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  doc_subido: {
    label: "Documento entregado — pendiente de validación",
    icon: MdPendingActions,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  solo_reservado: {
    label: "Reservado — sin documento",
    icon: MdOutlineCancel,
    cls: "bg-red-50 text-red-600 border-red-200",
  },
};

// Tarjeta individual de alumno reservado
const TarjetaReserva = ({ r, user, onUpload, onCancel, onVerDoc }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputRef = useRef(null);

  const estado = calcularEstado(r);
  const { label, icon: Icono, cls } = ESTADO_CONFIG[estado];
  const asignadoDefinitivo = r.anexo2FirmadoRecibido || r.anexo3FirmadoRecibido;

  // Maneja la selección del documento
  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f && f.type !== "application/pdf") {
      setMsg({ ok: false, text: "Solo se admiten archivos PDF." });
      setFile(null);
      return;
    }
    setFile(f);
    setMsg(null);
  };

  // Sube el documento firmado al servidor
  const handleUpload = async () => {
    if (!file) {
      setMsg({ ok: false, text: "Selecciona un PDF primero." });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append("documento", file);
      formData.append("idUser", user.idUser ?? "");
      formData.append("email", user.email ?? "");
      const res = await fetch(`/reservationDoc/${r.idGestion}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error al subir el documento");
      setMsg({ ok: true, text: "Documento enviado correctamente." });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUpload();
    } catch (err) {
      console.error(err);
      setMsg({ ok: false, text: "No se pudo subir el documento." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Encabezado: nombre + especialidad */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-gray-900">
            {r.nombre}{" "}
            <span className="font-normal text-sm text-gray-400">({r.dni})</span>
          </p>
          {r.nombreEsp && (
            <p className="mt-0.5 text-xs text-gray-500">{r.nombreEsp}</p>
          )}
        </div>

        {/* Badge de estado */}
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${cls}`}
        >
          <Icono className="shrink-0 text-base" />
          {label}
        </span>
      </div>

      {/* Datos adicionales del alumno */}
      {(r.emailAlumno || r.telalumno) && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-gray-500">
          {r.emailAlumno && <span>✉ {r.emailAlumno}</span>}
          {r.telalumno && <span>📞 {r.telalumno}</span>}
          {r.carnetDeConducir === "S" && <span>🚗 Carnet de conducir</span>}
          {r.tieneCoche === "S" && <span>🚘 Coche propio</span>}
        </div>
      )}

      {/* Zona de acciones */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Ver documento ya subido */}
        {r.documentoSubido === 1 && (
          <button
            type="button"
            onClick={() => onVerDoc(r.idGestion, r.idAuxEmpresa ?? "")}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 transition hover:bg-gray-100"
          >
            <FaFilePdf className="text-red-500" />
            Ver documento firmado
          </button>
        )}

        {/* Subir documento (solo si no hay definitivo ni doc previo) */}
        {!asignadoDefinitivo && !r.documentoSubido && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id={`doc-${r.idGestion}`}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFile}
            />
            <label
              htmlFor={`doc-${r.idGestion}`}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs text-brand-600 transition hover:bg-brand-50"
            >
              <MdOutlineFileUpload className="text-base" />
              {file ? file.name : "Subir acuerdo firmado"}
            </label>
            {file && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="rounded-xl border border-brand-300 bg-brand px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {uploading ? "Enviando…" : "Confirmar"}
              </button>
            )}
          </div>
        )}

        {/* Cancelar reserva (solo si no está definitivamente asignado a nadie) */}
        {!asignadoDefinitivo && r.miSlot === 0 && (
          <button
            type="button"
            onClick={() => onCancel(r.idGestion)}
            className="ml-auto rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            Cancelar reserva
          </button>
        )}
      </div>

      {/* Mensaje de resultado de subida */}
      {msg && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            msg.ok
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
};

// Modal inline para visualizar el documento firmado de la reserva
const DocModal = ({ idGestion, idAuxEmpresa, onClose }) => {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl = null;

    const fetchPdf = async () => {
      try {
        const res = await fetch(`/reservationDoc/${idGestion}/${idAuxEmpresa}`);
        if (!res.ok) throw new Error("Error al cargar el PDF");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err) {
        console.error("Error al obtener el documento:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPdf();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [idGestion, idAuxEmpresa]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Documento firmado</h2>
          <div className="modal-actions">
            {pdfUrl && (
              <button
                onClick={() => window.open(pdfUrl, "_blank")}
                className="btn btn-secondary btn-sm"
              >
                Nueva pestaña
              </button>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          {loading && (
            <p className="py-8 text-center text-sm text-gray-500">
              Cargando documento…
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

// Panel completo de reservas de la empresa logueada
const MisReservas = ({ reservations, user, onUpload, onCancel }) => {
  const [viewingDoc, setViewingDoc] = useState(null);

  if (reservations.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Aún no has reservado ningún alumno. Puedes hacerlo desde el listado
        general de alumnos.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {reservations.map((r) => (
          <TarjetaReserva
            key={`${r.idGestion}-${r.idAuxEmpresa}`}
            r={r}
            user={user}
            onUpload={onUpload}
            onCancel={onCancel}
            onVerDoc={(idGestion, idAuxEmpresa) =>
              setViewingDoc({ idGestion, idAuxEmpresa })
            }
          />
        ))}
      </div>

      {viewingDoc && (
        <DocModal
          idGestion={viewingDoc.idGestion}
          idAuxEmpresa={viewingDoc.idAuxEmpresa}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </>
  );
};

export default MisReservas;
