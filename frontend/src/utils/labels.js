// One vocabulary for every state shown on screen (D.2, WF-15).
// Keys are the backend enum values, which never change here; each entry is a
// Spanish label plus the StatusBadge variant. Use `badge(kind, value)`.

export const SOLICITUD = Object.freeze({
  PENDIENTE: { label: "Pendiente de revisión", variant: "warning" },
  VALIDADO: { label: "Validada", variant: "success" },
  RECHAZADO: { label: "Rechazada", variant: "danger" },
});

export const RESERVA = Object.freeze({
  PENDIENTE: { label: "Reserva pendiente", variant: "warning" },
  CONFIRMADA: { label: "Confirmada", variant: "success" },
  CANCELADA: { label: "Cancelada", variant: "neutral" },
});

// Review status of one document file (dual_estados_validacion).
export const VALIDACION = Object.freeze({
  PENDIENTE: { label: "Pendiente de validar", variant: "warning" },
  VALIDADO: { label: "Validado", variant: "success" },
  RECHAZADO: { label: "Rechazado", variant: "danger" },
});

// Operational status computed by the backend catalogue (deriveDocumentState).
export const DOCUMENTO = Object.freeze({
  PENDIENTE_SUBIDA: { label: "Pendiente de subir", variant: "warning" },
  PENDIENTE_GENERACION: { label: "Pendiente de generar", variant: "warning" },
  PENDIENTE_FIRMA: { label: "Pendiente de firma", variant: "info" },
  PENDIENTE_VALIDACION: { label: "Pendiente de validar", variant: "warning" },
  RECHAZADO: { label: "Rechazado", variant: "danger" },
  VALIDADO: { label: "Validado", variant: "success" },
  COMPLETO: { label: "Completo", variant: "success" },
  NO_APLICA: { label: "Sin tipo de contrato", variant: "neutral" },
});

export const FIRMA = Object.freeze({
  FIRMADO: { label: "Firmado", variant: "success" },
  SIN_FIRMAR: { label: "Sin firmar", variant: "warning" },
});

export const ROL = Object.freeze({
  ADMINISTRADOR: { label: "Administración", variant: "brand" },
  COORDINADOR: { label: "Coordinación", variant: "brand" },
  EMPRESA: { label: "Empresa", variant: "info" },
  ALUMNO: { label: "Alumno", variant: "info" },
});

// Who has to act (accion_pendiente_de).
export const ACTOR = Object.freeze({
  CENTRO: "Centro",
  EMPRESA: "Empresa",
  ALUMNO: "Alumno",
});

const KINDS = { solicitud: SOLICITUD, reserva: RESERVA, validacion: VALIDACION, documento: DOCUMENTO, firma: FIRMA, rol: ROL };

// Returns { label, variant } for a backend value; unknown values are shown
// as they are, neutral, so nothing silently disappears.
export function badge(kind, value) {
  const entry = KINDS[kind]?.[value];
  if (entry) return entry;
  return { label: value ? String(value) : "Sin estado", variant: "neutral" };
}

export const label = (kind, value) => badge(kind, value).label;

// Annex name from its catalogue key.
export function anexoNombre(clave) {
  if (clave === "ANEXO_III") return "Anexo III";
  if (clave === "ANEXO_II") return "Anexo II";
  return "Anexo II/III";
}
