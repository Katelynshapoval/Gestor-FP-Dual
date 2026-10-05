// Central document workflow catalogue.
// Types are resolved by dual_tipos_documento.nombre, never by autoincrement id.
// Review states (PENDIENTE/VALIDADO/RECHAZADO) stay separate from the operational status.
// FORMULARIO is historical only: the student application is not a document.
// The real shared document is CONVENIO.

const OPERATIONAL_LABEL = {
  PENDIENTE_SUBIDA: "Pendiente de subir",
  PENDIENTE_GENERACION: "Pendiente de generar",
  PENDIENTE_VALIDACION: "Pendiente de validar",
  RECHAZADO: "Rechazado",
  PENDIENTE_FIRMA: "Pendiente de firma",
  VALIDADO: "Validado",
  COMPLETO: "Completo",
};

const WORKFLOW_LABEL = {
  NO_SUBIDO: "Pendiente de subir",
  SUBIDO: "Pendiente de validar",
  SUBIDO_FIRMADO: "Pendiente de validar",
  SIN_FIRMAR: "Sin firmar",
  FIRMADO: "Firmado",
};

const REVIEW_LABEL = {
  PENDIENTE: "Pendiente de validar",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
};

const SIGN_ROLES = ["EMPRESA", "GESTOR", "ALUMNO"];

const ACTOR_LABEL = {
  CENTRO: "Centro",
  EMPRESA: "Empresa",
  ALUMNO: "Alumno",
};

/**
 * actor:
 *  upload  — this role may upload the file
 *  sign    — this role signs
 *  review  — this role reviews; sees the real shared state
 *  view    — may see the file and its real state, usually without an action
 *  hidden  — not listed for this role
 *
 * generated documents are produced from the active DB template.
 * Generation is not a signature and does not validate the document.
 */
const CATALOGUE = [
  {
    clave: "CV",
    nombre: "CV",
    legacy: false,
    ambito: "solicitud_alumno",
    stage: "solicitud",
    kind: "upload",
    generated: false,
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
    generated: false,
    requiresReview: true,
    requeridoParaValidarAlumno: true,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO_FIRMADO",
    actor: { ALUMNO: "upload", GESTOR: "review", EMPRESA: "hidden" },
  },
  {
    clave: "FORMULARIO",
    nombre: "Formulario",
    legacy: true,
    ambito: "solicitud_alumno",
    stage: "historico",
    kind: "upload",
    generated: false,
    requiresReview: false,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { ALUMNO: "hidden", GESTOR: "hidden", EMPRESA: "hidden" },
  },
  {
    clave: "CONVENIO",
    nombre: "Convenio",
    legacy: false,
    ambito: "solicitud_empresa",
    stage: "empresa",
    kind: "upload",
    generated: true,
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    signers: ["EMPRESA"],
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "view" },
  },
  {
    clave: "ANEXO_XIV",
    nombre: "Anexo XIV",
    legacy: false,
    ambito: "solicitud_empresa",
    stage: "empresa",
    kind: "upload",
    generated: false,
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
    generated: false,
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
    generated: false,
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
    generated: true,
    contractFamily: "contrato",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    signers: ["EMPRESA", "GESTOR", "ALUMNO"],
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "view" },
  },
  {
    clave: "ANEXO_III",
    nombre: "Anexo III",
    legacy: false,
    ambito: "reserva",
    stage: "reserva",
    kind: "upload",
    generated: true,
    contractFamily: "beca",
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    signers: ["EMPRESA", "GESTOR", "ALUMNO"],
    actor: { EMPRESA: "upload", GESTOR: "review", ALUMNO: "view" },
  },
  {
    clave: "CALENDARIO",
    nombre: "Calendario",
    legacy: false,
    ambito: "reserva",
    stage: "reserva",
    kind: "signature",
    generated: false,
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
    generated: false,
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
    generated: false,
    requiresReview: true,
    requeridoParaValidarAlumno: false,
    replaceIfValidated: false,
    workflowOnUpload: "SUBIDO",
    actor: { ALUMNO: "hidden", GESTOR: "hidden", EMPRESA: "hidden" },
  },
];

const BY_CLAVE = Object.fromEntries(CATALOGUE.map((d) => [d.clave, d]));

const CONTEXTO_LABEL = {
  solicitud_alumno: "Solicitud alumno",
  solicitud_empresa: "Solicitud empresa",
  reserva: "Reserva",
};

function staffRole(rol) {
  return rol === "ADMINISTRADOR" || rol === "COORDINADOR" ? "GESTOR" : rol;
}

function mapActor(code) {
  if (code === "GESTOR" || code === "ADMINISTRADOR" || code === "COORDINADOR" || code === "CENTRO") {
    return "CENTRO";
  }
  if (code === "EMPRESA" || code === "ALUMNO") return code;
  return null;
}

function actorLabel(code) {
  return ACTOR_LABEL[mapActor(code)] || code || "";
}

function actorPhrase(code) {
  const actor = mapActor(code);
  if (actor === "CENTRO") return "del centro";
  if (actor === "EMPRESA") return "de la empresa";
  if (actor === "ALUMNO") return "del alumno";
  return "";
}

function defByClave(clave) {
  return BY_CLAVE[String(clave || "").toUpperCase()] || null;
}

function activeDefs() {
  return CATALOGUE.filter((d) => !d.legacy);
}

function generatedDefs() {
  return activeDefs().filter((d) => d.generated);
}

function requiredForStudentValidation() {
  return activeDefs().filter((d) => d.requeridoParaValidarAlumno);
}

function primaryUploader(def) {
  const upload = Object.entries(def.actor || {}).find(([, mode]) => mode === "upload");
  if (upload) return mapActor(upload[0]);
  if ((def.uploadRoles || []).includes("EMPRESA")) return "EMPRESA";
  if ((def.uploadRoles || []).includes("ALUMNO")) return "ALUMNO";
  if (def.generated) return "CENTRO";
  return "CENTRO";
}

function hasFile(row) {
  return Boolean(row?.tiene_archivo || (row?.id_documento && row?.archivo));
}

function signatureApplies(def, row, firmas) {
  if (!def.signers?.length || !hasFile(row)) return false;
  if (def.kind === "signature") return true;
  if (firmas?.length) return true;
  return row?.origen_documento === "GENERADO";
}

function firmaListFor(def, row, firmas) {
  if (!signatureApplies(def, row, firmas)) return [];
  return def.signers.map((signRol) => {
    const found = (firmas || []).find((f) => f.rol === signRol);
    const estado = found?.estado === "FIRMADO" ? "FIRMADO" : "SIN_FIRMAR";
    return {
      rol: signRol,
      rol_label: actorLabel(signRol),
      estado,
      estado_label: estado === "FIRMADO" ? "Firmado" : "Sin firmar",
    };
  });
}

function deriveDocumentState(def, row, firmas = [], { templateAvailable = false } = {}) {
  const file = hasFile(row);
  const review = def.requiresReview && row?.id_documento ? row.estado_validacion || "PENDIENTE" : null;
  const firmasView = firmaListFor(def, row, firmas);
  const pendingSigners = firmasView
    .filter((f) => f.estado !== "FIRMADO")
    .map((f) => mapActor(f.rol))
    .filter(Boolean);

  let estado;
  if (!file) {
    estado = def.generated ? "PENDIENTE_GENERACION" : "PENDIENTE_SUBIDA";
  } else if (review === "VALIDADO") {
    estado = "VALIDADO";
  } else if (review === "RECHAZADO") {
    estado = "RECHAZADO";
  } else if (pendingSigners.length) {
    estado = "PENDIENTE_FIRMA";
  } else if (def.requiresReview) {
    estado = "PENDIENTE_VALIDACION";
  } else {
    estado = "COMPLETO";
  }

  const faltaPlantilla = estado === "PENDIENTE_GENERACION" && !templateAvailable;
  const actors = [];
  let accion = null;
  const nombre = def.nombre;

  if (estado === "PENDIENTE_GENERACION") {
    actors.push("CENTRO");
    accion = faltaPlantilla
      ? `Pendiente del centro: generar ${nombre}. No hay plantilla activa.`
      : `Pendiente del centro: generar ${nombre}`;
  } else if (estado === "PENDIENTE_SUBIDA" || estado === "RECHAZADO") {
    const who = primaryUploader(def);
    actors.push(who);
    const verbo = estado === "RECHAZADO" ? "sustituir" : "subir";
    accion = `Pendiente ${actorPhrase(who)}: ${verbo} ${nombre}`;
  } else if (estado === "PENDIENTE_VALIDACION") {
    actors.push("CENTRO");
    accion = `Pendiente del centro: validar ${nombre}`;
  } else if (estado === "PENDIENTE_FIRMA") {
    const unique = [...new Set(pendingSigners)];
    unique.forEach((actor) => actors.push(actor));
    accion = unique.map((actor) => `Pendiente ${actorPhrase(actor)}: firmar ${nombre}`).join(" · ");
  }

  const responsable = def.generated ? "CENTRO" : primaryUploader(def);

  return {
    estado_operativo: estado,
    estado_operativo_label: OPERATIONAL_LABEL[estado] || estado,
    accion_pendiente: accion,
    accion_pendiente_de: actors,
    falta_plantilla: faltaPlantilla,
    firmas: firmasView,
    estado_validacion: review,
    responsable,
    responsable_label: actorLabel(responsable),
  };
}

// Contract-type flow -> Anexo II. Beca flow -> Anexo III. Unknown -> neither.
function anexoClaveForContrato(nombre) {
  const value = String(nombre || "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("beca")) return "ANEXO_III";
  return "ANEXO_II";
}

function appliesToContrato(def, nombreContrato) {
  if (!def?.contractFamily) return true;
  return anexoClaveForContrato(nombreContrato) === def.clave;
}

function workflowLabel(code) {
  return WORKFLOW_LABEL[code] || OPERATIONAL_LABEL[code] || code || "";
}

function reviewLabel(code) {
  return code ? REVIEW_LABEL[code] || code : null;
}

module.exports = {
  OPERATIONAL_LABEL,
  WORKFLOW_LABEL,
  REVIEW_LABEL,
  SIGN_ROLES,
  ACTOR_LABEL,
  CONTEXTO_LABEL,
  CATALOGUE,
  staffRole,
  mapActor,
  actorLabel,
  defByClave,
  activeDefs,
  generatedDefs,
  requiredForStudentValidation,
  anexoClaveForContrato,
  appliesToContrato,
  workflowLabel,
  reviewLabel,
  deriveDocumentState,
  hasFile,
  primaryUploader,
};
