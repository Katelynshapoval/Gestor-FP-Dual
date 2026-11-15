import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaPlus } from "react-icons/fa6";
import { getJSON, postJSON, putJSON } from "../../utils/api.js";
import { SeccionIntro } from "../Configuracion/Configuracion.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import InlineNotice from "../../components/ui/InlineNotice.jsx";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";
import TipoDocumentoDialog from "./TipoDocumentoDialog.jsx";
import { SkeletonCards } from "../../components/ui/Loading.jsx";
import { AMBITOS, firmantesTexto } from "./tiposDocumentoTextos.js";

const PLANTILLAS = "/documentos?vista=plantillas";

// One row: name, what it needs, its template, and (for the centre's own
// types) edit and switch off. System types only change their template.
function FilaTipo({ tipo, onEditar, onActivo, ocupado }) {
  const familia = tipo.familia_contrato === "beca" ? "Solo beca" : tipo.familia_contrato === "contrato" ? "Solo contrato" : null;
  return (
    <li className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${tipo.activo ? "" : "bg-surface-50"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`m-0 break-words font-semibold ${tipo.activo ? "text-charcoal-900" : "text-muted"}`}>{tipo.nombre}</p>
          {tipo.es_sistema && <StatusBadge variant="neutral">Del sistema</StatusBadge>}
          {!tipo.activo && <StatusBadge variant="neutral">Desactivado</StatusBadge>}
          {tipo.requerido && <StatusBadge variant="brand">Obligatorio</StatusBadge>}
          {familia && <StatusBadge variant="info">{familia}</StatusBadge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {tipo.generado
            ? firmantesTexto(tipo)
            : firmantesTexto(tipo) === "Sin firmas"
              ? "Se sube, no se genera"
              : `Se sube, no se genera · ${firmantesTexto(tipo)}`}
          {tipo.generado && (
            <>
              {" · "}
              {tipo.plantilla ? (
                <span>Plantilla versión {tipo.plantilla.version}</span>
              ) : (
                <Link to={PLANTILLAS} className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900">
                  Falta la plantilla
                </Link>
              )}
            </>
          )}
          {!tipo.es_sistema && tipo.documentos > 0 && ` · ${tipo.documentos} ${tipo.documentos === 1 ? "documento" : "documentos"}`}
        </p>
      </div>
      {!tipo.es_sistema && (
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditar(tipo)} disabled={ocupado}>
            Editar
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tipo.activo ? "btn-secondary" : "btn-outline-brand"}`}
            onClick={() => onActivo(tipo)}
            disabled={ocupado}
          >
            {tipo.activo ? "Desactivar" : "Activar"}
          </button>
        </div>
      )}
    </li>
  );
}

export default function TiposDocumento() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialogo, setDialogo] = useState(null); // { tipo: null | tipo }
  const [ocupado, setOcupado] = useState("");

  const cargar = useCallback(async () => {
    try {
      setLoadError("");
      const data = await getJSON("/tipos-documento");
      setTipos(Array.isArray(data?.tipos) ? data.tipos : []);
    } catch (err) {
      setLoadError(err.message || "No se han podido cargar los documentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (body) => {
    const tipo = dialogo?.tipo;
    const data = tipo
      ? await putJSON(`/tipos-documento/${encodeURIComponent(tipo.clave)}`, body)
      : await postJSON("/tipos-documento", body);
    toast.success(data?.message || "Documento guardado.");
    setDialogo(null);
    await cargar();
  };

  const cambiarActivo = async (tipo) => {
    if (tipo.activo) {
      const ok = await confirm({
        title: `Desactivar «${tipo.nombre}»`,
        message:
          "Dejará de pedirse en las solicitudes y reservas. Los documentos que ya existen se conservan y se pueden consultar. Puedes volver a activarlo cuando quieras.",
        confirmLabel: "Desactivar",
      });
      if (!ok) return;
    }
    setOcupado(tipo.clave);
    try {
      const data = await putJSON(`/tipos-documento/${encodeURIComponent(tipo.clave)}`, { activo: !tipo.activo });
      toast.success(data?.message || "Documento guardado.");
      await cargar();
    } catch (err) {
      toast.error(err.message || "No se ha podido guardar el documento.");
    } finally {
      setOcupado("");
    }
  };

  const propios = tipos.filter((t) => !t.es_sistema);
  const sinPlantilla = propios.filter((t) => t.activo && !t.plantilla);

  return (
    <div>
      <SeccionIntro
        meta={
          !loading &&
          !loadError && (
            <>
              <StatusBadge variant="neutral">{tipos.filter((t) => t.es_sistema).length} del sistema</StatusBadge>
              <StatusBadge variant="brand">
                {propios.length} {propios.length === 1 ? "añadido" : "añadidos"} por el centro
              </StatusBadge>
            </>
          )
        }
      >
        Los documentos que se piden en cada solicitud y reserva. Añade los que el centro genera desde
        una plantilla; los del sistema solo cambian de plantilla, en{" "}
        <Link to={PLANTILLAS} className="font-medium text-brand-700 underline underline-offset-2">
          Documentos › Plantillas
        </Link>
        .
      </SeccionIntro>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {sinPlantilla.length > 0 ? (
          <InlineNotice tone="warning" className="sm:flex-1">
            {sinPlantilla.length === 1
              ? `«${sinPlantilla[0].nombre}» no tiene plantilla: no se puede generar hasta que se suba.`
              : `${sinPlantilla.length} documentos no tienen plantilla: no se pueden generar hasta que se suba.`}{" "}
            <Link to={PLANTILLAS} className="font-semibold underline underline-offset-2">
              Subir plantilla
            </Link>
          </InlineNotice>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-primary shrink-0 shadow-none" onClick={() => setDialogo({ tipo: null })}>
          <FaPlus aria-hidden="true" className="text-xs" />
          Nuevo documento
        </button>
      </div>

      {loading ? (
        <SkeletonCards count={4} label="Cargando documentos…" />
      ) : loadError ? (
        <div className="rounded-lg border border-surface-200 bg-white px-6 py-6 shadow-card">
          <InlineNotice tone="error">{loadError}</InlineNotice>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={cargar}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(AMBITOS).map(([ambito, a]) => {
            const lista = tipos.filter((t) => t.ambito === ambito);
            return (
              <section
                key={ambito}
                aria-labelledby={`tipos-${ambito}`}
                className="overflow-hidden rounded-lg border border-surface-200 bg-white shadow-card"
              >
                <header className="border-b border-surface-200 px-5 py-4 sm:px-6">
                  <h2 id={`tipos-${ambito}`} className="form-section-title mb-0">
                    {a.titulo}
                  </h2>
                  <p className="m-0 mt-1 text-sm text-muted">{a.cada}</p>
                </header>
                {lista.length === 0 ? (
                  <p className="m-0 px-6 py-5 text-sm text-muted">Ningún documento.</p>
                ) : (
                  <ul className="m-0 list-none divide-y divide-surface-200 p-0">
                    {lista.map((t) => (
                      <FilaTipo
                        key={t.clave}
                        tipo={t}
                        ocupado={ocupado === t.clave}
                        onEditar={(tipo) => setDialogo({ tipo })}
                        onActivo={cambiarActivo}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <TipoDocumentoDialog
        open={Boolean(dialogo)}
        tipo={dialogo?.tipo || null}
        onClose={() => setDialogo(null)}
        onSave={guardar}
      />
    </div>
  );
}
