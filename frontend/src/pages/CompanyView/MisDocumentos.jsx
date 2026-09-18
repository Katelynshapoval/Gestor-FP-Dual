import { useEffect, useRef, useState } from "react";
import { getBlob, postForm } from "../../utils/api.js";
import { MdOutlineFileUpload } from "react-icons/md";
import StatusBadge from "../../components/ui/StatusBadge.jsx";

const ESTADO_BADGE = {
  PENDIENTE: { label: "Pendiente", variant: "warning" },
  VALIDADO: { label: "Validado", variant: "success" },
  RECHAZADO: { label: "Rechazado", variant: "danger" },
};

const badgeFor = (estado) => ESTADO_BADGE[estado] || { label: "Sin documento", variant: "neutral" };

const openDocumento = async (idDocumento) => {
  const blob = await getBlob(`/documentos/${idDocumento}/descargar`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const UploadReplace = ({ endpoint, onUploaded, label = "Subir PDF" }) => {
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
      await postForm(endpoint, fd);
      setMsg({ ok: true, text: "Documento enviado. Queda pendiente de revisión." });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (onUploaded) await onUploaded();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-3 border-t border-surface-200 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="file-upload min-h-10 flex-1 px-3 py-2">
          <MdOutlineFileUpload className="file-upload-icon" />
          <span className="file-upload-text text-sm">{file ? file.name : "Seleccionar archivo"}</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const next = e.target.files[0];
              if (next && next.type !== "application/pdf") {
                setMsg({ ok: false, text: "Solo se admiten PDFs." });
                return;
              }
              setFile(next);
              setMsg(null);
            }}
          />
        </label>
        <button
          type="button"
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

const DocumentoCard = ({ doc, onRefresh }) => {
  const [opening, setOpening] = useState(false);
  const badge = badgeFor(doc.estado_validacion);
  const related =
    doc.ambito === "reserva"
      ? [doc.alumno, doc.especialidad, doc.estado_reserva].filter(Boolean).join(" · ")
      : [doc.convocatoria, doc.convocatoria_activa ? "Convocatoria activa" : null].filter(Boolean).join(" · ");

  const handleVer = async () => {
    if (!doc.id_documento) return;
    setOpening(true);
    try {
      await openDocumento(doc.id_documento);
    } catch (err) {
      alert(err.message || "No se pudo abrir el documento.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <article className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-charcoal-950">{doc.tipo_mostrar || doc.tipo}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{related || "—"}</p>
        </div>
        <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
      </div>

      {doc.estado_validacion === "RECHAZADO" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo del rechazo:</span> {doc.motivo || "Sin motivo indicado."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doc.id_documento ? (
          <button
            type="button"
            onClick={handleVer}
            disabled={opening}
            className={`btn btn-secondary btn-sm shadow-none ${opening ? "btn-disabled" : ""}`}
          >
            {opening ? "Abriendo..." : "Ver documento"}
          </button>
        ) : (
          <p className="text-xs text-muted">Todavía no hay un archivo subido.</p>
        )}
      </div>

      {doc.puede_reemplazar && doc.ambito === "solicitud" && (
        <UploadReplace
          endpoint={`/documentos/empresa/${doc.id_solicitud_empresa}/convenio`}
          onUploaded={onRefresh}
          label={doc.id_documento ? "Reemplazar convenio (PDF)" : "Subir convenio (PDF)"}
        />
      )}

      {doc.puede_reemplazar && doc.ambito === "reserva" && (
        <UploadReplace
          endpoint={`/documentos/reserva/${doc.id_reserva}/anexoh`}
          onUploaded={onRefresh}
          label="Reemplazar Anexo H (PDF)"
        />
      )}
    </article>
  );
};

const MisDocumentos = ({ documentos, onRefresh }) => {
  const [list, setList] = useState(documentos || { solicitudes: [], reservas: [] });

  useEffect(() => {
    setList(documentos || { solicitudes: [], reservas: [] });
  }, [documentos]);

  const solicitudes = list.solicitudes || [];
  const reservas = list.reservas || [];
  const empty = solicitudes.length === 0 && reservas.length === 0;

  if (empty) {
    return (
      <div className="form-card">
        <p className="form-section-title">Mis documentos</p>
        <p className="text-center text-sm text-gray-400 py-10">
          Todavía no hay documentos asociados a tu empresa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="form-card">
        <p className="form-section-title">Convenio</p>
        <p className="mb-4 text-sm text-gray-500">
          Documentos de tu solicitud. El convenio subido con el enlace público también aparece aquí.
        </p>
        {solicitudes.length === 0 ? (
          <p className="text-sm text-gray-400">No hay solicitudes de empresa.</p>
        ) : (
          <div className="divide-y divide-surface-200 overflow-hidden rounded-xl2 border border-surface-200 bg-white">
            {solicitudes.map((doc) => (
              <DocumentoCard
                key={`sol-${doc.id_solicitud_empresa}-${doc.id_documento || 0}`}
                doc={doc}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>

      <div className="form-card">
        <p className="form-section-title">Anexos de reservas</p>
        <p className="mb-4 text-sm text-gray-500">
          Anexo H de cada reserva de tus alumnos, cuando existe.
        </p>
        {reservas.length === 0 ? (
          <p className="text-sm text-gray-400">No hay anexos de reserva todavía.</p>
        ) : (
          <div className="divide-y divide-surface-200 overflow-hidden rounded-xl2 border border-surface-200 bg-white">
            {reservas.map((doc) => (
              <DocumentoCard
                key={`res-${doc.id_reserva}-${doc.id_documento}`}
                doc={doc}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MisDocumentos;
