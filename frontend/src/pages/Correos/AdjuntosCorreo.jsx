import { useRef, useState } from "react";
import {
  FaDownload,
  FaFilePdf,
  FaFileSignature,
  FaPlus,
  FaTrashCan,
  FaUpload,
} from "react-icons/fa6";
import InlineNotice from "../../components/ui/InlineNotice";
import {
  useConfirm,
  useToast,
} from "../../components/feedback/ToastProvider.jsx";
import { getBlob, postForm, postJSON } from "../../utils/api";

function tamano(bytes) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Warnings for the draft switch and the saved attachments.
export function avisos(correo, lleva) {
  const out = [];
  const permitidos = new Set(
    (correo.documentos_disponibles || []).map((d) => d.documento),
  );
  for (const a of correo.adjuntos) {
    if (a.tipo === "DOCUMENTO" && !permitidos.has(a.documento)) {
      out.push(
        `«${a.nombre}» no se puede adjuntar a este correo: la aplicación no lo genera para él. Quítalo.`,
      );
    }
  }
  if (lleva && correo.adjuntos.length === 0) {
    out.push(
      "«Lleva adjuntos» está activado, pero el correo no tiene ningún adjunto. Añade uno abajo.",
    );
  }
  return out;
}

// Attachments of one email. The switch is part of the draft (saved with
// «Guardar cambios»); adding or removing an attachment is saved at once, as a
// new version, and hands the updated email to onCambio.
export default function AdjuntosCorreo({ correo, lleva, onLleva, onCambio }) {
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef(null);
  const [ocupado, setOcupado] = useState(null);
  const base = `/correos/${encodeURIComponent(correo.clave)}/adjuntos`;
  const pendientes = (correo.documentos_disponibles || []).filter(
    (d) => !d.adjunto,
  );
  const archivos = correo.adjuntos.filter((a) => a.tipo === "ARCHIVO").length;
  const maxArchivos = correo.limites?.max_archivos ?? 5;
  const maxBytes = correo.limites?.max_bytes ?? 5 * 1024 * 1024;
  const lista = avisos(correo, lleva);

  const ejecutar = async (id, fn, fallo) => {
    setOcupado(id);
    try {
      const res = await fn();
      onCambio(res.correo);
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message || fallo);
      if (err.status === 409) onCambio(null, { conflicto: true });
    } finally {
      setOcupado(null);
    }
  };

  const agregarDocumento = (d) =>
    ejecutar(
      `doc-${d.documento}`,
      () =>
        postJSON(base, { documento: d.documento, version: correo.version }),
      "No se ha podido añadir el adjunto.",
    );

  const subir = (file) => {
    if (!file) return;
    if (file.size > maxBytes) {
      toast.error(
        `El PDF no puede superar ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      );
      return;
    }
    const form = new FormData();
    form.append("archivo", file);
    form.append("version", String(correo.version));
    ejecutar("subir", () => postForm(`${base}/archivo`, form), "No se ha podido subir el PDF.");
  };

  const quitar = async (a) => {
    const ok = await confirm({
      title: "Quitar adjunto",
      message:
        a.tipo === "ARCHIVO"
          ? `«${a.nombre}» dejará de enviarse con este correo y se borrará el PDF subido.`
          : `«${a.nombre}» dejará de adjuntarse a este correo. Podrás volver a añadirlo.`,
      confirmLabel: "Quitar",
      tone: "danger",
    });
    if (!ok) return;
    ejecutar(
      `quitar-${a.id}`,
      () =>
        postJSON(`${base}/${a.id}?version=${correo.version}`, {}, "DELETE"),
      "No se ha podido quitar el adjunto.",
    );
  };

  const descargar = async (a) => {
    try {
      const blob = await getBlob(`${base}/${a.id}/archivo`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.nombre || "adjunto.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err.message || "No se ha podido descargar el PDF.");
    }
  };

  return (
    <section
      aria-labelledby="adjuntos-title"
      className="rounded-lg border border-surface-200"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200 px-4 py-3">
        <div className="min-w-0">
          <h3
            id="adjuntos-title"
            className="m-0 text-sm font-semibold text-charcoal-800"
          >
            Adjuntos
          </h3>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {lleva
              ? "Este correo se envía con los adjuntos de la lista."
              : "Este correo se envía sin adjuntos."}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer select-none items-center gap-2.5 text-sm font-medium text-charcoal-800">
          <span>Lleva adjuntos</span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={lleva}
              onChange={(e) => onLleva(e.target.checked)}
            />
            <span
              aria-hidden="true"
              className="h-6 w-11 rounded-full bg-charcoal-200 transition-colors duration-150 peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30"
            />
            <span
              aria-hidden="true"
              className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 peer-checked:translate-x-5"
            />
          </span>
        </label>
      </header>

      <div className="space-y-3 px-4 py-3">
        {lista.map((t) => (
          <InlineNotice key={t} tone="warning">
            {t}
          </InlineNotice>
        ))}

        {correo.adjuntos.length === 0 ? (
          <p className="m-0 text-sm text-muted">Ningún adjunto.</p>
        ) : (
          <ul
            className={`m-0 list-none divide-y divide-surface-200 rounded-md border border-surface-200 p-0 ${lleva ? "" : "opacity-60"}`}
          >
            {correo.adjuntos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                {a.tipo === "DOCUMENTO" ? (
                  <FaFileSignature
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-brand-700"
                  />
                ) : (
                  <FaFilePdf
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-red-700"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-charcoal-900">
                    {a.nombre}
                  </div>
                  <div className="text-xs text-muted">
                    {a.tipo === "DOCUMENTO"
                      ? "Se genera para cada solicitud al enviar el correo"
                      : `PDF subido · ${tamano(a.tamano)}${a.subido_por ? ` · ${a.subido_por}` : ""}`}
                  </div>
                </div>
                {a.tipo === "ARCHIVO" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => descargar(a)}
                    title="Descargar el PDF"
                  >
                    <FaDownload aria-hidden="true" />
                    <span className="sr-only">Descargar {a.nombre}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-red-700"
                  onClick={() => quitar(a)}
                  disabled={Boolean(ocupado)}
                  title="Quitar este adjunto"
                >
                  <FaTrashCan aria-hidden="true" />
                  <span className="sr-only">Quitar {a.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {pendientes.map((d) => (
            <button
              key={d.documento}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => agregarDocumento(d)}
              disabled={Boolean(ocupado)}
              title="El documento se genera para cada solicitud y se adjunta al enviar"
            >
              <FaPlus aria-hidden="true" />
              {ocupado === `doc-${d.documento}`
                ? "Añadiendo…"
                : `Adjuntar ${d.nombre.toLowerCase()}`}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(ocupado) || archivos >= maxArchivos}
            title={
              archivos >= maxArchivos
                ? `Máximo ${maxArchivos} PDF por correo`
                : "Un PDF fijo que se envía igual a todos (por ejemplo, una guía)"
            }
          >
            <FaUpload aria-hidden="true" />
            {ocupado === "subir" ? "Subiendo…" : "Subir PDF"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              subir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <p className="m-0 text-xs leading-5 text-muted">
          Añadir o quitar un adjunto se guarda al momento. El interruptor se
          guarda con «Guardar cambios». PDF de hasta{" "}
          {Math.round(maxBytes / (1024 * 1024))} MB, máximo {maxArchivos} por
          correo.
        </p>
      </div>
    </section>
  );
}
