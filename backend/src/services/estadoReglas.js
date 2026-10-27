// Phase 2 state rules as pure functions (no database), shared by the services
// and the tests. Each returns null when the transition is allowed, or
// { status, error, code } describing why not. The tables in
// docs/STATE_TRANSITIONS.md describe the same rules.
const { anexoClaveForContrato, pendingSignatures, actorLabel } = require("./documentCatalogue");

function deny(status, code, error) {
  return { status, code, error };
}

function joinRoles(roles) {
  return roles.map((r) => actorLabel(r).toLowerCase()).join(", ");
}

// doc: { es_actual, tiene_archivo, estado_validacion, estado_reserva, firmas_exentas_legacy }
function documentoValidable(def, doc, firmas) {
  if (!doc) return deny(404, "NO_ENCONTRADO", "Documento no encontrado.");
  if (!def || def.legacy) return deny(400, "TIPO_NO_VALIDABLE", "Este tipo de documento ya no se revisa.");
  if (!def.requiresReview) return deny(400, "SIN_REVISION", `${def.nombre} no necesita validación.`);
  if (!Number(doc.es_actual)) {
    return deny(409, "VERSION_ANTERIOR", "Este documento es una versión anterior y no se puede validar.");
  }
  if (!Number(doc.tiene_archivo)) return deny(400, "SIN_ARCHIVO", "No hay archivo que validar.");
  if (doc.estado_reserva === "CANCELADA") {
    return deny(400, "RESERVA_CANCELADA", "No se valida documentación de una reserva cancelada.");
  }
  if (doc.estado_validacion === "VALIDADO") return deny(409, "YA_VALIDADO", "El documento ya está validado.");
  if (doc.estado_validacion === "RECHAZADO") {
    return deny(400, "RECHAZADO", "Un documento rechazado se valida cuando se sustituye por uno nuevo.");
  }
  const pendientes = pendingSignatures(def, { ...doc, id_documento: doc.id_documento || 1 }, firmas);
  if (pendientes.length) {
    return deny(400, "FIRMAS_PENDIENTES", `Faltan firmas antes de validar: ${joinRoles(pendientes)}.`);
  }
  return null;
}

function documentoRechazable(def, doc) {
  if (!doc) return deny(404, "NO_ENCONTRADO", "Documento no encontrado.");
  if (!Number(doc.es_actual)) {
    return deny(409, "VERSION_ANTERIOR", "Este documento es una versión anterior y no se puede rechazar.");
  }
  if (!Number(doc.tiene_archivo)) return deny(400, "SIN_ARCHIVO", "No hay archivo que rechazar.");
  if (doc.estado_reserva === "CANCELADA") {
    return deny(400, "RESERVA_CANCELADA", "No se revisa documentación de una reserva cancelada.");
  }
  if (doc.estado_validacion === "RECHAZADO") return deny(409, "YA_RECHAZADO", "El documento ya está rechazado.");
  return null;
}

function documentoFirmable(def, doc, rolFirma) {
  if (!doc || !Number(doc.tiene_archivo)) return deny(404, "SIN_ARCHIVO", "No hay un documento que firmar.");
  if (!def?.signers?.length) return deny(400, "SIN_FIRMA", "Este documento no requiere firma.");
  if (!def.signers.includes(rolFirma)) return deny(403, "ROL_NO_FIRMA", "Tu rol no firma este documento.");
  if (!Number(doc.es_actual)) return deny(409, "VERSION_ANTERIOR", "Solo se firma la versión actual del documento.");
  if (doc.estado_reserva === "CANCELADA") return deny(400, "RESERVA_CANCELADA", "La reserva está cancelada.");
  if (doc.estado_validacion === "RECHAZADO") {
    return deny(400, "RECHAZADO", "El documento fue rechazado: hay que sustituirlo antes de firmar.");
  }
  return null;
}

// D2. reserva: { estado, tipo_contrato }. anexos: current annex rows of the
// reservation [{ clave, tiene_archivo, estado_validacion }].
function tipoContratoCambiable(reserva, nuevoTipoNombre, anexos) {
  if (!reserva) return deny(404, "NO_ENCONTRADA", "Reserva no encontrada.");
  if (reserva.estado === "CANCELADA") {
    return deny(400, "RESERVA_CANCELADA", "No se puede asignar contrato a una reserva cancelada.");
  }
  if (reserva.estado === "CONFIRMADA") {
    return deny(400, "RESERVA_CONFIRMADA", "El tipo de contrato de una reserva confirmada no se puede cambiar.");
  }
  const actual = anexoClaveForContrato(reserva.tipo_contrato);
  const nuevo = anexoClaveForContrato(nuevoTipoNombre);
  if (!actual || actual === nuevo) return null;
  // Changing family: allowed only while no file of the current annex is under
  // review or validated. A rejected file goes to history (see retiredOnChange).
  const bloqueante = (anexos || []).find(
    (a) => a.clave === actual && Number(a.tiene_archivo) && a.estado_validacion !== "RECHAZADO",
  );
  if (bloqueante) {
    return deny(409, "ANEXO_EXISTENTE",
      `Ya hay un ${actual === "ANEXO_III" ? "Anexo III" : "Anexo II"} subido para esta reserva. ` +
      "Para cambiar el tipo de contrato hay que rechazar antes ese documento.");
  }
  return null;
}

// reserva: { estado, tipo_contrato, id_tipo_contrato }; anexo: current row of
// the matching annex or null; firmas: its signature rows.
function reservaConfirmable(reserva, idTipoPedido, def, anexo, firmas) {
  if (!reserva) return deny(404, "NO_ENCONTRADA", "Reserva no encontrada.");
  if (reserva.estado !== "PENDIENTE") return deny(400, "NO_PENDIENTE", "Solo una reserva PENDIENTE puede confirmarse.");
  if (!reserva.id_tipo_contrato) {
    return deny(400, "SIN_TIPO_CONTRATO", "Indica el tipo de contrato de la reserva antes de confirmarla.");
  }
  if (idTipoPedido && Number(idTipoPedido) !== Number(reserva.id_tipo_contrato)) {
    return deny(400, "TIPO_DISTINTO", "El tipo de contrato no coincide con el registrado en la reserva.");
  }
  const nombre = def?.nombre || "anexo";
  if (!anexo || !Number(anexo.tiene_archivo)) {
    return deny(400, "ANEXO_FALTA", `Para confirmar falta el ${nombre}.`);
  }
  const pendientes = pendingSignatures(def, { ...anexo, id_documento: anexo.id_documento || 1 }, firmas);
  if (pendientes.length) {
    return deny(400, "FIRMAS_PENDIENTES", `Para confirmar faltan firmas del ${nombre}: ${joinRoles(pendientes)}.`);
  }
  if (anexo.estado_validacion !== "VALIDADO") {
    return deny(400, "ANEXO_SIN_VALIDAR", `Para confirmar, el ${nombre} debe estar validado.`);
  }
  return null;
}

// Applications (student and company): PENDIENTE → VALIDADO | RECHAZADO;
// RECHAZADO → PENDIENTE (reopen, D7, active convocatoria only).
function solicitudTransicion(estadoActual, accion, { convocatoriaActiva = true } = {}) {
  if (!estadoActual) return deny(404, "NO_ENCONTRADA", "Solicitud no encontrada.");
  if (accion === "VALIDAR" || accion === "RECHAZAR") {
    if (estadoActual !== "PENDIENTE") {
      const verbo = accion === "VALIDAR" ? "validar" : "rechazar";
      return deny(400, "ESTADO_NO_PERMITE",
        `Solo se puede ${verbo} una solicitud pendiente (estado actual: ${estadoActual.toLowerCase()}).`);
    }
    return null;
  }
  if (accion === "REABRIR") {
    if (estadoActual !== "RECHAZADO") {
      return deny(400, "ESTADO_NO_PERMITE", "Solo se puede reabrir una solicitud rechazada.");
    }
    if (!convocatoriaActiva) {
      return deny(400, "CONVOCATORIA_CERRADA", "Solo se pueden reabrir solicitudes de la convocatoria activa.");
    }
    return null;
  }
  return deny(400, "ACCION_DESCONOCIDA", "Acción no válida.");
}

// «Dar de baja» (Administración only, checked by the route): any state except
// BAJA → BAJA, with a reason. «Reactivar»: BAJA → the state it had before.
function bajaTransicion(estadoActual, accion, { motivo = "" } = {}) {
  if (!estadoActual) return deny(404, "NO_ENCONTRADA", "Solicitud no encontrada.");
  if (accion === "BAJA") {
    if (estadoActual === "BAJA") return deny(409, "YA_DE_BAJA", "La solicitud ya está dada de baja.");
    if (!String(motivo || "").trim()) return deny(400, "MOTIVO_OBLIGATORIO", "Indica el motivo de la baja.");
    return null;
  }
  if (accion === "REACTIVAR") {
    if (estadoActual !== "BAJA") return deny(400, "ESTADO_NO_PERMITE", "Solo se puede reactivar una solicitud dada de baja.");
    return null;
  }
  return deny(400, "ACCION_DESCONOCIDA", "Acción no válida.");
}

module.exports = {
  bajaTransicion,
  documentoValidable,
  documentoRechazable,
  documentoFirmable,
  tipoContratoCambiable,
  reservaConfirmable,
  solicitudTransicion,
};
