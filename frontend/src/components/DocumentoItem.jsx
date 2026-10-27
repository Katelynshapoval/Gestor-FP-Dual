import { useRef, useState } from "react";
import { postForm, postJSON } from "../utils/api.js";
import { MdOutlineFileUpload } from "react-icons/md";
import EstadoBadge from "./ui/EstadoBadge.jsx";
import InlineNotice from "./ui/InlineNotice.jsx";
import PdfViewer from "./ui/PdfViewer.jsx";
import MotivoDialog from "./ui/MotivoDialog.jsx";
import { useConfirm, useToast } from "./feedback/ToastProvider.jsx";
import { FIRMA } from "../utils/labels.js";

// One component for every document a user can act on: view (shared PdfViewer),
// upload/replace, generate/regenerate, sign, and — for staff — validate or
// reject. What is offered comes from the backend projection (`puede_*` flags
// of the document catalogue), so each role only sees its own actions; the
// endpoints check the same rules again (Phase 2: sign before validate).
const DocumentoItem = ({ doc, onRefresh, showStatus = true, compact = false }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [viewing, setViewing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const inputRef = useRef(null);
  const canUpload = doc.puede_subir || doc.puede_reemplazar;
  const status = doc.estado_operativo || "PENDIENTE_SUBIDA";

  const context = compact
    ? null
    : [doc.alumno, doc.empresa, doc.especialidad, doc.tipo_contrato, doc.convocatoria].filter(Boolean).join(" · ");

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

  // Runs one action; the error toast keeps the backend's own message
  // (e.g. "Faltan firmas antes de validar: alumno.").
  const run = async (action, successMessage) => {
    setBusy(true);
    try {
      const data = await action();
      toast.success(data?.message || successMessage);
      await refresh();
      return true;
    } catch (err) {
      toast.error(err.message || "No se pudo completar la acción.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setFileError("");
    const ok = await run(async () => {
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
      return null;
    }, doc.id_documento ? "Documento reemplazado." : "Documento enviado.");
    if (ok) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleFirmar = () =>
    run(() => postJSON(`/documentos/${doc.id_documento}/firmar`, {}), "Firma registrada.");

  const handleValidar = async () => {
    const ok = await run(() => postJSON(`/documentos/${doc.id_documento}/validar`, {}), "Documento validado.");
    if (ok) setViewing(false);
  };

  const handleRechazar = async (motivo) => {
    // Errors are shown inside the dialog, which then stays open.
    await postJSON(`/documentos/${doc.id_documento}/rechazar`, { motivo });
    toast.success("Documento rechazado.");
    setRejecting(false);
    setViewing(false);
    await refresh();
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
    await run(
      () =>
        postJSON("/documentos/generar", {
          clave: doc.clave,
          id_solicitud_empresa: doc.id_solicitud_empresa,
          id_reserva: doc.id_reserva,
          regenerar,
        }),
      `${doc.nombre} generado correctamente.`,
    );
  };

  const reviewActions = (
    <>
      {doc.puede_firmar && (
        <button type="button" className="btn btn-primary btn-sm" onClick={handleFirmar} disabled={busy}>
          Firmar
        </button>
      )}
      {doc.puede_revisar && (
        <>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setRejecting(true)} disabled={busy}>
            Rechazar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleValidar} disabled={busy}>
            Validar
          </button>
        </>
      )}
    </>
  );

  return (
    <article className={compact ? "py-3" : "px-4 py-4"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal-950">{doc.nombre}</p>
          {context && <p className="mt-1 text-xs leading-5 text-muted">{context}</p>}
        </div>
        {showStatus && (
          <EstadoBadge kind="documento" value={status} labelOverride={doc.estado_operativo_label} className="w-fit shrink-0" />
        )}
      </div>

      {doc.accion_pendiente && <p className="mt-2 text-xs leading-5 text-charcoal-800">{doc.accion_pendiente}</p>}

      {doc.firmas?.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5" aria-label={`Firmas de ${doc.nombre}`}>
          {doc.firmas.map((f) => (
            <li key={f.rol} title={f.metodo_label || undefined}>
              <span className="font-semibold text-charcoal-800">{f.rol_label || f.rol}:</span>{" "}
              <span className={f.estado === "FIRMADO" ? "text-green-700" : "text-amber-800"}>
                {FIRMA[f.estado]?.label || f.estado_label}
              </span>
              {f.metodo_label && <span className="text-muted"> · {f.metodo_label}</span>}
            </li>
          ))}
        </ul>
      )}

      {doc.estado_operativo === "RECHAZADO" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <span className="font-semibold">Motivo:</span> {doc.motivo || "Sin motivo indicado."}
        </p>
      )}

      {doc.falta_plantilla && (
        <p className="mt-2 text-xs font-medium text-amber-800">No hay plantilla activa para generarlo.</p>
      )}

      {noOwnAction && doc.accion_pendiente && (
        <p className="mt-2 text-xs text-muted">No requiere ninguna acción por tu parte.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doc.puede_ver && doc.id_documento && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(true)} disabled={busy}>
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
        {reviewActions}
      </div>

      {canUpload && (
        <div className="mt-3 border-t border-surface-200 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="file-upload min-h-10 flex-1 px-3 py-2">
              <MdOutlineFileUpload className="file-upload-icon" aria-hidden="true" />
              <span className="file-upload-text text-sm">{file ? file.name : `Seleccionar PDF de ${doc.nombre}`}</span>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                aria-label={`Archivo PDF de ${doc.nombre}`}
                onChange={(e) => {
                  const next = e.target.files[0];
                  if (next && next.type !== "application/pdf") {
                    setFileError("Solo se admiten PDFs.");
                    return;
                  }
                  setFile(next || null);
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
              {busy ? "Enviando…" : doc.id_documento ? "Reemplazar" : "Subir"}
            </button>
          </div>
          {doc.firmas?.some((f) => f.rol === "EMPRESA" || f.rol === "ALUMNO") && (
            <p className="mt-2 text-xs text-muted">
              Al subir el documento declaras que lleva tu firma. El centro lo revisa antes de validarlo.
            </p>
          )}
        </div>
      )}

      <InlineNotice tone="error" className="mt-2 px-3 py-2 text-xs">{fileError}</InlineNotice>

      <PdfViewer
        open={viewing}
        onClose={() => setViewing(false)}
        idDocumento={doc.id_documento}
        title={[doc.nombre, doc.alumno || doc.empresa].filter(Boolean).join(" · ")}
        description={[doc.especialidad, doc.tipo_contrato, doc.convocatoria].filter(Boolean).join(" · ") || undefined}
        estado={showStatus ? { kind: "documento", value: status, labelOverride: doc.estado_operativo_label } : undefined}
        firmas={doc.firmas || []}
        motivo={doc.estado_operativo === "RECHAZADO" ? doc.motivo || "Sin motivo indicado." : null}
        actions={doc.puede_firmar || doc.puede_revisar ? reviewActions : null}
        busy={busy}
        fileName={`${doc.clave || "documento"}_${doc.id_documento}.pdf`}
      />

      <MotivoDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        onConfirm={handleRechazar}
        title={`Rechazar ${doc.nombre}`}
        description="El motivo se muestra a quien tiene que sustituir el documento."
        label="Motivo del rechazo"
        confirmLabel="Rechazar documento"
        busyLabel="Rechazando…"
      />
    </article>
  );
};

export default DocumentoItem;
