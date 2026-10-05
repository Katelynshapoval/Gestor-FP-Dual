import { useRef, useState } from "react";
import { getBlob, postForm, postJSON } from "../utils/api.js";
import { MdOutlineFileUpload } from "react-icons/md";
import StatusBadge from "./ui/StatusBadge.jsx";

const WORKFLOW_VARIANT = {
  NO_SUBIDO: "neutral",
  SUBIDO: "info",
  SUBIDO_FIRMADO: "success",
  SIN_FIRMAR: "warning",
  FIRMADO: "success",
  NO_HACE_NADA: "neutral",
};

const REVIEW_VARIANT = {
  PENDIENTE: "warning",
  VALIDADO: "success",
  RECHAZADO: "danger",
};

const openDocumento = async (idDocumento) => {
  const blob = await getBlob(`/documentos/${idDocumento}/descargar`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const DocumentoItem = ({ doc, onRefresh, onOpen }) => {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputRef = useRef(null);
  const canUpload = doc.puede_subir || doc.puede_reemplazar;

  const context = [doc.alumno, doc.empresa, doc.especialidad, doc.tipo_contrato, doc.convocatoria]
    .filter(Boolean)
    .join(" · ");

  const handleVer = async () => {
    if (!doc.id_documento || !doc.puede_ver) return;
    if (onOpen) {
      onOpen(doc);
      return;
    }
    setBusy(true);
    try {
      await openDocumento(doc.id_documento);
    } catch (err) {
      setMsg({ ok: false, text: err.message || "No se pudo abrir el documento." });
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("clave", doc.clave);
      if (doc.id_solicitud_alumno) fd.append("id_solicitud_alumno", doc.id_solicitud_alumno);
      if (doc.id_solicitud_empresa) fd.append("id_solicitud_empresa", doc.id_solicitud_empresa);
      if (doc.id_reserva) fd.append("id_reserva", doc.id_reserva);
      const endpoint =
        doc.clave === "ANEXO_II" || doc.clave === "ANEXO_III"
          ? `/documentos/reserva/${doc.id_reserva}/anexo`
          : "/documentos/subir";
      await postForm(endpoint, fd);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMsg({ ok: true, text: "Documento enviado." });
      if (onRefresh) await onRefresh();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleFirmar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await postJSON("/documentos/firmar", {
        clave: doc.clave,
        id_reserva: doc.id_reserva,
      });
      if (onRefresh) await onRefresh();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal-950">{doc.nombre}</p>
          {context && <p className="mt-1 text-xs leading-5 text-muted">{context}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={WORKFLOW_VARIANT[doc.estado_workflow] || "neutral"}>
            {doc.estado_workflow_label || doc.estado_workflow}
          </StatusBadge>
          {doc.estado_validacion && (
            <StatusBadge variant={REVIEW_VARIANT[doc.estado_validacion] || "neutral"}>
              {doc.estado_validacion_label || doc.estado_validacion}
            </StatusBadge>
          )}
        </div>
      </div>

      {doc.firmas?.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-muted">
          {doc.firmas.map((f) => `${f.rol === "GESTOR" ? "Gestor" : f.rol === "EMPRESA" ? "Empresa" : "Alumno"}: ${f.estado_label}`).join(" · ")}
        </p>
      )}

      {doc.estado_validacion === "RECHAZADO" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {doc.motivo || "Sin motivo indicado."}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doc.puede_ver && doc.id_documento && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleVer} disabled={busy}>
            Ver documento
          </button>
        )}
        {doc.puede_firmar && doc.estado_workflow !== "FIRMADO" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleFirmar} disabled={busy}>
            Marcar como firmado
          </button>
        )}
        {!doc.puede_ver && !canUpload && doc.estado_workflow === "NO_SUBIDO" && (
          <p className="text-xs text-muted">Todavía no hay un archivo subido.</p>
        )}
      </div>

      {canUpload && (
        <div className="mt-3 border-t border-surface-200 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="file-upload min-h-10 flex-1 px-3 py-2">
              <MdOutlineFileUpload className="file-upload-icon" />
              <span className="file-upload-text text-sm">{file ? file.name : "Seleccionar PDF"}</span>
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
              className={`btn btn-primary btn-sm ${!file || busy ? "btn-disabled" : ""}`}
              disabled={!file || busy}
              onClick={handleUpload}
            >
              {doc.id_documento ? "Reemplazar" : "Subir"}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`mt-2 rounded-md border px-3 py-2 text-xs ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}
    </article>
  );
};

export default DocumentoItem;
