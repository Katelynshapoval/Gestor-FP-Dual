// Email templates stored in the database (migrations 022 and 023).
//
// The code owns only the CONTRATO: which emails it can send, which values it
// supplies to each and which generated documents it can attach (DOCUMENTOS).
// Subject, body, labels, examples, the «lleva adjuntos» switch and the
// attachments of each email live in dual_correo_plantillas /
// dual_correo_variables / dual_correo_adjuntos and are edited by the
// administrators (correosService).
const pool = require('../db/pool');
const plantilla = require('../mail/plantilla');
const { defByClave } = require('./documentCatalogue');

const PIE = 'pie';

// clave → variables the code supplies when it sends that email.
const ALUMNO_SOL = ['alumno', 'convocatoria', 'enlace_portal'];
const EMPRESA_SOL = ['coordinador', 'empresa', 'convocatoria', 'enlace_portal'];
const RESERVA = ['alumno', 'coordinador', 'empresa', 'ciclo', 'convocatoria', 'enlace_portal'];
const CONTRATO = {
  solicitud_alumno_recibida: ALUMNO_SOL,
  solicitud_alumno_validada: [...ALUMNO_SOL, 'ciclo'],
  solicitud_alumno_rechazada: [...ALUMNO_SOL, 'ciclo', 'motivo'],
  ciclo_corregido: [...ALUMNO_SOL, 'ciclo'],
  cambio_datos_aprobado: ALUMNO_SOL,
  cambio_datos_rechazado: [...ALUMNO_SOL, 'motivo'],
  solicitud_empresa_recibida: [...EMPRESA_SOL, 'convenio_adjunto', 'convenio_generado'],
  convenio_disponible: [...EMPRESA_SOL, 'convenio_adjunto'],
  solicitud_empresa_validada: EMPRESA_SOL,
  solicitud_empresa_rechazada: [...EMPRESA_SOL, 'motivo'],
  documento_rechazado_alumno: [...ALUMNO_SOL, 'documento', 'motivo'],
  documento_rechazado_empresa: [...EMPRESA_SOL, 'documento', 'motivo'],
  documento_rechazado_reserva: [...RESERVA, 'documento', 'motivo'],
  reserva_creada_alumno: RESERVA,
  reserva_creada_empresa: RESERVA,
  reserva_cancelada_alumno: RESERVA,
  reserva_cancelada_empresa: RESERVA,
  reserva_confirmada_alumno: RESERVA,
  reserva_confirmada_empresa: RESERVA,
  cupo_reducido_empresa: ['empresa', 'ciclo', 'plazas_antes', 'plazas_despues', 'reservas_canceladas'],
  restablecer_contrasena: ['nombre', 'enlace'],
  [PIE]: [],
};

// clave → generated documents (dual_tipos_documento.nombre) the code can hand
// over when it sends that email. An administrator can attach only these as
// DOCUMENTO; fixed PDFs (ARCHIVO) can go on any email except the footer. For
// each document the email receives `<documento>_adjunto` («sí» when it went).
const DOCUMENTOS = {
  solicitud_empresa_recibida: ['CONVENIO'],
  convenio_disponible: ['CONVENIO'],
};

// Fixed PDFs uploaded by administrators.
const MAX_ARCHIVO = 5 * 1024 * 1024;
const MAX_ARCHIVOS = 5;

const variableDocumento = (documento) => `${String(documento).toLowerCase()}_adjunto`;
const nombreDocumento = (documento) => defByClave(documento)?.nombre || documento;

class PlantillaError extends Error {}

async function cargar(clave, conn = pool) {
  const [filas] = await conn.query(
    `SELECT clave, asunto, cuerpo, activa, lleva_adjuntos
       FROM dual_correo_plantillas
      WHERE clave IN (?, ?)`,
    [clave, PIE],
  );
  const [variables] = await conn.query(
    `SELECT variable, tipo, etiqueta, obligatoria, ejemplo
       FROM dual_correo_variables
      WHERE clave_plantilla = ?
      ORDER BY orden`,
    [clave],
  );
  return {
    fila: filas.find((f) => f.clave === clave) || null,
    pie: filas.find((f) => f.clave === PIE) || null,
    variables,
  };
}

// Attachments of an email; `conArchivo` also reads the stored PDFs.
async function cargarAdjuntos(clave, conn = pool, { conArchivo = false } = {}) {
  const [filas] = await conn.query(
    `SELECT a.id_adjunto, a.tipo, td.nombre AS documento, a.nombre_archivo, a.mime_type, a.tamano,
            a.creado_en, u.nombre_mostrar AS subido_por${conArchivo ? ', a.archivo' : ''}
       FROM dual_correo_adjuntos a
       LEFT JOIN dual_tipos_documento td ON td.id_tipo_documento = a.id_tipo_documento
       LEFT JOIN dual_usuarios u ON u.id_usuario = a.id_usuario_subida
      WHERE a.clave_plantilla = ?
      ORDER BY a.orden, a.id_adjunto`,
    [clave],
  );
  return filas;
}

// Name shown to administrators and written in the history.
function nombreAdjunto(a) {
  return a.tipo === 'DOCUMENTO' ? nombreDocumento(a.documento) : a.nombre_archivo;
}

function resumenAdjuntos(adjuntos) {
  const texto = adjuntos.map(nombreAdjunto).join(', ');
  return texto ? texto.slice(0, 1000) : null;
}

// Renders a footer; a broken footer is left out rather than stopping the email.
function renderPie(pie) {
  if (!pie || !String(pie.cuerpo || '').trim()) return '';
  if (plantilla.validar(pie, []).length) {
    console.error('[correo] el pie de los correos no es válido: se envía sin pie.');
    return '';
  }
  return plantilla.renderCuerpo(pie.cuerpo, {}, []);
}

// The attachments an email really carries, as nodemailer attachments.
// documentos: what the caller generated for this request,
//   { CONVENIO: { filename, content } }. A configured document the caller does
//   not have (not generated yet, generation failed) is left out and logged;
//   the email still goes, with `<documento>_adjunto` empty.
function resolverAdjuntos(clave, llevaAdjuntos, adjuntos, documentos = {}) {
  const attachments = [];
  const adjuntados = new Set();
  if (!llevaAdjuntos) return { attachments, adjuntados };
  for (const a of adjuntos) {
    if (a.tipo === 'ARCHIVO') {
      attachments.push({ filename: a.nombre_archivo, content: a.archivo, contentType: a.mime_type || 'application/pdf' });
      continue;
    }
    if (!(DOCUMENTOS[clave] || []).includes(a.documento)) {
      console.warn(`[correo] ${clave}: la aplicación no genera «${a.documento}» para este correo; no se adjunta.`);
      continue;
    }
    const doc = documentos[a.documento];
    if (!doc?.content) {
      console.warn(`[correo] ${clave}: «${a.documento}» no está disponible para esta solicitud; se envía sin él.`);
      continue;
    }
    attachments.push({ filename: doc.filename, content: doc.content, contentType: 'application/pdf' });
    adjuntados.add(a.documento);
  }
  return { attachments, adjuntados };
}

// `<documento>_adjunto` for every document this email may carry.
function valoresDocumentos(clave, adjuntados) {
  return Object.fromEntries((DOCUMENTOS[clave] || []).map((d) => [variableDocumento(d), adjuntados.has(d) ? 'sí' : '']));
}

// Builds { asunto, html, attachments } for an email, or null when the
// administrators switched it off. Throws PlantillaError when the template is
// missing or invalid: nothing is sent, the caller logs it.
async function componer(clave, valores = {}, documentos = {}) {
  if (!CONTRATO[clave]) throw new PlantillaError(`Correo desconocido: ${clave}`);
  const { fila, pie, variables } = await cargar(clave);
  if (!fila) throw new PlantillaError(`Falta la plantilla de correo «${clave}» en la base de datos (migración 022).`);
  if (Number(fila.activa) !== 1) return null;
  const errores = plantilla.validar(fila, variables);
  if (errores.length) throw new PlantillaError(`La plantilla «${clave}» no es válida: ${errores.join(' ')}`);
  const llevaAdjuntos = Number(fila.lleva_adjuntos) === 1;
  const adjuntos = llevaAdjuntos ? await cargarAdjuntos(clave, pool, { conArchivo: true }) : [];
  const { attachments, adjuntados } = resolverAdjuntos(clave, llevaAdjuntos, adjuntos, documentos);
  const todos = { ...valores, ...valoresDocumentos(clave, adjuntados) };
  return {
    asunto: plantilla.renderAsunto(fila.asunto, todos, variables),
    html: plantilla.envolver(plantilla.renderCuerpo(fila.cuerpo, todos, variables), renderPie(pie)),
    attachments,
  };
}

// Renders an unsaved draft with the example values (preview and test email).
// llevaAdjuntos: the draft's switch (null = the saved one). The documents count
// as attached when it is on and the email has them, as a real send would do.
async function componerBorrador(clave, { asunto, cuerpo, llevaAdjuntos = null }, conn = pool) {
  const { fila, pie, variables } = await cargar(clave, conn);
  if (!fila) return null;
  const errores = plantilla.validar({ asunto, cuerpo }, variables);
  if (errores.length) return { errores };
  const esPie = clave === PIE;
  const lleva = !esPie && (llevaAdjuntos === null ? Number(fila.lleva_adjuntos) === 1 : Boolean(llevaAdjuntos));
  const adjuntos = lleva ? await cargarAdjuntos(clave, conn) : [];
  const configurados = new Set(adjuntos.filter((a) => a.tipo === 'DOCUMENTO').map((a) => a.documento));
  const valores = { ...plantilla.ejemplos(variables), ...valoresDocumentos(clave, configurados) };
  const cuerpoHtml = plantilla.renderCuerpo(cuerpo, valores, variables);
  return {
    errores: [],
    asunto: plantilla.renderAsunto(asunto, valores, variables),
    html: esPie
      ? plantilla.envolver('<p style="margin:0 0 14px;color:#87877a">(Texto del correo)</p>', cuerpoHtml)
      : plantilla.envolver(cuerpoHtml, renderPie(pie)),
    adjuntos: adjuntos.map((a) => ({ id: a.id_adjunto, tipo: a.tipo, nombre: nombreAdjunto(a) })),
  };
}

// Problems an administrator must fix, for one template (stored text and the
// variables of the database compared with what the code supplies).
function problemas(clave, fila, variables) {
  const out = [];
  const contrato = CONTRATO[clave];
  if (!contrato) return out;
  const extra = variables.filter((v) => !contrato.includes(v.variable)).map((v) => v.variable);
  if (extra.length) out.push(`La aplicación no envía estas variables: ${extra.join(', ')}.`);
  out.push(...plantilla.validar(fila, variables));
  return out;
}

// Warnings about the attachments of an email. They never stop it: the email
// goes without the attachment that cannot be sent.
function avisosAdjuntos(clave, llevaAdjuntos, adjuntos) {
  const out = [];
  const permitidos = DOCUMENTOS[clave] || [];
  for (const a of adjuntos) {
    if (a.tipo === 'DOCUMENTO' && !permitidos.includes(a.documento)) {
      out.push(`«${nombreDocumento(a.documento)}» no se puede adjuntar a este correo: la aplicación no lo genera para él. No se adjuntará.`);
    }
  }
  if (llevaAdjuntos && !adjuntos.length) out.push('«Lleva adjuntos» está activado, pero el correo no tiene ningún adjunto.');
  if (!llevaAdjuntos && adjuntos.length) out.push('El correo tiene adjuntos, pero «Lleva adjuntos» está desactivado: se envía sin ellos.');
  return out;
}

// Startup check: every email the code can send has a valid template.
async function verificar() {
  try {
    const [filas] = await pool.query('SELECT clave, asunto, cuerpo FROM dual_correo_plantillas');
    const [vars] = await pool.query('SELECT clave_plantilla, variable, tipo, etiqueta, obligatoria FROM dual_correo_variables');
    const avisos = [];
    for (const clave of Object.keys(CONTRATO)) {
      const fila = filas.find((f) => f.clave === clave);
      if (!fila) {
        avisos.push(`falta «${clave}»`);
        continue;
      }
      const p = problemas(clave, fila, vars.filter((v) => v.clave_plantilla === clave));
      if (p.length) avisos.push(`«${clave}»: ${p.join(' ')}`);
    }
    if (avisos.length) console.error(`[correo] plantillas con problemas (no se enviarán): ${avisos.join(' | ')}`);
    else console.log(`[correo] ${Object.keys(CONTRATO).length} plantillas de correo correctas.`);
    return avisos;
  } catch (err) {
    console.error('[correo] no se pudieron comprobar las plantillas de correo:', err.code || err.message);
    return [err.message];
  }
}

module.exports = {
  CONTRATO,
  DOCUMENTOS,
  PIE,
  MAX_ARCHIVO,
  MAX_ARCHIVOS,
  PlantillaError,
  cargar,
  cargarAdjuntos,
  nombreAdjunto,
  nombreDocumento,
  resumenAdjuntos,
  resolverAdjuntos,
  componer,
  componerBorrador,
  problemas,
  avisosAdjuntos,
  verificar,
};
