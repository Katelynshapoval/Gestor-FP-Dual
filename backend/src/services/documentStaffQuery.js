const { OPERATIONAL_LABEL } = require("./documentCatalogue");

const PAGE_SIZES = [10, 20, 50];
const OPEN_STATES = new Set([
  "PENDIENTE_SUBIDA",
  "PENDIENTE_GENERACION",
  "PENDIENTE_VALIDACION",
  "RECHAZADO",
  "PENDIENTE_FIRMA",
]);
const ESTADO_ORDER = [
  "PENDIENTE_SUBIDA",
  "PENDIENTE_GENERACION",
  "PENDIENTE_VALIDACION",
  "PENDIENTE_FIRMA",
  "RECHAZADO",
  "VALIDADO",
  "COMPLETO",
];

function parseStaffQuery(query = {}) {
  const rawSize = Number(query.pageSize);
  const rawPage = Number.parseInt(query.page, 10);
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: PAGE_SIZES.includes(rawSize) ? rawSize : 10,
    search: String(query.search || "").trim().toLowerCase(),
    convocatoria: String(query.convocatoria || "").trim(),
    documento: String(query.documento || "").trim(),
    estado: String(query.estado || "").trim(),
    accionPendiente: String(query.accionPendiente || "").trim(),
    alumno: String(query.alumno || "").trim(),
    empresa: String(query.empresa || "").trim(),
    especialidad: String(query.especialidad || "").trim(),
    contexto: String(query.contexto || "").trim(),
  };
}

function same(filter, id, label) {
  if (!filter) return true;
  if (id != null && String(id) === filter) return true;
  return label != null && String(label) === filter;
}

function matches(item, query, { ignoreEstado = false } = {}) {
  if (!same(query.convocatoria, item.id_convocatoria, item.convocatoria)) return false;
  if (!same(query.documento, item.clave, item.nombre)) return false;
  if (!ignoreEstado && !same(query.estado, item.estado_operativo, item.estado_operativo_label)) return false;
  if (!same(query.alumno, item.id_alumno, item.alumno)) return false;
  if (!same(query.empresa, item.id_empresa, item.empresa)) return false;
  if (!same(query.especialidad, item.id_especialidad, item.especialidad)) return false;
  if (query.contexto && item.contexto !== query.contexto) return false;
  if (query.accionPendiente === "NINGUNA") {
    if ((item.accion_pendiente_de || []).length > 0) return false;
  } else if (query.accionPendiente && !(item.accion_pendiente_de || []).includes(query.accionPendiente)) {
    return false;
  }
  if (query.search) {
    const blob = [item.alumno, item.dni, item.empresa, item.cif, item.nombre]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!blob.includes(query.search)) return false;
  }
  return true;
}

function needsAction(item) {
  return (item.accion_pendiente_de || []).length > 0;
}

function activityTime(item) {
  if (!item.fecha) return 0;
  const time = new Date(item.fecha).getTime();
  return Number.isFinite(time) ? time : 0;
}

function stableKey(item) {
  return [
    item.clave || "",
    item.id_solicitud_alumno || 0,
    item.id_solicitud_empresa || 0,
    item.id_reserva || 0,
    item.id_documento || 0,
  ].join(":");
}

function compareStaff(a, b) {
  const action = Number(needsAction(b)) - Number(needsAction(a));
  if (action) return action;
  const convId = (Number(b.id_convocatoria) || 0) - (Number(a.id_convocatoria) || 0);
  if (convId) return convId;
  const convName = String(b.convocatoria || "").localeCompare(String(a.convocatoria || ""), "es");
  if (convName) return convName;
  const activity = activityTime(b) - activityTime(a);
  if (activity) return activity;
  return stableKey(a).localeCompare(stableKey(b));
}

function uniqueOptions(items, valueOf, labelOf) {
  const map = new Map();
  for (const item of items) {
    const value = valueOf(item);
    const label = labelOf(item);
    if (value == null || value === "" || label == null || label === "") continue;
    const key = String(value);
    if (!map.has(key)) map.set(key, { value: key, label: String(label) });
  }
  return [...map.values()];
}

function estadoOptions(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item.estado_operativo) continue;
    counts.set(item.estado_operativo, (counts.get(item.estado_operativo) || 0) + 1);
  }
  return ESTADO_ORDER.filter((key) => counts.has(key)).map((key) => ({
    value: key,
    label: OPERATIONAL_LABEL[key] || key,
    count: counts.get(key),
  }));
}

function buildStaffPage(items, rawQuery) {
  const query = parseStaffQuery(rawQuery);
  const convocatoriaScope = items.filter((item) =>
    same(query.convocatoria, item.id_convocatoria, item.convocatoria),
  );
  const countedForEstado = convocatoriaScope.filter((item) => matches(item, query, { ignoreEstado: true }));
  const filtered = convocatoriaScope.filter((item) => matches(item, query)).sort(compareStaff);

  const totalItems = filtered.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;

  const convocatorias = uniqueOptions(
    items,
    (item) => item.id_convocatoria,
    (item) => item.convocatoria,
  ).sort((a, b) => b.label.localeCompare(a.label, "es"));

  return {
    items: filtered.slice(start, start + query.pageSize),
    pagination: {
      page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    },
    summary: {
      total: totalItems,
      pendientes: filtered.filter((item) => OPEN_STATES.has(item.estado_operativo)).length,
      accionCentro: filtered.filter((item) => (item.accion_pendiente_de || []).includes("CENTRO")).length,
    },
    filtros: {
      convocatorias,
      documentos: uniqueOptions(convocatoriaScope, (item) => item.clave, (item) => item.nombre).sort((a, b) =>
        a.label.localeCompare(b.label, "es"),
      ),
      alumnos: uniqueOptions(convocatoriaScope, (item) => item.id_alumno, (item) => item.alumno).sort((a, b) =>
        a.label.localeCompare(b.label, "es"),
      ),
      empresas: uniqueOptions(convocatoriaScope, (item) => item.id_empresa, (item) => item.empresa).sort((a, b) =>
        a.label.localeCompare(b.label, "es"),
      ),
      especialidades: uniqueOptions(
        convocatoriaScope,
        (item) => item.id_especialidad,
        (item) => item.especialidad,
      ).sort((a, b) => a.label.localeCompare(b.label, "es")),
      estados: estadoOptions(countedForEstado),
      contextos: [
        { value: "solicitud_alumno", label: "Solicitud alumno" },
        { value: "solicitud_empresa", label: "Solicitud empresa" },
        { value: "reserva", label: "Reserva" },
      ],
      acciones: [
        { value: "CENTRO", label: "Centro" },
        { value: "ALUMNO", label: "Alumno" },
        { value: "EMPRESA", label: "Empresa" },
        { value: "NINGUNA", label: "Ninguna" },
      ],
    },
  };
}

module.exports = {
  PAGE_SIZES,
  parseStaffQuery,
  buildStaffPage,
  compareStaff,
};
