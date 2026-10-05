const pool = require("../db/pool");
const { generatedDefs } = require("./documentCatalogue");
const workflow = require("./documentosWorkflow");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 10 * 1024 * 1024;

function isDocx(file) {
  if (!file) return false;
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  const extensionOk = name.endsWith(".docx");
  const mimeOk = mime === DOCX_MIME || mime === "application/octet-stream" || mime === "application/zip";
  return extensionOk && mimeOk;
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

  const tipos = defs.map((def) => {
    const versions = rows.filter((row) => row.clave === def.clave);
    const activa = versions.find((row) => Number(row.es_activa) === 1) || null;
    return {
      clave: def.clave,
      nombre: def.nombre,
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

  return res.json({ tipos });
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
      [idTipo, file.buffer, file.originalname, file.mimetype || DOCX_MIME, version, req.user.id],
    );
    await conn.commit();
    return res.status(201).json({
      message: `Plantilla de ${def.nombre} actualizada.`,
      id_plantilla: ins.insertId,
      clave,
      nombre: def.nombre,
      version,
      nombre_archivo: file.originalname,
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
    `SELECT archivo, nombre_archivo, mime_type
       FROM dual_documento_plantillas
      WHERE id_plantilla = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Plantilla no encontrada." });
  const file = Buffer.isBuffer(row.archivo) ? row.archivo : Buffer.from(row.archivo);
  res.setHeader("Content-Type", row.mime_type || DOCX_MIME);
  res.setHeader("Content-Length", file.length);
  res.setHeader("Content-Disposition", `attachment; filename="${row.nombre_archivo || "plantilla.docx"}"`);
  return res.send(file);
};
