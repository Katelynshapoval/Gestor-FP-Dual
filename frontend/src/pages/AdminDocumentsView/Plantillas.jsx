import { useEffect, useRef, useState } from "react";
import { getBlob, getJSON, postForm } from "../../utils/api.js";
import { formatDocumentDate } from "../../utils/documentos.js";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";

export default function Plantillas() {
  const toast = useToast();
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const inputs = useRef({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getJSON("/documentos/plantillas")
      .then((data) => {
        if (!active) return;
        setTipos(Array.isArray(data?.tipos) ? data.tipos : []);
      })
      .catch((err) => {
        if (!active) return;
        const message = err.message || "No se pudieron cargar las plantillas.";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken, toast]);

  const upload = async (clave, nombre) => {
    const file = inputs.current[clave]?.files?.[0];
    if (!file) {
      setNotice("Selecciona un archivo DOCX.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setNotice("La plantilla tiene que ser un archivo DOCX.");
      return;
    }
    setBusy(clave);
    setNotice("");
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("clave", clave);
      const data = await postForm("/documentos/plantillas", fd);
      if (inputs.current[clave]) inputs.current[clave].value = "";
      toast.success(data.message || `Plantilla de ${nombre} actualizada.`);
      setReloadToken((value) => value + 1);
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

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
            <div className="h-4 w-40 rounded bg-surface-200" />
            <div className="mt-3 h-3 w-64 rounded bg-surface-100" />
            <div className="mt-4 h-8 w-40 rounded bg-surface-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
        <p className="font-semibold text-charcoal-950">No se pudieron cargar las plantillas.</p>
        <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setReloadToken((value) => value + 1)}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InlineNotice tone="error">{notice}</InlineNotice>
      {tipos.map((tipo) => (
        <article key={tipo.clave} className="rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-charcoal-950">{tipo.nombre}</h3>
              {tipo.activa ? (
                <>
                  <p className="mt-1 text-sm text-charcoal-800">{tipo.activa.nombre_archivo}</p>
                  <p className="mt-1 text-xs text-muted">
                    Versión {tipo.activa.version}
                    {tipo.activa.subida_por ? ` · ${tipo.activa.subida_por}` : ""}
                    {tipo.activa.creado_en ? ` · ${formatDocumentDate(tipo.activa.creado_en)}` : ""}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">Sin plantilla configurada</p>
              )}
            </div>
            <StatusBadge variant={tipo.activa ? "success" : "warning"}>
              {tipo.activa ? "Activa" : "Sin plantilla"}
            </StatusBadge>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <input
              ref={(node) => {
                inputs.current[tipo.clave] = node;
              }}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="text-sm sm:mr-auto"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy === tipo.clave}
              onClick={() => upload(tipo.clave, tipo.nombre)}
            >
              {busy === tipo.clave ? "Subiendo…" : tipo.activa ? "Reemplazar" : "Subir plantilla"}
            </button>
            {tipo.activa && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => download(tipo.activa.id_plantilla, tipo.activa.nombre_archivo)}
              >
                Descargar
              </button>
            )}
          </div>
        </article>
      ))}
      {tipos.length === 0 && (
        <div className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center text-sm text-muted shadow-card">
          No hay tipos de documento generables.
        </div>
      )}
    </div>
  );
}
