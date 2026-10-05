import { useRef, useState } from "react";
import { postForm, postJSON } from "../utils/api.js";
import { openDocumento } from "../utils/documentos.js";
import { MdOutlineFileUpload } from "react-icons/md";
import StatusBadge from "./ui/StatusBadge.jsx";
import InlineNotice from "./ui/InlineNotice.jsx";
import { useConfirm, useToast } from "./feedback/ToastProvider.jsx";

const OPERATIONAL_VARIANT = {
  PENDIENTE_SUBIDA: "warning",
  PENDIENTE_GENERACION: "warning",
  PENDIENTE_VALIDACION: "warning",
  RECHAZADO: "danger",
  PENDIENTE_FIRMA: "info",
  VALIDADO: "success",
  COMPLETO: "success",
};

const DocumentoItem = ({ doc, onRefresh, onOpen, showStatus = true }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef(null);
  const canUpload = doc.puede_subir || doc.puede_reemplazar;
  const status = doc.estado_operativo || "PENDIENTE_SUBIDA";
  const statusLabel = doc.estado_operativo_label || doc.estado_workflow_label || status;

  const context = [doc.alumno, doc.empresa, doc.especialidad, doc.tipo_contrato, doc.convocatoria]
    .filter(Boolean)
    .join(" · ");

  const noOwnAction =
    !doc.requiere_accion_actual &&
    !canUpload &&
    !doc.puede_firmar &&
    !doc.puede_generar &&
    !doc.puede_regenerar &&
    !doc.puede_revisar;

  const refresh = async () => {
    if (onRefresh) await onRefresh();
  };

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
      toast.error(err.message || "No se pudo abrir el documento.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setFileError("");
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
      toast.success(doc.id_documento ? "Documento reemplazado." : "Documento enviado.");
      await refresh();
    } catch (err) {
      toast.error(err.message || "No se pudo enviar el documento.");
    } finally {
      setBusy(false);
    }
  };

  const handleFirmar = async () => {
    if (!doc.id_documento) return;
    setBusy(true);
    try {
      await postJSON(`/documentos/${doc.id_documento}/firmar`, {});
      toast.success("Firma registrada.");
      await refresh();
    } catch (err) {
      toast.error(err.message || "No se pudo registrar la firma.");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerar = async (regenerar) => {
    if (regenerar) {
      const accepted = await confirm({
        title: `Regenerar ${doc.nombre}`,
        message: "Se creará una nueva versión. Las firmas de la versión anterior dejan de aplicar.",
        confirmLabel: "Regenerar",
      });
      if (!accepted) return;
    }
    setBusy(true);
    try {
      const data = await postJSON("/documentos/generar", {
        clave: doc.clave,
        id_solicitud_empresa: doc.id_solicitud_empresa,
        id_reserva: doc.id_reserva,
        regenerar,
      });
      toast.success(data.message || `${doc.nombre} generado correctamente.`);
      await refresh();
    } catch (err) {
      toast.error(err.message || `No se pudo generar ${doc.nombre}.`);
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
        {showStatus && (
          <StatusBadge variant={OPERATIONAL_VARIANT[status] || "neutral"}>{statusLabel}</StatusBadge>
        )}
      </div>

      {doc.accion_pendiente && (
        <p className="mt-2 text-xs leading-5 text-charcoal-800">{doc.accion_pendiente}</p>
      )}

      {doc.firmas?.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-muted">
          {doc.firmas.map((f) => `${f.rol_label || f.rol}: ${f.estado_label}`).join(" · ")}
        </p>
      )}

      {doc.estado_operativo === "RECHAZADO" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {doc.motivo || "Sin motivo indicado."}
        </p>
      )}

      {noOwnAction && doc.accion_pendiente && (
        <p className="mt-2 text-xs text-muted">No requiere ninguna acción por tu parte.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doc.puede_ver && doc.id_documento && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleVer} disabled={busy}>
            Ver documento
          </button>
        )}
        {doc.puede_generar && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleGenerar(false)} disabled={busy}>
            Generar
          </button>
        )}
        {doc.puede_regenerar && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleGenerar(true)} disabled={busy}>
            Regenerar
          </button>
        )}
        {doc.puede_firmar && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleFirmar} disabled={busy}>
            Marcar como firmado
          </button>
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
                    setFileError("Solo se admiten PDFs.");
                    return;
                  }
                  setFile(next);
                  setFileError("");
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

      <InlineNotice tone="error" className="mt-2 px-3 py-2 text-xs">{fileError}</InlineNotice>
    </article>
  );
};

export default DocumentoItem;
