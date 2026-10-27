import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaArrowRightLong,
  FaBuilding,
  FaCircleCheck,
  FaClipboardList,
  FaFileLines,
  FaPenToSquare,
  FaRotateRight,
  FaUserGraduate,
} from "react-icons/fa6";
import PageHeader from "../../components/ui/PageHeader";
import { FilterSelect } from "../../components/ui/FilterBar.jsx";
import { getJSON } from "../../utils/api.js";
import { useUrlFilters } from "../../hooks/useUrlFilters.js";
import { formatFecha } from "../../utils/fechas.js";

// Staff dashboard (Phase 4): what needs the centre's attention in one
// convocatoria, each card opening the list already filtered. Counts come from
// GET /panel/resumen; nothing is computed or invented in the browser.

const qs = (params) => new URLSearchParams(params).toString();

function tareas(c, conv) {
  const id = String(conv.id_convocatoria);
  const nombre = conv.nombre;
  return [
    {
      key: "alumnos",
      n: c.solicitudes_alumno_pendientes,
      singular: "solicitud de alumno por revisar",
      plural: "solicitudes de alumnos por revisar",
      hint: "Revisa CV y Anexo DGA y valida o rechaza la solicitud.",
      to: `/alumnos?${qs({ convocatoria: nombre, estado: "PENDIENTE" })}`,
      Icon: FaUserGraduate,
    },
    {
      key: "empresas",
      n: c.solicitudes_empresa_pendientes,
      singular: "solicitud de empresa por revisar",
      plural: "solicitudes de empresas por revisar",
      hint: "La solicitud se valida al validar su convenio firmado.",
      to: `/empresas?${qs({ curso: nombre, estado: "PENDIENTE" })}`,
      Icon: FaBuilding,
    },
    {
      key: "documentos",
      n: c.documentos_accion_centro,
      singular: "documento espera al centro",
      plural: "documentos esperan al centro",
      hint: "Generar, firmar como centro, validar o rechazar.",
      to: `/documentos?${qs({ convocatoria: id, accionPendiente: "CENTRO" })}`,
      Icon: FaFileLines,
    },
    {
      key: "cambios",
      n: c.cambios_empresa_pendientes,
      singular: "cambio de datos de empresa por aprobar",
      plural: "cambios de datos de empresa por aprobar",
      hint: "Las empresas proponen cambios; se aplican cuando el centro los aprueba.",
      to: `/empresas?${qs({ curso: nombre, cambios: "pendiente" })}`,
      Icon: FaPenToSquare,
    },
  ];
}

// Same groups and order as the Reservas page.
function reservas(r, conv) {
  const to = (grupo) => `/reservas?${qs({ convocatoria: conv.nombre, grupo })}`;
  return [
    { key: "revisar", n: r.revisar, label: "Anexo pendiente de validar", to: to("revisar"), centro: true },
    { key: "listas", n: r.listas, label: "Listas para confirmar", to: to("listas"), centro: true },
    { key: "sinTipo", n: r.sinTipo, label: "Sin tipo de contrato", to: to("sinTipo"), centro: true },
    { key: "firmas", n: r.firmas, label: "Anexo pendiente de firmas", to: to("firmas") },
    { key: "documento", n: r.documento, label: "Falta el anexo o fue rechazado", to: to("documento") },
  ];
}

const TareaCard = ({ t }) => {
  const done = t.n === 0;
  const text = `${t.n} ${t.n === 1 ? t.singular : t.plural}`;
  return (
    <li>
      <Link
        to={t.to}
        className={`group flex h-full flex-col gap-3 rounded-xl2 border bg-white p-5 shadow-card outline-none transition-[border-color,box-shadow] duration-150 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
          done ? "border-surface-200" : "border-amber-300"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
              done ? "border-surface-200 bg-surface-50 text-muted" : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <t.Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          {done ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-800">
              <FaCircleCheck aria-hidden="true" /> Al día
            </span>
          ) : (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Pendiente
            </span>
          )}
        </div>
        <p className="m-0">
          <span className={`block text-3xl font-semibold leading-none ${done ? "text-charcoal-700" : "text-charcoal-950"}`}>
            {t.n}
          </span>
          <span className="mt-1.5 block text-sm font-semibold text-charcoal-900">{t.n === 1 ? t.singular : t.plural}</span>
        </p>
        <p className="m-0 text-xs leading-5 text-muted">{t.hint}</p>
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
          <span className="sr-only">{text}: </span>Ver lista
          <FaArrowRightLong aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-1 motion-reduce:transition-none" />
        </span>
      </Link>
    </li>
  );
};

const Skeleton = () => (
  <div aria-hidden="true" className="space-y-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-xl2 border border-surface-200 bg-white p-5 shadow-card">
          <div className="h-10 w-10 rounded-lg bg-surface-100" />
          <div className="mt-4 h-7 w-12 rounded bg-surface-200" />
          <div className="mt-3 h-3 w-40 rounded bg-surface-100" />
        </div>
      ))}
    </div>
    <div className="h-40 animate-pulse rounded-xl2 border border-surface-200 bg-white shadow-card" />
  </div>
);

const Panel = () => {
  const { filters, setFilter } = useUrlFilters({ convocatoria: "" });
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: s.data ? "refreshing" : "loading", error: null }));
    const query = filters.convocatoria ? `?${qs({ convocatoria: filters.convocatoria })}` : "";
    return getJSON(`/panel/resumen${query}`)
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((error) => setState((s) => ({ status: s.data ? "ready" : "error", data: s.data, error })));
  }, [filters.convocatoria]);

  useEffect(() => {
    load();
  }, [load]);

  const { status, data, error } = state;
  const conv = data?.convocatoria;
  const c = data?.contadores;

  const lista = conv && c ? tareas(c, conv) : [];
  const grupos = conv && c ? reservas(c.reservas, conv) : [];
  const nadaPendiente = lista.every((t) => t.n === 0) && grupos.filter((g) => g.centro).every((g) => g.n === 0);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        kicker="Gestión"
        title="Panel"
        subtitle={
          conv
            ? `Convocatoria ${conv.nombre}${conv.activa ? " (activa)" : ""} · del ${formatFecha(conv.fecha_inicio)} al ${formatFecha(conv.fecha_fin)}`
            : "Lo que necesita la atención del centro."
        }
        className="mb-0"
        actions={
          data?.convocatorias?.length ? (
            <div className="flex flex-wrap items-end gap-2">
              <FilterSelect
                label="Convocatoria"
                value={filters.convocatoria || String(conv?.id_convocatoria || "")}
                onChange={(v) => setFilter("convocatoria", v)}
                options={data.convocatorias.map((o) => ({
                  value: String(o.id_convocatoria),
                  label: `${o.nombre}${o.activa ? " (activa)" : ""}`,
                }))}
                className="min-w-48"
              />
              <button type="button" className="btn btn-secondary" onClick={load} disabled={status === "refreshing"}>
                <FaRotateRight aria-hidden="true" className={status === "refreshing" ? "animate-spin" : ""} />
                Actualizar
              </button>
            </div>
          ) : null
        }
      />

      {status === "loading" ? (
        <>
          <p className="sr-only" role="status">
            Cargando el panel…
          </p>
          <Skeleton />
        </>
      ) : status === "error" ? (
        <div role="alert" className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
          <p className="font-semibold text-charcoal-950">No se pudo cargar el panel.</p>
          <p className="mt-2 text-sm text-muted">{error?.message}</p>
          <button type="button" className="btn btn-primary btn-sm mt-4" onClick={load}>
            Reintentar
          </button>
        </div>
      ) : !conv ? (
        <div role="status" className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">
          <p className="font-semibold text-charcoal-950">Todavía no hay ninguna convocatoria.</p>
          <Link to="/convocatorias" className="btn btn-primary btn-sm mt-4">
            Ir a Convocatorias
          </Link>
        </div>
      ) : (
        <div className="space-y-8" aria-busy={status === "refreshing"}>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              No se pudo actualizar: {error.message}. Se muestran los últimos datos cargados.
            </p>
          )}
          {/* No grand total: an annex awaiting validation is both a document and a reservation task. */}
          {nadaPendiente && (
            <p role="status" className="m-0 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">
              <FaCircleCheck aria-hidden="true" /> No hay nada pendiente para el centro en esta convocatoria.
            </p>
          )}

          <section aria-labelledby="panel-solicitudes">
            <h2 id="panel-solicitudes" className="form-section-title mb-4">
              Solicitudes y documentos
            </h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {lista.map((t) => (
                <TareaCard key={t.key} t={t} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="panel-reservas">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="panel-reservas" className="form-section-title mb-0">
                Reservas pendientes ({c.reservas.pendientes})
              </h2>
              <Link
                to={`/reservas?${qs({ convocatoria: conv.nombre })}`}
                className="text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
              >
                Ver todas las reservas
              </Link>
            </div>
            <ul className="overflow-hidden rounded-xl2 border border-surface-200 bg-white shadow-card">
              {grupos.map((g) => (
                <li key={g.key} className="border-b border-surface-200 last:border-b-0">
                  <Link
                    to={g.to}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 outline-none transition-colors duration-150 hover:bg-surface-50 focus-visible:bg-surface-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/30"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <FaClipboardList aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-charcoal-950">{g.label}</span>
                        <span className="block text-xs text-muted">
                          {g.centro ? "Acción del centro" : "Esperando a la empresa o al alumno"}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-1 text-sm font-semibold ${
                        g.n > 0 && g.centro
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-surface-200 bg-surface-50 text-charcoal-700"
                      }`}
                    >
                      {g.n}
                      <span className="sr-only"> reservas</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};

export default Panel;
