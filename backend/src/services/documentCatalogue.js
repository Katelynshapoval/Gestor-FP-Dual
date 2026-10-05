// Central document workflow catalogue.
// Types are resolved by dual_tipos_documento.nombre, never by autoincrement id.
// Review states (PENDIENTE/VALIDADO/RECHAZADO) stay separate from workflow states.

const WORKFLOW_LABEL = {
  NO_SUBIDO: "No subido",
  SUBIDO: "Subido",
  SUBIDO_FIRMADO: "Subido + firmado",
  SIN_FIRMAR: "Sin firmar",
  FIRMADO: "Firmado",
  NO_HACE_NADA: "No hace nada",
};

const REVIEW_LABEL = {
  PENDIENTE: "Pendiente de revisión",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
};

const SIGN_ROLES = ["EMPRESA", "GESTOR", "ALUMNO"];

/**
 * actor:
 *  upload  — this role uploads the file
 *  sign    — this role signs
 *  review  — this role reviews; sees the shared upload state
 *  view    — may see the file; workflow shown as NO_HACE_NADA
 *  event   — no file; workflow is SUBIDO when the context exists
 *  hidden  — not listed for this role
 */
const CATALOGUE = [
  {
    clave: "CV",
    nombre: "CV",
    legacy: false,
    ambito: "solicitud_alumno",
    stage: "solicitud",
    kind: "upload",
    requiresReview: true,
    requeridoParaValidarAlumno: true,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { ALUMNO: "upload", GESTOR: "review", EMPRESA: "view" },
  },
  {
    clave: "ANEXO_DGA",
    nombre: "Anexo DGA",
    legacy: false,
    ambito: "solicitud_alumno",
    stage: "solicitud",
    kind: "upload",
    requiresReview: true,
    requeridoParaValidarAlumno: true,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO_FIRMADO",
    actor: { ALUMNO: "upload", GESTOR: "review", EMPRESA: "hidden" },
  },
  {
    clave: "FORMULARIO",
    nombre: "Formulario",
    legacy: false,
    ambito: "solicitud_alumno",
    stage: "solicitud",
    kind: "event",
    requiresReview: false,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { ALUMNO: "event", GESTOR: "event", EMPRESA: "hidden" },
  },
  {
    clave: "CONVENIO",
    nombre: "Convenio (Formulario)",
    legacy: false,
    ambito: "solicitud_empresa",
    stage: "empresa",
    kind: "upload",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "view" },
  },
  {
    clave: "ANEXO_XIV",
    nombre: "Anexo XIV",
    legacy: false,
    ambito: "solicitud_empresa",
    stage: "empresa",
    kind: "upload",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO_FIRMADO",
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "hidden" },
  },
  {
    clave: "ANEXO_G",
    nombre: "Anexo G",
    legacy: false,
    ambito: "solicitud_empresa",
    stage: "gestor",
    kind: "upload",
    requiresReview: false,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: true,
    workflowOnUpload: "SUBIDO_FIRMADO",
    actor: { GESTOR: "upload", EMPRESA: "hidden", ALUMNO: "hidden" },
  },
  {
    clave: "EXCEL",
    nombre: "Excel",
    legacy: false,
    ambito: "solicitud_empresa",
    stage: "gestor",
    kind: "upload",
    requiresReview: false,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: true,
    workflowOnUpload: "SUBIDO",
    actor: { GESTOR: "upload", EMPRESA: "hidden", ALUMNO: "hidden" },
  },
  {
    clave: "ANEXO_II",
    nombre: "Anexo II",
    legacy: false,
    ambito: "reserva",
    stage: "reserva",
    kind: "upload",
    contractFamily: "contrato",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "view" },
  },
  {
    clave: "ANEXO_III",
    nombre: "Anexo III",
    legacy: false,
    ambito: "reserva",
    stage: "reserva",
    kind: "upload",
    contractFamily: "beca",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "view" },
  },
  {
    clave: "CALENDARIO",
    nombre: "Calendario",
    legacy: false,
    ambito: "reserva",
    stage: "reserva",
    kind: "signature",
    requiresReview: false,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: true,
    workflowOnUpload: "SUBIDO",
    signers: ["EMPRESA", "GESTOR", "ALUMNO"],
    actor: { EMPRESA: "sign", GESTOR: "sign", ALUMNO: "sign" },
    uploadRoles: ["EMPRESA", "ADMINISTRADOR", "COORDINADOR"],
  },
  {
    clave: "ANEXO_2",
    nombre: "Anexo 2 (histórico)",
    legacy: true,
    ambito: "solicitud_alumno",
    stage: "historico",
    kind: "upload",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { ALUMNO: "hidden", GESTOR: "hidden", EMPRESA: "hidden" },
  },
  {
    clave: "ANEXO_H",
    nombre: "Anexo H (histórico)",
    legacy: true,
    ambito: "reserva",
    stage: "historico",
    kind: "upload",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { ALUMNO: "hidden", GESTOR: "hidden", EMPRESA: "hidden" },
  },
];

const BY_CLAVE = Object.fromEntries(CATALOGUE.map((d) => [d.clave, d]));

function staffRole(rol) {
  return rol === "ADMINISTRADOR" || rol === "COORDINADOR" ? "GESTOR" : rol;
}

function defByClave(clave) {
  return BY_CLAVE[String(clave || "").toUpperCase()] || null;
}

function activeDefs() {
  return CATALOGUE.filter((d) => !d.legacy);
}

function requiredForStudentValidation() {
  return activeDefs().filter((d) => d.requeridoParaValidarAlumno);
}

// Contract-type flow -> Anexo II. Beca flow -> Anexo III. Unknown -> neither.
function anexoClaveForContrato(nombre) {
  const value = String(nombre || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("beca")) return "ANEXO_III";
  return "ANEXO_II";
}

function appliesToContrato(def, nombreContrato) {
  if (!def.contractFamily) return true;
  return anexoClaveForContrato(nombreContrato) === def.clave;
}

function workflowLabel(code) {
  return WORKFLOW_LABEL[code] || code || "";
}

function reviewLabel(code) {
  return code ? REVIEW_LABEL[code] || code : null;
}

module.exports = {
  WORKFLOW_LABEL,
  REVIEW_LABEL,
  SIGN_ROLES,
  CATALOGUE,
  staffRole,
  defByClave,
  activeDefs,
  requiredForStudentValidation,
  anexoClaveForContrato,
  appliesToContrato,
  workflowLabel,
  reviewLabel,
};
