import { useMemo, useState } from "react";
import { getJSON, postJSON } from "../../utils/api.js";
import { formatDocumentDate, openDocumento } from "../../utils/documentos.js";
import { useConfirm, useToast } from "../../components/feedback/ToastProvider.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";

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

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
}

export default function Seguimiento({ items, onChange, onOpenTemplates }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({
    convocatoria: "",
    documento: "",
    alumno: "",
    empresa: "",
    especialidad: "",
    estado: "",
    actor: "",
    contexto: "",
    q: "",
  });
  const [rejecting, setRejecting] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [busyId, setBusyId] = useState(null);

  const options = useMemo(
    () => ({
      convocatoria: unique(items.map((item) => item.convocatoria)),
      documento: unique(items.map((item) => item.nombre)),
      alumno: unique(items.map((item) => item.alumno)),
      empresa: unique(items.map((item) => item.empresa)),
      especialidad: unique(items.map((item) => item.especialidad)),
      estado: unique(items.map((item) => item.estado_operativo_label)),
    }),
    [items],
  );

  const filtered = items.filter((item) => {
    if (filters.convocatoria && item.convocatoria !== filters.convocatoria) return false;
    if (filters.documento && item.nombre !== filters.documento) return false;
    if (filters.alumno && item.alumno !== filters.alumno) return false;
    if (filters.empresa && item.empresa !== filters.empresa) return false;
    if (filters.especialidad && item.especialidad !== filters.especialidad) return false;
    if (filters.estado && item.estado_operativo_label !== filters.estado) return false;
    if (filters.contexto && item.contexto !== filters.contexto) return false;
    if (filters.actor && !(item.accion_pendiente_de || []).includes(filters.actor)) return false;
    const q = filters.q.trim().toLowerCase();
    if (q) {
      const blob = [item.alumno, item.dni, item.empresa, item.cif, item.nombre].filter(Boolean).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const set = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));

  const refresh = async () => {
    const data = await getJSON("/documentos/seguimiento");
    onChange(Array.isArray(data?.items) ? data.items : []);
  };

  const run = async (key, action) => {
    setBusyId(key);
    try {
      await action();
      await refresh();
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
        if (!accepted) return;
      }
      const data = await postJSON("/documentos/generar", {
        clave: item.clave,
        id_solicitud_empresa: item.id_solicitud_empresa,
        id_reserva: item.id_reserva,
        regenerar,
      });
      toast.success(data.message || `${item.nombre} generado correctamente.`);
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className="input" placeholder="Buscar alumno, empresa, DNI o CIF" value={filters.q} onChange={set("q")} />
        <Select label="Convocatoria" value={filters.convocatoria} onChange={set("convocatoria")} options={options.convocatoria} />
        <Select label="Documento" value={filters.documento} onChange={set("documento")} options={options.documento} />
        <Select label="Alumno" value={filters.alumno} onChange={set("alumno")} options={options.alumno} />
        <Select label="Empresa" value={filters.empresa} onChange={set("empresa")} options={options.empresa} />
        <Select label="Especialidad" value={filters.especialidad} onChange={set("especialidad")} options={options.especialidad} />
        <Select label="Estado" value={filters.estado} onChange={set("estado")} options={options.estado} />
        <label className="text-xs font-semibold text-gray-600">
          Acción pendiente de
          <select className="select-input mt-1" value={filters.actor} onChange={set("actor")}>
            <option value="">Todas</option>
            <option value="CENTRO">Centro</option>
            <option value="EMPRESA">Empresa</option>
            <option value="ALUMNO">Alumno</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">
          Contexto
          <select className="select-input mt-1" value={filters.contexto} onChange={set("contexto")}>
            <option value="">Todos</option>
            <option value="solicitud_alumno">Solicitud alumno</option>
            <option value="solicitud_empresa">Solicitud empresa</option>
            <option value="reserva">Reserva</option>
          </select>
        </label>
      </div>

      <p className="text-sm text-muted">{filtered.length} documento{filtered.length === 1 ? "" : "s"}</p>

      <div className="space-y-3">
        {filtered.map((item) => {
          const key = itemKey(item);
          const busy = busyId === key;
          return (
            <article key={key} className="rounded-xl2 border border-surface-200 bg-white p-4 shadow-card">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-charcoal-950">{item.nombre}</p>
                  <p className="mt-1 text-sm text-charcoal-800">
                    {[item.alumno, item.empresa, item.especialidad].filter(Boolean).join(" · ") || "Sin persona asociada"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {[item.convocatoria, item.contexto_label, item.tipo_contrato].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <StatusBadge variant={VARIANT[item.estado_operativo] || "neutral"}>
                  {item.estado_operativo_label}
                </StatusBadge>
              </div>

              <div className="mt-3 grid gap-2 text-xs leading-5 text-charcoal-800 md:grid-cols-2">
                <p>Responsable: {item.responsable_label || "—"}</p>
                <p>Origen: {item.subido_por === "No registrado" ? "No registrado" : `${item.origen_label} · ${item.subido_por}`}</p>
                <p>Fecha: {formatDocumentDate(item.fecha) || "—"}</p>
                <p>Contexto: {item.contexto_label}</p>
                {item.accion_pendiente && <p className="md:col-span-2">{item.accion_pendiente}</p>}
                {item.falta_plantilla && <p>Motivo: No hay plantilla activa</p>}
                {(item.accion_pendiente_de || []).length > 0 && (
                  <p>Pendiente de: {(item.accion_pendiente_de || []).map((actor) => ACTOR[actor] || actor).join(", ")}</p>
                )}
                {item.firmas?.length > 0 && (
                  <p className="md:col-span-2">
                    {item.firmas.map((firma) => `${firma.rol_label}: ${firma.estado_label}`).join(" · ")}
                  </p>
                )}
                {item.plantilla_nombre && (
                  <p>Generado desde: {item.plantilla_nombre} v{item.plantilla_version}</p>
                )}
                {item.estado_operativo === "RECHAZADO" && item.motivo && <p>Motivo del rechazo: {item.motivo}</p>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.puede_ver && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => openDocumento(item.id_documento).catch((err) => toast.error(err.message))}>
                    Ver
                  </button>
                )}
                {item.puede_revisar && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => run(key, async () => {
                      const data = await postJSON(`/documentos/${item.id_documento}/validar`, {});
                      toast.success(data.message || "Documento validado.");
                    })}
                  >
                    Validar
                  </button>
                )}
                {item.puede_revisar && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setRejecting(item); setMotivo(""); }}>
                    Rechazar
                  </button>
                )}
                {item.puede_generar && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => generar(item, false)}>
                    Generar
                  </button>
                )}
                {item.puede_regenerar && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => generar(item, true)}>
                    Regenerar
                  </button>
                )}
                {item.puede_firmar && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => run(key, async () => {
                      await postJSON(`/documentos/${item.id_documento}/firmar`, {});
                      toast.success("Firma registrada.");
                    })}
                  >
                    Firmar
                  </button>
                )}
                {item.falta_plantilla && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenTemplates}>
                    Ir a plantillas
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-muted">No hay documentos que coincidan con los filtros.</p>}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div className="w-full max-w-md space-y-3 rounded-xl2 bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="font-semibold">Rechazar {rejecting.nombre}</h3>
            <textarea className="textarea min-h-24 text-sm" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo del rechazo" />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(null)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!motivo.trim()}
                onClick={() => run(itemKey(rejecting), async () => {
                  await postJSON(`/documentos/${rejecting.id_documento}/rechazar`, { motivo: motivo.trim() });
                  toast.success("Documento rechazado.");
                  setRejecting(null);
                })}
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

function itemKey(item) {
  return [item.clave, item.id_solicitud_alumno, item.id_solicitud_empresa, item.id_reserva].join("-");
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="text-xs font-semibold text-gray-600">
      {label}
      <select className="select-input mt-1" value={value} onChange={onChange}>
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
