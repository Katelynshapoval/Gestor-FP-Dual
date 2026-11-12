// One convenio per company (migration 026, docs/PLAN_DOCUMENTOS_DINAMICOS.md part B).
//
// A company signs its convenio once. A new application asking for the SAME
// ciclos gets a copy of the company's validated convenio (origen HEREDADO,
// pointing to the original) and nobody signs again. The convenio changes only
// through a RENEWAL (dual_convenio_renovaciones):
//   CICLOS  the requested ciclos changed: a new application with other ciclos
//           or a ciclo added during the year;
//   MANUAL  the centre replaces it («Sustituir convenio») with a reason.
// A renewal retires the current convenio to history, a new one is generated
// (when a template exists), the company is asked to sign it and every
// administrator is told what to do. The company stays validated meanwhile.
// Validating the new convenio closes the renewal (documentosService.validar).
//
// The functions taking `conn` run inside the caller's transaction; the ones
// that generate or send run after the commit.
const pool = require("../db/pool");
const { recordEvent } = require("./auditLog");
const notificar = require("./notificaciones");

const MAX_TEXTO = 500;
const corta = (texto) => (String(texto).length > MAX_TEXTO ? `${String(texto).slice(0, MAX_TEXTO - 1)}…` : String(texto));

// Ciclos requested by one company application, by name.
async function ciclosDe(conn, idSolicitud) {
  const [rows] = await conn.query(
    `SELECT esp.id_especialidad AS id, esp.nombre
       FROM dual_solicitud_empresa_especialidades ee
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
      WHERE ee.id_solicitud_empresa = ?
      ORDER BY esp.nombre`,
    [idSolicitud],
  );
  return rows.map((r) => ({ id: Number(r.id), nombre: r.nombre }));
}

const nombres = (ciclos) => ciclos.map((c) => c.nombre).join(", ");

function mismosCiclos(a, b) {
  const ids = (x) => x.map((c) => c.id).sort((m, n) => m - n).join(",");
  return ids(a) === ids(b);
}

// «se añade X; ya no se pide Y», for the reason of a renewal.
function cambioDeCiclos(antes, ahora) {
  const antesIds = new Set(antes.map((c) => c.id));
  const ahoraIds = new Set(ahora.map((c) => c.id));
  const nuevos = ahora.filter((c) => !antesIds.has(c.id));
  const quitados = antes.filter((c) => !ahoraIds.has(c.id));
  const partes = [];
  if (nuevos.length) partes.push(`${nuevos.length === 1 ? "se añade el ciclo" : "se añaden los ciclos"} ${nombres(nuevos)}`);
  if (quitados.length) partes.push(`${quitados.length === 1 ? "ya no se pide el ciclo" : "ya no se piden los ciclos"} ${nombres(quitados)}`);
  return partes.join("; ") || "han cambiado los ciclos solicitados";
}

// The current convenio of an application (with or without a file), locked when asked.
async function convenioActual(conn, idSolicitud, { lock = false } = {}) {
  const [rows] = await conn.query(
    `SELECT d.id_documento, d.origen_documento, d.id_documento_origen, ev.nombre AS estado_validacion,
            CASE WHEN d.archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_solicitud_empresa = ? AND td.nombre = 'CONVENIO' AND d.es_actual = 1
      ORDER BY d.id_documento DESC
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [idSolicitud],
  );
  return rows[0] || null;
}

// The company's convenio in force: the latest VALIDATED current convenio of
// another of its applications that has no renewal open, with that
// application's ciclos (what the convenio covers) and convocatoria.
async function convenioVigente(conn, idEmpresa, { excluirSolicitud = 0 } = {}) {
  const [rows] = await conn.query(
    `SELECT d.id_documento, d.id_documento_origen, se.id_solicitud_empresa, c.nombre AS convocatoria
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = d.id_solicitud_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ? AND se.id_solicitud_empresa <> ?
        AND td.nombre = 'CONVENIO' AND d.es_actual = 1 AND d.archivo IS NOT NULL AND ev.nombre = 'VALIDADO'
        AND NOT EXISTS (SELECT 1 FROM dual_convenio_renovaciones r WHERE r.abierta_solicitud = se.id_solicitud_empresa)
      ORDER BY c.fecha_inicio DESC, se.id_solicitud_empresa DESC
      LIMIT 1`,
    [idEmpresa, excluirSolicitud],
  );
  if (!rows[0]) return null;
  return { ...rows[0], ciclos: await ciclosDe(conn, rows[0].id_solicitud_empresa) };
}

async function renovacionAbierta(conn, idSolicitud, { lock = false } = {}) {
  const [rows] = await conn.query(
    `SELECT id_renovacion, motivo, detalle, ciclos_antes, ciclos_ahora, id_documento_anterior, id_documento_nuevo, creado_en
       FROM dual_convenio_renovaciones
      WHERE abierta_solicitud = ?${lock ? " FOR UPDATE" : ""}`,
    [idSolicitud],
  );
  return rows[0] || null;
}

// Opens a renewal (or adds to the open one), retiring the current convenio to
// history. Inside the caller's transaction, with the application locked.
async function abrirRenovacion(conn, { idSolicitud, motivo, detalle, ciclosAntes = null, ciclosAhora = null, user = null }) {
  const abierta = await renovacionAbierta(conn, idSolicitud, { lock: true });
  const actual = await convenioActual(conn, idSolicitud, { lock: true });
  if (actual) {
    await conn.query("UPDATE dual_documentos SET es_actual = 0 WHERE id_documento = ?", [actual.id_documento]);
  }
  let idRenovacion;
  if (abierta) {
    // A second change before the first was settled: one renewal, both reasons.
    idRenovacion = abierta.id_renovacion;
    await conn.query(
      `UPDATE dual_convenio_renovaciones
          SET detalle = ?, ciclos_ahora = COALESCE(?, ciclos_ahora), id_documento_nuevo = NULL
        WHERE id_renovacion = ?`,
      [corta(`${abierta.detalle}; ${detalle}`), ciclosAhora, idRenovacion],
    );
  } else {
    const [ins] = await conn.query(
      `INSERT INTO dual_convenio_renovaciones
         (id_solicitud_empresa, motivo, detalle, ciclos_antes, ciclos_ahora, id_documento_anterior, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idSolicitud, motivo, corta(detalle), ciclosAntes ? corta(ciclosAntes) : null, ciclosAhora ? corta(ciclosAhora) : null,
        actual?.id_documento || null, user?.id || null],
    );
    idRenovacion = ins.insertId;
  }
  await recordEvent(conn, {
    entidad: "SOLICITUD_EMPRESA", id: idSolicitud, accion: "RENOVAR_CONVENIO", user,
    motivo: motivo === "MANUAL" ? detalle : null,
    detalle: {
      id_renovacion: idRenovacion, motivo,
      ...(actual ? { convenio_retirado: actual.id_documento } : {}),
      ...(ciclosAhora ? { ciclos_antes: ciclosAntes, ciclos_ahora: ciclosAhora } : {}),
    },
  });
  return { idRenovacion, idDocumentoAnterior: actual?.id_documento || null };
}

// New application (reapply), inside its transaction after its ciclos are
// stored: same ciclos as the convenio in force → inherited copy; different
// ciclos → a CICLOS renewal; no convenio in force → nothing (generated as before).
async function alSolicitarDeNuevo(conn, { idSolicitud, idEmpresa, user = null }) {
  const vigente = await convenioVigente(conn, idEmpresa, { excluirSolicitud: idSolicitud });
  if (!vigente) return { vigente: false, renovacion: null };
  const ahora = await ciclosDe(conn, idSolicitud);

  if (mismosCiclos(vigente.ciclos, ahora)) {
    const origen = vigente.id_documento_origen || vigente.id_documento;
    const [ins] = await conn.query(
      `INSERT INTO dual_documentos
         (id_solicitud_empresa, id_tipo_documento, archivo, id_estado_validacion, estado_workflow, es_actual,
          id_usuario_origen, origen_documento, id_plantilla, id_documento_origen, registrado_en, firmas_exentas_legacy)
       SELECT ?, d.id_tipo_documento, d.archivo, d.id_estado_validacion, d.estado_workflow, 1,
              ?, 'HEREDADO', d.id_plantilla, ?, NOW(), d.firmas_exentas_legacy
         FROM dual_documentos d
        WHERE d.id_documento = ?`,
      [idSolicitud, user?.id || null, origen, vigente.id_documento],
    );
    await conn.query(
      `INSERT INTO dual_documento_firmas (id_documento, rol, estado, firmado_en, firmado_por, metodo)
       SELECT ?, rol, estado, firmado_en, firmado_por, metodo FROM dual_documento_firmas WHERE id_documento = ?`,
      [ins.insertId, vigente.id_documento],
    );
    await recordEvent(conn, {
      entidad: "DOCUMENTO", id: ins.insertId, accion: "HEREDAR", despues: "VALIDADO", user,
      detalle: { clave: "CONVENIO", de_documento: vigente.id_documento, original: origen, convocatoria_origen: vigente.convocatoria },
    });
    return { vigente: true, renovacion: null };
  }

  const ciclosAntes = nombres(vigente.ciclos);
  const ciclosAhora = nombres(ahora);
  const cambio = cambioDeCiclos(vigente.ciclos, ahora);
  await abrirRenovacion(conn, {
    idSolicitud, motivo: "CICLOS", detalle: `Nueva solicitud con otros ciclos: ${cambio}`, ciclosAntes, ciclosAhora, user,
  });
  return {
    vigente: false,
    renovacion: {
      motivoCentro: `la empresa ha presentado una solicitud nueva con otros ciclos (${cambio})`,
      ciclosAntes,
      ciclosAhora,
    },
  };
}

// The steps the administrators receive, depending on what is already done.
function pasosRenovacion({ generado, sinPlantilla }) {
  const firmar = "Esperar a que la empresa firme el convenio nuevo y lo suba (aparece en Documentos como «Pendiente de validar»).";
  const validar = "Revisar y validar el convenio firmado en Documentos o en la tarjeta de la empresa. Al validarlo se cierra la renovación.";
  if (generado) return ["El convenio nuevo ya se ha generado y se ha enviado a la empresa.", firmar, validar];
  if (sinPlantilla) {
    return [
      "Subir la plantilla de Convenio en Documentos › Plantillas (ahora no hay ninguna activa).",
      "Generar el convenio nuevo desde la tarjeta de la empresa o en Documentos.",
      firmar,
      validar,
    ];
  }
  return ["Generar el convenio nuevo desde la tarjeta de la empresa o en Documentos.", firmar, validar];
}

// After the commit: generate the new convenio (when there is a template) and
// tell the company (unless the caller sends its own email) and the administrators.
// `generar` is injected so the caller's module (which owns generateDocument) decides.
async function despuesDeAbrir(idSolicitud, { generar, avisarEmpresa = true, motivoEmpresa, motivoCentro, ciclosAntes = "", ciclosAhora = "" }) {
  let pdf = null;
  let sinPlantilla = false;
  try {
    const result = await generar(idSolicitud);
    if (result?.ok) {
      pdf = result.pdf;
      await pool.query(
        "UPDATE dual_convenio_renovaciones SET id_documento_nuevo = ? WHERE abierta_solicitud = ?",
        [result.id_documento, idSolicitud],
      );
    } else {
      sinPlantilla = result?.code === "SIN_PLANTILLA";
    }
  } catch (err) {
    console.error("[convenio] No se pudo generar el convenio nuevo:", err.message);
  }
  if (avisarEmpresa) notificar.convenioRenovarEmpresa(idSolicitud, { motivo: motivoEmpresa, pdf });
  notificar.convenioRenovarCentro(idSolicitud, {
    motivo: motivoCentro,
    ciclosAntes,
    ciclosAhora,
    pasos: pasosRenovacion({ generado: Boolean(pdf), sinPlantilla }),
  });
  return { pdf, sinPlantilla };
}

// Validating a convenio closes the open renewal of its application.
async function cerrarRenovacion(conn, idSolicitud, idDocumento) {
  const [r] = await conn.query(
    `UPDATE dual_convenio_renovaciones
        SET resuelta_en = NOW(), id_documento_nuevo = ?
      WHERE abierta_solicitud = ?`,
    [idDocumento, idSolicitud],
  );
  return Number(r?.affectedRows || 0) > 0;
}

// Open renewals and convenio origin of several applications, for the lists:
// { [id_solicitud_empresa]: { renovacion, convenio_heredado_de } }.
async function estadoConvenios(ids) {
  if (!ids.length) return {};
  const [ren] = await pool.query(
    `SELECT id_solicitud_empresa, id_renovacion, motivo, detalle, ciclos_antes, ciclos_ahora, creado_en
       FROM dual_convenio_renovaciones
      WHERE abierta_solicitud IN (?)`,
    [ids],
  );
  const [her] = await pool.query(
    `SELECT d.id_solicitud_empresa, c.nombre AS convocatoria
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_documentos o ON o.id_documento = d.id_documento_origen
       JOIN dual_solicitudes_empresa so ON so.id_solicitud_empresa = o.id_solicitud_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = so.id_convocatoria
      WHERE d.id_solicitud_empresa IN (?) AND td.nombre = 'CONVENIO' AND d.es_actual = 1 AND d.origen_documento = 'HEREDADO'`,
    [ids],
  );
  const out = {};
  for (const id of ids) out[id] = { renovacion: null, convenio_heredado_de: null };
  for (const r of ren) {
    out[r.id_solicitud_empresa].renovacion = {
      id_renovacion: r.id_renovacion,
      motivo: r.motivo,
      detalle: r.detalle,
      ciclos_antes: r.ciclos_antes,
      ciclos_ahora: r.ciclos_ahora,
      creado_en: r.creado_en,
    };
  }
  for (const h of her) out[h.id_solicitud_empresa].convenio_heredado_de = h.convocatoria;
  return out;
}

module.exports = {
  ciclosDe,
  nombres,
  mismosCiclos,
  cambioDeCiclos,
  convenioActual,
  convenioVigente,
  renovacionAbierta,
  abrirRenovacion,
  alSolicitarDeNuevo,
  pasosRenovacion,
  despuesDeAbrir,
  cerrarRenovacion,
  estadoConvenios,
};
