const mammoth = require("mammoth");
const puppeteer = require("puppeteer");
const { createReport } = require("docx-templates");
const pool = require("../db/pool");
const { defByClave } = require("./documentCatalogue");
const { generationConfig } = require("./documentGenerationConfig");
const { saveByClave } = require("./documentosStore");
const workflow = require("./documentosWorkflow");

async function loadActiveTemplate(clave) {
  const [rows] = await pool.query(
    `SELECT p.id_plantilla, p.archivo, p.nombre_archivo, p.version, p.mime_type, td.nombre AS clave
       FROM dual_documento_plantillas p
       JOIN dual_tipos_documento td ON td.id_tipo_documento = p.id_tipo_documento
      WHERE td.nombre = ? AND p.es_activa = 1
      LIMIT 1`,
    [clave],
  );
  return rows[0] || null;
}

async function docxBufferToPdf(docxBuffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer: docxBuffer });
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4",
      margin: { top: "2cm", bottom: "2cm", left: "2cm", right: "2cm" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

async function currentDocument(clave, parents) {
  const idTipo = await workflow.tipoIdByNombre(clave);
  if (!idTipo) return null;
  const parentSql = parents.id_solicitud_empresa
    ? "d.id_solicitud_empresa = ?"
    : parents.id_reserva
      ? "d.id_reserva = ?"
      : "d.id_solicitud_alumno = ?";
  const parentId = parents.id_solicitud_empresa || parents.id_reserva || parents.id_solicitud_alumno;
  const [rows] = await pool.query(
    `SELECT d.id_documento, ev.nombre AS estado_validacion,
            CASE WHEN d.archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo,
            (SELECT COUNT(*) FROM dual_documento_firmas f
              WHERE f.id_documento = d.id_documento AND f.estado = 'FIRMADO') AS firmas_hechas
       FROM dual_documentos d
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE ${parentSql} AND d.id_tipo_documento = ? AND d.es_actual = 1
      ORDER BY d.id_documento DESC
      LIMIT 1`,
    [parentId, idTipo],
  );
  return rows[0] || null;
}

async function generateDocument({ clave, parents, userId = null, regenerar = false }) {
  const def = defByClave(clave);
  const config = generationConfig(clave);
  if (!def?.generated || !config) {
    const err = new Error("Este documento no se genera desde plantilla.");
    err.status = 400;
    throw err;
  }

  const template = await loadActiveTemplate(clave);
  if (!template) {
    return { ok: false, code: "SIN_PLANTILLA", clave };
  }

  const existing = await currentDocument(clave, parents);
  if (existing?.tiene_archivo && !regenerar) {
    const err = new Error("El documento ya existe. La regeneración tiene que pedirse de forma explícita.");
    err.status = 409;
    throw err;
  }
  if (existing?.tiene_archivo && existing.estado_validacion === "VALIDADO" && !def.replaceIfValidated) {
    const err = new Error("Un documento validado no se puede regenerar.");
    err.status = 400;
    throw err;
  }

  const data = await config.loadData(parents);
  const filled = await createReport({
    template: template.archivo,
    data,
    cmdDelimiter: ["<<", ">>"],
  });
  const pdf = await docxBufferToPdf(Buffer.from(filled));
  const idDocumento = await saveByClave(clave, parents, pdf, {
    origen: "GENERADO",
    idUsuario: userId,
    idPlantilla: template.id_plantilla,
  });

  return {
    ok: true,
    clave,
    id_documento: idDocumento,
    id_plantilla: template.id_plantilla,
    plantilla_version: template.version,
    plantilla_nombre: template.nombre_archivo,
    pdf,
    email: data.emailCoordinador || null,
    empresa: data.razonSocial || data.empresa || null,
    convocatoria: data.convocatoria || null,
  };
}

module.exports = {
  loadActiveTemplate,
  generateDocument,
  docxBufferToPdf,
};
