import { useRef, useState } from "react";
import { getBlob, postForm } from "../../utils/api.js";
import { formatDocumentDate } from "../../utils/documentos.js";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";

export default function Plantillas({ tipos, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inputs = useRef({});

  const upload = async (clave, nombre) => {
    const file = inputs.current[clave]?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo DOCX.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("La plantilla tiene que ser un archivo DOCX.");
      return;
    }
    setBusy(clave);
    setError("");
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("clave", clave);
      const data = await postForm("/documentos/plantillas", fd);
      if (inputs.current[clave]) inputs.current[clave].value = "";
      toast.success(data.message || `Plantilla de ${nombre} actualizada.`);
      if (onChange) await onChange();
    } catch (err) {
      toast.error(err.message || "No se pudo subir la plantilla.");
    } finally {
      setBusy("");
    }
  };

  const download = async (id, filename) => {
    try {
      const blob = await getBlob(`/documentos/plantillas/${id}/descargar`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || "plantilla.docx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err.message || "No se pudo descargar la plantilla.");
    }
  };

  return (
    <div className="space-y-3">
      <InlineNotice tone="error">{error}</InlineNotice>
      {tipos.map((tipo) => (
        <article key={tipo.clave} className="rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
          <p className="text-sm font-semibold text-charcoal-950">{tipo.nombre}</p>
          {tipo.activa ? (
            <>
              <p className="mt-2 text-sm text-charcoal-800">Plantilla activa: {tipo.activa.nombre_archivo}</p>
              <p className="mt-1 text-xs text-muted">
                Versión {tipo.activa.version} · subida por {tipo.activa.subida_por || "No registrado"}
                {tipo.activa.creado_en ? ` · ${formatDocumentDate(tipo.activa.creado_en)}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-800">Sin plantilla configurada</p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={(node) => {
                inputs.current[tipo.clave] = node;
              }}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="text-sm"
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === tipo.clave} onClick={() => upload(tipo.clave, tipo.nombre)}>
              {busy === tipo.clave ? "Subiendo…" : tipo.activa ? "Reemplazar" : "Subir plantilla"}
            </button>
            {tipo.activa && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(tipo.activa.id_plantilla, tipo.activa.nombre_archivo)}>
                Descargar
              </button>
            )}
          </div>
        </article>
      ))}
      {tipos.length === 0 && <p className="text-sm text-muted">No hay tipos de documento generables.</p>}
    </div>
  );
}
