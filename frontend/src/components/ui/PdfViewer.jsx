import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import EstadoBadge from "./EstadoBadge.jsx";
import { getBlob } from "../../utils/api.js";
import { FIRMA } from "../../utils/labels.js";

// One PDF viewer for every document (replaces DocViewer, ReservaDocViewer and
// ConvenioViewer; PM-7). It downloads the file with the session token, shows
// the review state, the signatures and the rejection reason, and renders the
// actions the caller passes (each screen decides what the role may do; the
// backend checks again). On narrow screens the file opens in a new tab, which
// is the usable path on phones (D.5).
const isNarrow = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches;

export default function PdfViewer({
  open,
  onClose,
  idDocumento,
  title,
  description,
  estado, // { kind, value, labelOverride }
  firmas = [],
  motivo,
  actions,
  fileName,
  busy = false,
  children,
}) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const narrow = isNarrow();

  useEffect(() => {
    if (!open || !idDocumento) return undefined;
    let objectUrl = null;
    let active = true;
    setLoading(true);
    setError("");
    setUrl(null);
    getBlob(`/documentos/${idDocumento}/descargar`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((err) => {
        if (active) setError(err.message || "No se pudo cargar el documento.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, idDocumento, attempt]);

  const openTab = useCallback(() => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const name = fileName || `documento_${idDocumento || ""}.pdf`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="full"
      busy={busy}
      headerActions={
        <>
          {url && (
            <>
              <a className="btn btn-secondary btn-sm" href={url} download={name}>
                Descargar
              </a>
              {!narrow && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={openTab}>
                  Nueva pestaña
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col">
        {(estado || firmas.length > 0 || motivo || actions || children) && (
          <div className="space-y-2 border-b border-surface-200 bg-surface-50 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {estado && <EstadoBadge kind={estado.kind} value={estado.value} labelOverride={estado.labelOverride} />}
                {firmas.map((f) => (
                  <span
                    key={f.rol}
                    className="inline-flex items-center gap-1 text-xs text-charcoal-800"
                    title={f.metodo_label || undefined}
                  >
                    <span className="font-semibold">{f.rol_label || f.rol}:</span>
                    <span className={f.estado === "FIRMADO" ? "text-green-700" : "text-amber-800"}>
                      {FIRMA[f.estado]?.label || f.estado_label || f.estado}
                    </span>
                  </span>
                ))}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {motivo && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
                <span className="font-semibold">Motivo del rechazo:</span> {motivo}
              </p>
            )}
            {children}
          </div>
        )}

        <div className="min-h-0 flex-1 bg-surface-100">
          {!idDocumento ? (
            <Centered>No hay ningún archivo para este documento.</Centered>
          ) : loading ? (
            <Centered>Cargando documento…</Centered>
          ) : error ? (
            <Centered>
              <p className="font-semibold text-charcoal-950">No se pudo cargar el documento.</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setAttempt((n) => n + 1)}>
                Reintentar
              </button>
            </Centered>
          ) : url && narrow ? (
            <Centered>
              <p className="text-sm text-charcoal-800">En el móvil el PDF se lee mejor en una pestaña nueva.</p>
              <button type="button" className="btn btn-primary btn-sm mt-4" onClick={openTab}>
                Abrir PDF
              </button>
            </Centered>
          ) : url ? (
            <iframe src={url} title={title} className="block h-full w-full border-0" />
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function Centered({ children }) {
  return <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 py-10 text-center text-sm text-muted">{children}</div>;
}
