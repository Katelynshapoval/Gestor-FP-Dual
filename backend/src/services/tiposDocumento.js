// Document types the centre can add (migration 025; docs/tecnica/logica-de-negocio/documentos-y-firmas.md § 1.1).
//
// dual_tipos_documento holds every type. The 13 system types (es_sistema = 1)
// keep their rules in documentCatalogue.CATALOGUE and are read-only here; only
// their template changes (Documentos › Plantillas). A type added by the centre
// is always generated from a template and has: where it belongs (ámbito), who
// signs, whether it is required and, for reservations, which contract family.
//
// The catalogue keeps an in-memory copy (documentCatalogue.setCustomTypes),
// loaded when the server starts and refreshed after every change here.
const pool = require("../db/pool");
const { allDefs, setCustomTypes, CONTEXTO_LABEL } = require("./documentCatalogue");
const { recordEvent } = require("./auditLog");
const { variablesPorAmbito } = require("./documentGenerationConfig");

const AMBITOS = ["solicitud_alumno", "solicitud_empresa", "reserva"];
const FAMILIAS = ["beca", "contrato"];
const MAX_NOMBRE = 80;

class TipoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Loads the custom types into the catalogue. Before migration 025 the columns
// do not exist: the app keeps working with the system types only.
async function cargar(conn = pool) {
  try {
    const [rows] = await conn.query("SELECT * FROM dual_tipos_documento");
    setCustomTypes(rows);
    return rows.filter((r) => !Number(r.es_sistema)).length;
  } catch (err) {
    if (err.code === "ER_BAD_FIELD_ERROR") {
      console.warn("[documentos] Sin migración 025: solo los tipos de documento del sistema.");
      setCustomTypes([]);
      return 0;
    }
    throw err;
  }
}

// «Anexo IV (prácticas)» → ANEXO_IV_PRACTICAS: the internal key, never shown.
function claveDesde(nombre) {
  const base = String(nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34);
  return base || "DOCUMENTO";
}

const bool = (v) => v === true || v === 1 || v === "1" || v === "true";

// Checks and normalises the fields of a type. `actual` is the stored row when editing.
function validar(body, actual = null) {
  const nombre = String(body?.nombre ?? actual?.nombre_mostrar ?? "").replace(/\s+/g, " ").trim();
  if (nombre.length < 2) throw new TipoError(400, "Indica el nombre del documento.");
  if (nombre.length > MAX_NOMBRE) throw new TipoError(400, `El nombre admite como máximo ${MAX_NOMBRE} caracteres.`);
  if (/[<>{}\u0000-\u001f]/.test(nombre)) throw new TipoError(400, "El nombre contiene caracteres no permitidos.");

  const ambito = body?.ambito ?? actual?.ambito;
  if (!AMBITOS.includes(ambito)) throw new TipoError(400, "Indica a qué pertenece el documento.");

  const firma = {
    empresa: bool(body?.firma_empresa ?? actual?.firma_empresa),
    centro: bool(body?.firma_centro ?? actual?.firma_centro),
    alumno: bool(body?.firma_alumno ?? actual?.firma_alumno),
  };
  if (firma.alumno && ambito === "solicitud_empresa") {
    throw new TipoError(400, "El alumno no firma documentos de la solicitud de empresa.");
  }
  if (firma.empresa && ambito === "solicitud_alumno") {
    throw new TipoError(400, "La empresa no firma documentos de la solicitud del alumno.");
  }

  let familia = body?.familia_contrato === undefined ? actual?.familia_contrato ?? null : body.familia_contrato;
  if (familia === "" || familia === "todos") familia = null;
  if (familia !== null && !FAMILIAS.includes(familia)) throw new TipoError(400, "Tipo de contrato no válido.");
  if (familia && ambito !== "reserva") familia = null;

  return {
    nombre,
    ambito,
    firma,
    requerido: bool(body?.requerido ?? actual?.requerido),
    familia,
    activo: body?.activo === undefined ? (actual ? bool(actual.activo) : true) : bool(body.activo),
  };
}

async function contarDocumentos(conn, idTipo) {
  const [[row]] = await conn.query("SELECT COUNT(*) AS n FROM dual_documentos WHERE id_tipo_documento = ?", [idTipo]);
  return Number(row.n);
}

async function nombreLibre(conn, nombre, idExcluido = null) {
  const [rows] = await conn.query(
    "SELECT id_tipo_documento FROM dual_tipos_documento WHERE LOWER(nombre_mostrar) = LOWER(?) AND id_tipo_documento <> ?",
    [nombre, idExcluido || 0],
  );
  return !rows.length;
}

async function claveLibre(conn, nombre) {
  const base = claveDesde(nombre);
  const [rows] = await conn.query("SELECT nombre FROM dual_tipos_documento WHERE nombre LIKE ?", [`${base}%`]);
  const usadas = new Set(rows.map((r) => r.nombre));
  if (!usadas.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    if (!usadas.has(`${base}_${i}`)) return `${base}_${i}`;
  }
  throw new TipoError(409, "No se ha podido crear el documento con ese nombre.");
}

const snapshot = (v) => ({
  nombre: v.nombre,
  ambito: v.ambito,
  firma_empresa: v.firma.empresa,
  firma_centro: v.firma.centro,
  firma_alumno: v.firma.alumno,
  requerido: v.requerido,
  familia_contrato: v.familia,
  activo: v.activo,
});

const snapshotFila = (row) => ({
  nombre: row.nombre_mostrar,
  ambito: row.ambito,
  firma_empresa: Boolean(Number(row.firma_empresa)),
  firma_centro: Boolean(Number(row.firma_centro)),
  firma_alumno: Boolean(Number(row.firma_alumno)),
  requerido: Boolean(Number(row.requerido)),
  familia_contrato: row.familia_contrato || null,
  activo: Boolean(Number(row.activo)),
});

async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function enviarError(res, err) {
  if (err instanceof TipoError) return res.status(err.status).json({ error: err.message });
  if (err?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ya hay un documento con ese nombre." });
  throw err;
}

// GET /tipos-documento — every active type plus the custom ones switched off,
// with its template, its document count and the data its template can use.
exports.list = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT td.id_tipo_documento, td.nombre, td.nombre_mostrar, td.ambito, td.generado,
            td.firma_empresa, td.firma_centro, td.firma_alumno, td.requerido, td.familia_contrato,
            td.activo, td.es_sistema, td.orden, td.creado_en,
            (SELECT COUNT(*) FROM dual_documentos d WHERE d.id_tipo_documento = td.id_tipo_documento) AS documentos,
            p.version AS plantilla_version, p.nombre_archivo AS plantilla_nombre
       FROM dual_tipos_documento td
       LEFT JOIN dual_documento_plantillas p ON p.id_tipo_documento = td.id_tipo_documento AND p.es_activa = 1
      ORDER BY td.orden, td.nombre_mostrar`,
  );
  const tipos = rows
    .filter((r) => Number(r.activo) || !Number(r.es_sistema))
    .map((r) => ({
      clave: r.nombre,
      nombre: r.nombre_mostrar,
      ambito: r.ambito,
      ambito_label: CONTEXTO_LABEL[r.ambito] || "Sin ámbito",
      generado: Boolean(Number(r.generado)),
      firma_empresa: Boolean(Number(r.firma_empresa)),
      firma_centro: Boolean(Number(r.firma_centro)),
      firma_alumno: Boolean(Number(r.firma_alumno)),
      requerido: Boolean(Number(r.requerido)),
      familia_contrato: r.familia_contrato || null,
      activo: Boolean(Number(r.activo)),
      es_sistema: Boolean(Number(r.es_sistema)),
      documentos: Number(r.documentos),
      plantilla: r.plantilla_version ? { version: r.plantilla_version, nombre_archivo: r.plantilla_nombre } : null,
    }));
  return res.json({
    tipos,
    ambitos: AMBITOS.map((a) => ({ ambito: a, label: CONTEXTO_LABEL[a], variables: variablesPorAmbito(a) })),
  });
};

// POST /tipos-documento
exports.create = async function (req, res) {
  try {
    const v = validar(req.body);
    const out = await enTransaccion(async (conn) => {
      if (!(await nombreLibre(conn, v.nombre))) throw new TipoError(409, "Ya hay un documento con ese nombre.");
      const clave = await claveLibre(conn, v.nombre);
      const [[{ orden }]] = await conn.query(
        "SELECT COALESCE(MAX(orden), 100) + 10 AS orden FROM dual_tipos_documento WHERE es_sistema = 0 AND orden < 900",
      );
      const [ins] = await conn.query(
        `INSERT INTO dual_tipos_documento
           (nombre, nombre_mostrar, ambito, generado, firma_empresa, firma_centro, firma_alumno,
            requerido, familia_contrato, activo, es_sistema, orden)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [clave, v.nombre, v.ambito, v.firma.empresa, v.firma.centro, v.firma.alumno, v.requerido, v.familia, v.activo, Math.min(Number(orden), 890)],
      );
      await recordEvent(conn, {
        entidad: "TIPO_DOCUMENTO", id: ins.insertId, accion: "CREAR", user: req.user,
        detalle: { clave, ...snapshot(v) },
      });
      return { id: ins.insertId, clave };
    });
    await cargar();
    return res.status(201).json({ message: `Documento «${v.nombre}» creado. Sube su plantilla para poder generarlo.`, clave: out.clave });
  } catch (err) {
    return enviarError(res, err);
  }
};

// PUT /tipos-documento/:clave — custom types only. The ámbito can change only
// while no document of the type exists.
exports.update = async function (req, res) {
  const clave = String(req.params.clave || "").toUpperCase();
  try {
    const nombre = await enTransaccion(async (conn) => {
      const [rows] = await conn.query("SELECT * FROM dual_tipos_documento WHERE nombre = ? FOR UPDATE", [clave]);
      const actual = rows[0];
      if (!actual) throw new TipoError(404, "Documento no encontrado.");
      if (Number(actual.es_sistema)) {
        throw new TipoError(400, "Los documentos del sistema no se editan; solo se cambia su plantilla.");
      }
      const v = validar(req.body, actual);
      if (v.ambito !== actual.ambito && (await contarDocumentos(conn, actual.id_tipo_documento)) > 0) {
        throw new TipoError(409, "Ya hay documentos de este tipo: no se puede cambiar a qué pertenece.");
      }
      if (!(await nombreLibre(conn, v.nombre, actual.id_tipo_documento))) {
        throw new TipoError(409, "Ya hay un documento con ese nombre.");
      }
      const antes = snapshotFila(actual);
      const despues = snapshot(v);
      const cambios = Object.keys(despues).filter((k) => antes[k] !== despues[k]);
      if (!cambios.length) return v.nombre;
      await conn.query(
        `UPDATE dual_tipos_documento
            SET nombre_mostrar = ?, ambito = ?, firma_empresa = ?, firma_centro = ?, firma_alumno = ?,
                requerido = ?, familia_contrato = ?, activo = ?
          WHERE id_tipo_documento = ?`,
        [v.nombre, v.ambito, v.firma.empresa, v.firma.centro, v.firma.alumno, v.requerido, v.familia, v.activo, actual.id_tipo_documento],
      );
      const soloActivo = cambios.length === 1 && cambios[0] === "activo";
      await recordEvent(conn, {
        entidad: "TIPO_DOCUMENTO", id: actual.id_tipo_documento,
        accion: soloActivo ? (v.activo ? "ACTIVAR" : "DESACTIVAR") : "EDITAR",
        user: req.user,
        detalle: { clave, antes: Object.fromEntries(cambios.map((k) => [k, antes[k]])), despues: Object.fromEntries(cambios.map((k) => [k, despues[k]])) },
      });
      return v.nombre;
    });
    await cargar();
    return res.json({ message: `Documento «${nombre}» guardado.` });
  } catch (err) {
    return enviarError(res, err);
  }
};

exports.cargar = cargar;
exports.claveDesde = claveDesde;
exports.validar = validar;
exports.TipoError = TipoError;
exports.allDefs = allDefs;
