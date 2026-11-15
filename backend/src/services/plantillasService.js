const pool = require("../db/pool");
const { generatedDefs, CONTEXTO_LABEL } = require("./documentCatalogue");
const { variablesPorAmbito } = require("./documentGenerationConfig");
const workflow = require("./documentosWorkflow");
const { getActiveConvocatoria } = require("../helpers/dbHelpers");
const conveniosPendientes = require("./conveniosPendientes");
const mammoth = require("mammoth");
const firmaPdf = require("./firmaPdf");

// Signer of the catalogue → its mark in a template.
const MARCA_DE = { EMPRESA: "EMPRESA", GESTOR: "CENTRO", ALUMNO: "ALUMNO" };
const MARCA_LABEL = { EMPRESA: "la empresa", CENTRO: "el centro", ALUMNO: "el alumno" };

// Which signature variables the active template of each type contains.
async function marcasDePlantillasActivas() {
  const [rows] = await pool.query(
    `SELECT td.nombre AS clave, p.archivo AS plantilla
       FROM dual_documento_plantillas p
       JOIN dual_tipos_documento td ON td.id_tipo_documento = p.id_tipo_documento
      WHERE p.es_activa = 1`,
  );
  const out = {};
  for (const row of rows || []) {
    try {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(row.plantilla) });
      out[row.clave] = firmaPdf.marcasEnTexto(value);
    } catch {
      out[row.clave] = null; // unreadable template: no warning rather than a wrong one
    }
  }
  return out;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 10 * 1024 * 1024;
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function isDocx(file) {
  if (!file) return false;
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  const extensionOk = name.endsWith(".docx");
  const mimeOk = mime === DOCX_MIME || mime === "application/octet-stream" || mime === "application/zip";
  // A DOCX is a ZIP archive: the bytes must say so too, not only the client.
  const zipOk = Buffer.isBuffer(file.buffer) && file.buffer.subarray(0, 4).equals(ZIP_SIGNATURE);
  return extensionOk && mimeOk && zipOk;
}

// SEC-012: the client's file name is only shown in lists; strip anything that
// could break a header or the UI (control characters, quotes, path separators).
function nombreSeguro(name) {
  const limpio = String(name || "").replace(/[\u0000-\u001f\u007f"\\/]/g, "").trim().slice(0, 200);
  return limpio || "plantilla.docx";
}

exports.list = async function (req, res) {
  const defs = generatedDefs();
  const [rows] = await pool.query(
    `SELECT p.id_plantilla, p.nombre_archivo, p.mime_type, p.version, p.es_activa, p.creado_en,
            td.nombre AS clave, u.nombre_mostrar AS subida_por, r.nombre AS rol
       FROM dual_documento_plantillas p
       JOIN dual_tipos_documento td ON td.id_tipo_documento = p.id_tipo_documento
       JOIN dual_usuarios u ON u.id_usuario = p.id_usuario_subida
       JOIN dual_roles r ON r.id_rol = u.id_rol
      ORDER BY td.nombre, p.version DESC`,
  );

  const marcas = await marcasDePlantillasActivas();
  const tipos = defs.map((def) => {
    const versions = rows.filter((row) => row.clave === def.clave);
    const activa = versions.find((row) => Number(row.es_activa) === 1) || null;
    const firmantes = (def.signers || []).map((rol) => MARCA_DE[rol]).filter(Boolean);
    const presentes = marcas[def.clave];
    return {
      clave: def.clave,
      nombre: def.nombre,
      ambito: def.ambito,
      ambito_label: CONTEXTO_LABEL[def.ambito] || def.ambito,
      personalizado: Boolean(def.custom),
      variables: variablesPorAmbito(def.ambito),
      // Migration 027: where each signer's image goes. Without its variable the
      // signature goes on a "Hoja de firmas" page at the end.
      variables_firma: firmaPdf.VARIABLES_FIRMA
        .filter(([, marca]) => firmantes.includes(marca) || (marca === "TUTOR" && firmantes.includes("ALUMNO")))
        .map(([nombre, , etiqueta]) => ({ nombre, etiqueta, marcador: `<<${nombre}>>` })),
      firmas_sin_marca: activa && Array.isArray(presentes)
        ? firmantes.filter((marca) => !presentes.includes(marca)).map((marca) => MARCA_LABEL[marca])
        : [],
      activa: activa
        ? {
            id_plantilla: activa.id_plantilla,
            nombre_archivo: activa.nombre_archivo,
            version: activa.version,
            creado_en: activa.creado_en,
            subida_por: activa.subida_por,
            rol: activa.rol,
          }
        : null,
      versiones: versions.map((row) => ({
        id_plantilla: row.id_plantilla,
        nombre_archivo: row.nombre_archivo,
        version: row.version,
        es_activa: Number(row.es_activa) === 1,
        creado_en: row.creado_en,
        subida_por: row.subida_por,
      })),
    };
  });

  // Company applications of the active convocatoria still without a convenio,
  // for the "no template" warning and the catch-up action.
  const convocatoria = await getActiveConvocatoria();
  const convenio = {
    convocatoria: convocatoria?.nombre || null,
    ...(await conveniosPendientes.resumen(convocatoria?.id_convocatoria || null)),
  };

  return res.json({ tipos, convenio });
};

exports.upload = async function (req, res) {
  const clave = String(req.body?.clave || req.params?.clave || "").toUpperCase();
  const def = generatedDefs().find((item) => item.clave === clave);
  const file = req.file;
  if (!def) return res.status(400).json({ error: "Ese tipo de documento no admite plantilla." });
  if (!file) return res.status(400).json({ error: "No se ha subido ninguna plantilla." });
  if (!isDocx(file)) return res.status(400).json({ error: "La plantilla tiene que ser un archivo DOCX." });
  if (file.size > MAX_BYTES) return res.status(400).json({ error: "La plantilla supera el tamaño permitido (10 MB)." });

  const idTipo = await workflow.tipoIdByNombre(clave);
  if (!idTipo) return res.status(400).json({ error: "Tipo de documento no configurado." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [locked] = await conn.query(
      `SELECT COALESCE(MAX(version), 0) AS version
         FROM dual_documento_plantillas
        WHERE id_tipo_documento = ?
        FOR UPDATE`,
      [idTipo],
    );
    const version = Number(locked[0]?.version || 0) + 1;
    await conn.query(
      `UPDATE dual_documento_plantillas SET es_activa = 0 WHERE id_tipo_documento = ? AND es_activa = 1`,
      [idTipo],
    );
    const [ins] = await conn.query(
      `INSERT INTO dual_documento_plantillas
         (id_tipo_documento, archivo, nombre_archivo, mime_type, version, es_activa, id_usuario_subida)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [idTipo, file.buffer, nombreSeguro(file.originalname), DOCX_MIME, version, req.user.id],
    );
    await conn.commit();
    return res.status(201).json({
      message: `Plantilla de ${def.nombre} actualizada.`,
      id_plantilla: ins.insertId,
      clave,
      nombre: def.nombre,
      version,
      nombre_archivo: nombreSeguro(file.originalname),
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.descargar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query(
    `SELECT p.archivo, p.version, td.nombre AS clave
       FROM dual_documento_plantillas p
       JOIN dual_tipos_documento td ON td.id_tipo_documento = p.id_tipo_documento
      WHERE p.id_plantilla = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Plantilla no encontrada." });
  const file = Buffer.isBuffer(row.archivo) ? row.archivo : Buffer.from(row.archivo);
  // SEC-012: type and file name are fixed by the server, never taken from the upload.
  const nombre = `plantilla-${String(row.clave).toLowerCase().replace(/[^a-z0-9_-]/g, "")}-v${Number(row.version)}.docx`;
  res.setHeader("Content-Type", DOCX_MIME);
  res.setHeader("Content-Length", file.length);
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  return res.send(file);
};
