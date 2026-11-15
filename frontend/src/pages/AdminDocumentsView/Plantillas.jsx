import { useEffect, useRef, useState } from "react";
import { getBlob, getJSON, postForm, postJSON } from "../../utils/api.js";
import { formatDocumentDate } from "../../utils/documentos.js";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useUser } from "../../context/UserContext";

// The fields a template can use, as they must be written in the .docx.
function CamposPlantilla({ variables, firmas = [] }) {
  return (
    <details className="group mt-3 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-medium text-charcoal-800 marker:text-muted">
        Campos que puede usar la plantilla ({variables.length + firmas.length})
      </summary>
      {firmas.length > 0 && (
        <>
          <p className="mb-2 mt-2 text-xs text-muted">
            <strong className="font-semibold text-charcoal-800">Firmas.</strong> Pon cada uno donde firma esa persona:
            al firmar, su imagen se inserta en ese sitio. Sin él, la firma va en una hoja de firmas al final.
          </p>
          <ul className="m-0 mb-3 grid list-none gap-x-4 gap-y-1.5 p-0 sm:grid-cols-2">
            {firmas.map((v) => (
              <li key={v.nombre} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                <code className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-800">
                  {v.marcador}
                </code>
                <span className="text-muted">{v.etiqueta}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mb-2 mt-2 text-xs text-muted">
        Escríbelos tal cual en el documento Word; al generarlo se sustituyen por los datos de cada solicitud o reserva.
      </p>
      <ul className="m-0 grid list-none gap-x-4 gap-y-1.5 p-0 sm:grid-cols-2">
        {variables.map((v) => (
          <li key={v.nombre} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <code className="rounded border border-surface-200 bg-white px-1.5 py-0.5 font-mono text-xs text-brand-800">
              {v.marcador}
            </code>
            <span className="text-muted">{v.etiqueta}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Plantillas() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useUser();
  // Template upload is ADMINISTRADOR-only on the server (SEC-6)
  const canUpload = user?.rol === "ADMINISTRADOR";
  const [tipos, setTipos] = useState([]);
  // { convocatoria, plantilla_activa, solicitudes_sin_convenio } for the active convocatoria
  const [convenio, setConvenio] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState(null);
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
        setConvenio(data?.convenio || null);
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

  // Generates, one by one on the server, every convenio still missing in the
  // active convocatoria; each company receives its convenio by email.
  const generarPendientes = async () => {
    const n = convenio?.solicitudes_sin_convenio || 0;
    const accepted = await confirm({
      title: "Generar convenios pendientes",
      message: `Se generará el convenio de ${n} ${n === 1 ? "solicitud" : "solicitudes"} de empresa y se enviará por correo a cada empresa. Puede tardar unos minutos.`,
      confirmLabel: "Generar",
    });
    if (!accepted) return;
    setGenerando(true);
    setResultado(null);
    try {
      const data = await postJSON("/documentos/convenios/generar-pendientes", {});
      setResultado(data);
      if (data.fallidos?.length) toast.error(data.message);
      else toast.success(data.message);
      setReloadToken((value) => value + 1);
    } catch (err) {
      toast.error(err.message || "No se pudieron generar los convenios.");
    } finally {
      setGenerando(false);
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
      <div className="space-y-3">
        <span role="status" className="sr-only">Cargando plantillas…</span>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} aria-hidden="true" className="motion-safe:animate-pulse rounded-lg border border-surface-200 bg-white p-4 shadow-card">
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
      <div className="rounded-lg border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
        <p className="font-semibold text-charcoal-950">No se pudieron cargar las plantillas.</p>
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => setReloadToken((value) => value + 1)}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InlineNotice tone="error">{notice}</InlineNotice>
      {convenio && !convenio.plantilla_activa && (
        <InlineNotice tone="warning">
          No hay plantilla activa de Convenio.{" "}
          {convenio.solicitudes_sin_convenio > 0
            ? `${convenio.solicitudes_sin_convenio} ${
                convenio.solicitudes_sin_convenio === 1 ? "solicitud de empresa espera" : "solicitudes de empresa esperan"
              } su convenio${convenio.convocatoria ? ` en la convocatoria ${convenio.convocatoria}` : ""}.`
            : "Las nuevas solicitudes de empresa no recibirán su convenio hasta que se suba."}
        </InlineNotice>
      )}
      {convenio?.plantilla_activa && convenio.solicitudes_sin_convenio > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0">
            {convenio.solicitudes_sin_convenio}{" "}
            {convenio.solicitudes_sin_convenio === 1 ? "solicitud de empresa no tiene" : "solicitudes de empresa no tienen"} convenio
            {convenio.convocatoria ? ` en la convocatoria ${convenio.convocatoria}` : ""}.
          </p>
          <button type="button" className="btn btn-outline-brand btn-sm shrink-0" disabled={generando} onClick={generarPendientes}>
            {generando ? "Generando…" : "Generar convenios pendientes"}
          </button>
        </div>
      )}
      {resultado?.fallidos?.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="m-0 font-semibold">{resultado.message}</p>
          <ul className="mt-1 list-disc pl-5">
            {resultado.fallidos.map((f) => (
              <li key={f.id_solicitud_empresa}>
                {f.empresa || `Solicitud ${f.id_solicitud_empresa}`}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!canUpload && (
        <InlineNotice tone="info">
          Solo un administrador puede subir o reemplazar plantillas.
        </InlineNotice>
      )}
      {tipos.map((tipo) => (
        <article key={tipo.clave} className="rounded-lg border border-surface-200 bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-charcoal-950">{tipo.nombre}</h3>
              {tipo.ambito_label && (
                <p className="mt-0.5 text-xs text-muted">
                  {tipo.ambito_label}
                  {tipo.personalizado ? " · añadido por el centro" : ""}
                </p>
              )}
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
          {tipo.firmas_sin_marca?.length > 0 && (
            <InlineNotice tone="warning" className="mt-3 px-3 py-2 text-xs">
              Esta plantilla no dice dónde firma {tipo.firmas_sin_marca.join(" ni ")}: su firma irá en una hoja de
              firmas al final del documento. Añade el campo de firma a la plantilla para colocarla en su sitio.
            </InlineNotice>
          )}
          {tipo.variables?.length > 0 && <CamposPlantilla variables={tipo.variables} firmas={tipo.variables_firma} />}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {canUpload && (
              <>
                <input
                  ref={(node) => {
                    inputs.current[tipo.clave] = node;
                  }}
                  type="file"
                  aria-label={`Plantilla DOCX para ${tipo.nombre}`}
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="text-sm sm:mr-auto"
                />
                <button
                  type="button"
                  className="btn btn-outline-brand btn-sm"
                  disabled={busy === tipo.clave}
                  onClick={() => upload(tipo.clave, tipo.nombre)}
                >
                  {busy === tipo.clave ? "Subiendo…" : tipo.activa ? "Reemplazar" : "Subir plantilla"}
                </button>
              </>
            )}
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
        <div className="rounded-lg border border-surface-200 bg-white px-6 py-12 text-center text-sm text-muted shadow-card">
          No hay tipos de documento generables. Añádelos en Configuración › Documentos.
        </div>
      )}
    </div>
  );
}
