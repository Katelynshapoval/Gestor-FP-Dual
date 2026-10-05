import { useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../../utils/api.js";
import { formatDocumentDate, openDocumento } from "../../utils/documentos.js";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { FILTER_LABEL_CLASS, FILTER_SELECT_CLASS } from "../LinkStudents/utils/filters";
import PaginationBar from "../../components/ui/PaginationBar";

const VARIANT = {
  PENDIENTE_SUBIDA: "warning",
  PENDIENTE_GENERACION: "warning",
  PENDIENTE_VALIDACION: "warning",
  RECHAZADO: "danger",
  PENDIENTE_FIRMA: "info",
  VALIDADO: "success",
  COMPLETO: "success",
};

const ACTOR = {
  CENTRO: "Centro",
  EMPRESA: "Empresa",
  ALUMNO: "Alumno",
};

const EMPTY_FILTERS = {
  convocatoria: "",
  documento: "",
  estado: "",
  accionPendiente: "",
  alumno: "",
  empresa: "",
  especialidad: "",
  contexto: "",
};

const CONTROL_CLASS = `${FILTER_SELECT_CLASS} h-10 w-full`;
const DANGER_BTN =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50";

function filtersKeyOf(query) {
  return JSON.stringify({
    search: query.search,
    pageSize: query.pageSize,
    filters: query.filters,
  });
}

function toQuery(query) {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  Object.entries(query.filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function itemKey(item) {
  return [item.clave, item.id_solicitud_alumno || 0, item.id_solicitud_empresa || 0, item.id_reserva || 0].join("-");
}

function shortDate(value) {
  const formatted = formatDocumentDate(value);
  if (!formatted) return null;
  return formatted.split(",")[0].trim();
}

function personLines(item) {
  if (item.contexto === "reserva") {
    const company = [item.empresa, item.especialidad].filter(Boolean).join(" · ");
    return {
      title: item.alumno || item.empresa || "Sin persona asociada",
      detail: item.alumno ? company : item.especialidad || null,
      context: [item.contexto_label, item.convocatoria, item.tipo_contrato].filter(Boolean).join(" · "),
    };
  }
  if (item.contexto === "solicitud_empresa") {
    return {
      title: item.empresa || "Empresa",
      detail: item.especialidad || null,
      context: [item.contexto_label, item.convocatoria].filter(Boolean).join(" · "),
    };
  }
  return {
    title: [item.alumno, item.especialidad].filter(Boolean).join(" · ") || "Sin persona asociada",
    detail: null,
    context: [item.contexto_label, item.convocatoria].filter(Boolean).join(" · "),
  };
}

function originText(item) {
  if (!item.id_documento) return null;
  if (item.origen_documento === "GENERADO") {
    const who = item.origen_nombre ? `Generado por ${item.origen_nombre}` : "Generado";
    return item.plantilla_version ? `${who} · v${item.plantilla_version}` : who;
  }
  if (item.origen_nombre) return `Subido por ${item.origen_nombre}`;
  return item.puede_ver ? "No registrado" : null;
}

export default function Seguimiento({ onOpenTemplates, onSummary }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [searchInput, setSearchInput] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState({
    page: 1,
    pageSize: 10,
    search: "",
    filters: EMPTY_FILTERS,
  });
  const [payload, setPayload] = useState(null);
  const [appliedKey, setAppliedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [rejecting, setRejecting] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [busyId, setBusyId] = useState(null);
  const requestRef = useRef(0);
  const skipRef = useRef("");
  const appliedKeyRef = useRef("");

  const hasActiveFilters = Boolean(
    searchInput.trim() || query.search || Object.values(query.filters).some(Boolean),
  );
  const secondaryActive = Boolean(
    query.filters.alumno || query.filters.empresa || query.filters.especialidad || query.filters.contexto,
  );
  const showMore = moreOpen || secondaryActive;

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = searchInput.trim();
      setQuery((current) => (current.search === next ? current : { ...current, search: next, page: 1 }));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const key = JSON.stringify(query);
    if (skipRef.current === key) {
      skipRef.current = "";
      return undefined;
    }

    const requestId = ++requestRef.current;
    let active = true;
    if (appliedKeyRef.current && appliedKeyRef.current !== filtersKeyOf(query)) {
      onSummary?.(null);
    }
    setLoading(true);
    setError("");
    getJSON(`/documentos/seguimiento?${toQuery(query)}`)
      .then((data) => {
        if (!active || requestId !== requestRef.current) return;
        const nextKey = filtersKeyOf(query);
        appliedKeyRef.current = nextKey;
        setPayload(data);
        setAppliedKey(nextKey);
        if (onSummary) onSummary(data.summary || null);
        const nextPage = data?.pagination?.page;
        if (nextPage && nextPage !== query.page) {
          const nextQuery = { ...query, page: nextPage };
          skipRef.current = JSON.stringify(nextQuery);
          setQuery(nextQuery);
        }
      })
      .catch((err) => {
        if (!active || requestId !== requestRef.current) return;
        const message = err.message || "No se pudieron cargar los documentos.";
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active && requestId === requestRef.current) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, reloadToken, onSummary, toast]);

  useEffect(() => () => onSummary?.(null), [onSummary]);

  const setFilter = (key, value) => {
    setQuery((current) => ({
      ...current,
      page: 1,
      filters: { ...current.filters, [key]: value },
    }));
  };

  const clearFilters = () => {
    setSearchInput("");
    setQuery((current) => ({ ...current, page: 1, search: "", filters: EMPTY_FILTERS }));
  };

  const reload = () => setReloadToken((value) => value + 1);

  const run = async (key, action) => {
    setBusyId(key);
    try {
      const result = await action();
      if (result !== false) reload();
    } catch (err) {
      toast.error(err.message || "No se pudo completar la acción.");
    } finally {
      setBusyId(null);
    }
  };

  const generar = (item, regenerar) =>
    run(itemKey(item), async () => {
      if (regenerar) {
        const accepted = await confirm({
          title: `Regenerar ${item.nombre}`,
          message: "Se creará una nueva versión. Las firmas anteriores dejan de aplicar.",
          confirmLabel: "Regenerar",
        });
        if (!accepted) return false;
      }
      const data = await postJSON("/documentos/generar", {
        clave: item.clave,
        id_solicitud_empresa: item.id_solicitud_empresa,
        id_reserva: item.id_reserva,
        regenerar,
      });
      toast.success(data.message || `${item.nombre} generado correctamente.`);
    });

  const filtros = payload?.filtros || {};
  const pagination = payload?.pagination;
  const items = payload?.items || [];
  const filtersMatch = appliedKey === filtersKeyOf(query);
  const showInitialSkeleton = loading && !payload;
  const totalItems = pagination?.totalItems ?? 0;
  const emptyFiltered = !loading && !error && filtersMatch && totalItems === 0 && hasActiveFilters;
  const emptySystem = !loading && !error && filtersMatch && totalItems === 0 && !hasActiveFilters;

  return (
    <div className="space-y-4">
      <FilterPanel
        searchInput={searchInput}
        onSearch={setSearchInput}
        filters={query.filters}
        onFilter={setFilter}
        filtros={filtros}
        showMore={showMore}
        onToggleMore={() => setMoreOpen((open) => !open)}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      {error ? (
        <StateCard>
          <p className="font-semibold text-charcoal-950">No se pudieron cargar los documentos.</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="btn btn-primary btn-sm mt-4" onClick={reload}>
            Reintentar
          </button>
        </StateCard>
      ) : showInitialSkeleton || (loading && !filtersMatch) ? (
        <SkeletonList />
      ) : emptyFiltered ? (
        <StateCard>
          <p className="font-semibold text-charcoal-950">No se han encontrado documentos con estos filtros.</p>
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={clearFilters}>
            Limpiar filtros
          </button>
        </StateCard>
      ) : emptySystem ? (
        <StateCard>
          <p className="font-semibold text-charcoal-950">No hay documentos para esta convocatoria.</p>
        </StateCard>
      ) : (
        <>
          <div className="space-y-3" aria-busy={loading}>
            {loading ? (
              <SkeletonList />
            ) : (
              items.map((item) => (
                <DocumentRow
                  key={itemKey(item)}
                  item={item}
                  busy={busyId === itemKey(item)}
                  onView={() => openDocumento(item.id_documento).catch((err) => toast.error(err.message))}
                  onValidate={() =>
                    run(itemKey(item), async () => {
                      const data = await postJSON(`/documentos/${item.id_documento}/validar`, {});
                      toast.success(data.message || "Documento validado.");
                    })
                  }
                  onReject={() => {
                    setRejecting(item);
                    setMotivo("");
                  }}
                  onGenerate={() => generar(item, false)}
                  onRegenerate={() => generar(item, true)}
                  onSign={() =>
                    run(itemKey(item), async () => {
                      await postJSON(`/documentos/${item.id_documento}/firmar`, {});
                      toast.success("Firma registrada.");
                    })
                  }
                  onOpenTemplates={onOpenTemplates}
                />
              ))
            )}
          </div>
          {pagination && filtersMatch && totalItems > 0 && (
            <PaginationBar
              pagination={pagination}
              page={query.page}
              disabled={loading}
              noun="documento"
              onPage={(nextPage) => setQuery((current) => ({ ...current, page: nextPage }))}
              onPageSize={(nextSize) => setQuery((current) => ({ ...current, pageSize: nextSize, page: 1 }))}
            />
          )}
        </>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rechazar-documento-titulo"
            className="w-full max-w-md space-y-3 rounded-xl2 border border-surface-200 bg-white p-5 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="rechazar-documento-titulo" className="font-display text-lg font-semibold text-charcoal-950">
              Rechazar {rejecting.nombre}
            </h3>
            <textarea
              className="textarea min-h-24 text-sm"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Motivo del rechazo"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={DANGER_BTN}
                disabled={!motivo.trim() || busyId === itemKey(rejecting)}
                onClick={() =>
                  run(itemKey(rejecting), async () => {
                    await postJSON(`/documentos/${rejecting.id_documento}/rechazar`, { motivo: motivo.trim() });
                    toast.success("Documento rechazado.");
                    setRejecting(null);
                  })
                }
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  searchInput,
  onSearch,
  filters,
  onFilter,
  filtros,
  showMore,
  onToggleMore,
  hasActiveFilters,
  onClear,
}) {
  return (
    <div className="space-y-3 rounded-xl2 border border-surface-200 bg-white p-3 shadow-card sm:p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.7fr)_minmax(12rem,0.8fr)]">
        <Field label="Buscar">
          <input
            className={CONTROL_CLASS}
            placeholder="Buscar alumno, empresa, DNI o CIF"
            value={searchInput}
            onChange={(event) => onSearch(event.target.value)}
          />
        </Field>
        <Field label="Convocatoria">
          <Select
            value={filters.convocatoria}
            onChange={(value) => onFilter("convocatoria", value)}
            placeholder="Todas"
            options={filtros.convocatorias}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Documento">
          <Select
            value={filters.documento}
            onChange={(value) => onFilter("documento", value)}
            placeholder="Todos"
            options={filtros.documentos}
          />
        </Field>
        <Field label="Estado">
          <Select
            value={filters.estado}
            onChange={(value) => onFilter("estado", value)}
            placeholder="Todos"
            options={filtros.estados}
            withCount
          />
        </Field>
        <Field label="Acción pendiente de">
          <Select
            value={filters.accionPendiente}
            onChange={(value) => onFilter("accionPendiente", value)}
            placeholder="Todas"
            options={filtros.acciones || [
              { value: "CENTRO", label: "Centro" },
              { value: "ALUMNO", label: "Alumno" },
              { value: "EMPRESA", label: "Empresa" },
              { value: "NINGUNA", label: "Ninguna" },
            ]}
          />
        </Field>
        <div className="flex min-w-0 flex-col gap-1">
          <span className={`${FILTER_LABEL_CLASS} invisible`} aria-hidden="true">
            Acciones
          </span>
          <div className="flex h-10 items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-expanded={showMore}
              onClick={onToggleMore}
            >
              {showMore ? "Menos filtros" : "Más filtros"}
            </button>
            {hasActiveFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {showMore && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Alumno">
            <Select
              value={filters.alumno}
              onChange={(value) => onFilter("alumno", value)}
              placeholder="Todos"
              options={filtros.alumnos}
            />
          </Field>
          <Field label="Empresa">
            <Select
              value={filters.empresa}
              onChange={(value) => onFilter("empresa", value)}
              placeholder="Todas"
              options={filtros.empresas}
            />
          </Field>
          <Field label="Especialidad">
            <Select
              value={filters.especialidad}
              onChange={(value) => onFilter("especialidad", value)}
              placeholder="Todas"
              options={filtros.especialidades}
            />
          </Field>
          <Field label="Contexto">
            <Select
              value={filters.contexto}
              onChange={(value) => onFilter("contexto", value)}
              placeholder="Todos"
              options={filtros.contextos || [
                { value: "solicitud_alumno", label: "Solicitud alumno" },
                { value: "solicitud_empresa", label: "Solicitud empresa" },
                { value: "reserva", label: "Reserva" },
              ]}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={FILTER_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, placeholder, options = [], withCount = false }) {
  return (
    <select className={CONTROL_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {withCount && option.count != null ? `${option.label} (${option.count})` : option.label}
        </option>
      ))}
    </select>
  );
}

function DocumentRow({
  item,
  busy,
  onView,
  onValidate,
  onReject,
  onGenerate,
  onRegenerate,
  onSign,
  onOpenTemplates,
}) {
  const lines = personLines(item);
  const pending = (item.accion_pendiente_de || []).map((actor) => ACTOR[actor] || actor);
  const origin = originText(item);
  const date = shortDate(item.fecha);
  const firmas = item.firmas || [];

  return (
    <article className="rounded-xl2 border border-surface-200 bg-white px-4 py-3.5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-charcoal-950">{item.nombre}</h3>
          <p className="mt-0.5 break-words text-sm text-charcoal-800">{lines.title}</p>
          {lines.detail && <p className="break-words text-sm text-charcoal-800">{lines.detail}</p>}
          {lines.context && <p className="mt-0.5 text-xs text-muted">{lines.context}</p>}
        </div>
        <StatusBadge variant={VARIANT[item.estado_operativo] || "neutral"} className="shrink-0">
          {item.estado_operativo_label}
        </StatusBadge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {item.responsable_label && <Meta label="Responsable" value={item.responsable_label} />}
        {origin && <Meta label="Origen" value={origin} />}
        {date && <Meta label="Fecha" value={date} />}
        <Meta
          label="Pendiente de"
          value={pending.length ? pending.join(", ") : "—"}
          emphasize={pending.length > 0}
        />
      </dl>

      {firmas.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {firmas.map((firma) => `${firma.rol_label}: ${firma.estado_label}`).join(" · ")}
        </p>
      )}
      {item.estado_operativo === "RECHAZADO" && item.motivo && (
        <p className="mt-2 text-xs text-red-700">Motivo: {item.motivo}</p>
      )}
      {item.falta_plantilla && <p className="mt-2 text-xs font-medium text-amber-800">No hay plantilla activa</p>}

      <DocumentActions
        item={item}
        busy={busy}
        onView={onView}
        onValidate={onValidate}
        onReject={onReject}
        onGenerate={onGenerate}
        onRegenerate={onRegenerate}
        onSign={onSign}
        onOpenTemplates={onOpenTemplates}
      />
    </article>
  );
}

function Meta({ label, value, emphasize = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`break-words text-sm ${emphasize ? "font-semibold text-amber-800" : "text-charcoal-800"}`}>{value}</dd>
    </div>
  );
}

function DocumentActions({ item, busy, onView, onValidate, onReject, onGenerate, onRegenerate, onSign, onOpenTemplates }) {
  const buttons = [];
  if (item.puede_ver) {
    buttons.push(
      <button key="ver" type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onView}>
        Ver
      </button>,
    );
  }
  if (item.falta_plantilla) {
    buttons.push(
      <button key="plantillas" type="button" className="btn btn-secondary btn-sm" onClick={onOpenTemplates}>
        Ir a plantillas
      </button>,
    );
  }
  if (item.puede_regenerar) {
    buttons.push(
      <button key="regenerar" type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onRegenerate}>
        Regenerar
      </button>,
    );
  }
  if (item.puede_revisar) {
    buttons.push(
      <button key="rechazar" type="button" className={DANGER_BTN} disabled={busy} onClick={onReject}>
        Rechazar
      </button>,
    );
  }
  if (item.puede_generar) {
    buttons.push(
      <button key="generar" type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onGenerate}>
        Generar
      </button>,
    );
  }
  if (item.puede_firmar) {
    buttons.push(
      <button key="firmar" type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onSign}>
        Firmar
      </button>,
    );
  }
  if (item.puede_revisar) {
    buttons.push(
      <button key="validar" type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onValidate}>
        Validar
      </button>,
    );
  }
  if (!buttons.length) return null;
  return <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{buttons}</div>;
}

function SkeletonList() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="animate-pulse rounded-xl2 border border-surface-200 bg-white px-4 py-3.5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-surface-200" />
              <div className="h-3 w-56 rounded bg-surface-100" />
              <div className="h-3 w-40 rounded bg-surface-100" />
            </div>
            <div className="h-7 w-28 rounded-md bg-surface-200" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="h-8 rounded bg-surface-100" />
            <div className="h-8 rounded bg-surface-100" />
            <div className="h-8 rounded bg-surface-100" />
            <div className="h-8 rounded bg-surface-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StateCard({ children }) {
  return (
    <div className="rounded-xl2 border border-surface-200 bg-white px-6 py-12 text-center shadow-card">{children}</div>
  );
}
