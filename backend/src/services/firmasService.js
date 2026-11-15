// Saved signatures (migration 027, docs/PLAN_FIRMAS.md).
//
// Each person keeps ONE active signature image:
//   USUARIO  a student's or a company's own (owner = their user)
//   TUTOR    the legal guardian's of an under-18 student, on the student's account
//   CENTRO   the centre's signature and seal, shared by ADMINISTRADOR and COORDINADOR
// A new image deactivates the previous row; documents already signed keep the
// image they were stamped with. The image is returned only to its owner (the
// centre's, to staff). Events record that a signature changed, never the image.
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");
const pool = require("../db/pool");
const { recordEvent } = require("./auditLog");
const { getStudentIdFromUser, getCompanyIdFromUser } = require("../helpers/dbHelpers");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = { USUARIO: 400 * 1024, TUTOR: 400 * 1024, CENTRO: 1024 * 1024 };
const MIN_PX = [60, 20];
const MAX_PX = 2400;
const ORIGENES = ["PANTALLA", "MOVIL", "FICHERO"];
const STAFF = ["ADMINISTRADOR", "COORDINADOR"];

function fallo(status, code, error) {
  return Object.assign(new Error(error), { status, code });
}

// Checks that the bytes are a PNG a PDF can carry; → { ancho, alto }.
async function validarPng(buffer, titular = "USUARIO") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw fallo(400, "FIRMA_NO_PNG", "La firma tiene que ser una imagen PNG.");
  }
  if (buffer.length > MAX_BYTES[titular]) {
    throw fallo(400, "FIRMA_GRANDE", "La imagen de la firma es demasiado grande.");
  }
  const ancho = buffer.readUInt32BE(16);
  const alto = buffer.readUInt32BE(20);
  if (ancho > MAX_PX || alto > MAX_PX) throw fallo(400, "FIRMA_GRANDE", "La imagen de la firma es demasiado grande.");
  if (ancho < MIN_PX[0] || alto < MIN_PX[1]) {
    throw fallo(400, "FIRMA_VACIA", "La firma es demasiado pequeña. Dibújala de nuevo.");
  }
  try {
    const doc = await PDFDocument.create();
    await doc.embedPng(buffer);
  } catch {
    throw fallo(400, "FIRMA_NO_PNG", "La imagen de la firma no se puede leer.");
  }
  return { ancho, alto };
}

// Under 18 today. Without a birth date the student counts as an adult.
function esMenor(fechaNacimiento, hoy = new Date()) {
  if (!fechaNacimiento) return false;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return false;
  const mayoria = new Date(nacimiento.getFullYear() + 18, nacimiento.getMonth(), nacimiento.getDate());
  return hoy < mayoria;
}

async function alumnoDe(conn, idUsuario) {
  const idAlumno = await getStudentIdFromUser(idUsuario);
  if (!idAlumno) return null;
  const [rows] = await conn.query(
    "SELECT nombre, fechaNacimiento, tutorLegal FROM gf_alumnosfct WHERE idalumno = ?",
    [idAlumno],
  );
  if (!rows[0]) return null;
  return {
    nombre: rows[0].nombre,
    tutor: String(rows[0].tutorLegal || "").trim() || null,
    menor: esMenor(rows[0].fechaNacimiento),
  };
}

async function activa(conn, titular, idUsuario, { bloquear = false } = {}) {
  const [rows] = await conn.query(
    `SELECT id_firma, imagen, ancho, alto, origen, creado_en
       FROM dual_firmas
      WHERE titular = ? AND id_usuario <=> ? AND activa = 1
      ${bloquear ? "FOR UPDATE" : ""}`,
    [titular, titular === "CENTRO" ? null : idUsuario],
  );
  return rows[0] || null;
}

function vista(row) {
  if (!row) return null;
  const imagen = Buffer.isBuffer(row.imagen) ? row.imagen : Buffer.from(row.imagen);
  return {
    id_firma: row.id_firma,
    ancho: row.ancho,
    alto: row.alto,
    origen: row.origen,
    creado_en: row.creado_en,
    imagen: `data:image/png;base64,${imagen.toString("base64")}`,
  };
}

async function guardar({ titular, idUsuario, buffer, origen, user }) {
  const { ancho, alto } = await validarPng(buffer, titular);
  const propietario = titular === "CENTRO" ? null : idUsuario;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const anterior = await activa(conn, titular, propietario, { bloquear: true });
    if (anterior) {
      await conn.query("UPDATE dual_firmas SET activa = 0, retirada_en = NOW() WHERE id_firma = ?", [anterior.id_firma]);
    }
    const [ins] = await conn.query(
      `INSERT INTO dual_firmas (titular, id_usuario, imagen, ancho, alto, origen, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [titular, propietario, buffer, ancho, alto, ORIGENES.includes(origen) ? origen : "PANTALLA", user.id],
    );
    await recordEvent(conn, {
      entidad: "FIRMA", id: ins.insertId, accion: anterior ? "CAMBIAR" : "CREAR", user,
      detalle: { titular, ...(anterior ? { sustituye: anterior.id_firma } : {}) },
    });
    await conn.commit();
    return ins.insertId;
  } catch (err) {
    await conn.rollback();
    // Two saves at once: the unique index lets one through.
    if (err.code === "ER_DUP_ENTRY") throw fallo(409, "FIRMA_CONCURRENTE", "La firma se acaba de guardar desde otra sesión.");
    throw err;
  } finally {
    conn.release();
  }
}

// What the signature screens need for the caller.
async function estado(user) {
  if (STAFF.includes(user.rol)) {
    return {
      titular: "CENTRO",
      firma: vista(await activa(pool, "CENTRO", null)),
      puede_cambiar: user.rol === "ADMINISTRADOR",
    };
  }
  const base = { titular: "USUARIO", firma: vista(await activa(pool, "USUARIO", user.id)), puede_cambiar: true };
  if (user.rol !== "ALUMNO") return base;
  const alumno = await alumnoDe(pool, user.id);
  const firmaTutor = await activa(pool, "TUTOR", user.id);
  return {
    ...base,
    requiere_tutor: Boolean(alumno?.menor),
    tutor_nombre: alumno?.tutor || null,
    // Shown while it exists even after the student turns 18, so it can be deleted.
    firma_tutor: vista(firmaTutor),
  };
}

exports.getMia = async function (req, res) {
  return res.json(await estado(req.user));
};

function responder(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
  throw err;
}

// PUT /firmas/mia (ALUMNO, EMPRESA) — multipart: imagen, origen, titular (USUARIO | TUTOR)
exports.putMia = async function (req, res) {
  const titular = String(req.body?.titular || "USUARIO").toUpperCase();
  if (titular !== "USUARIO" && titular !== "TUTOR") return res.status(400).json({ error: "Firma no válida." });
  if (titular === "TUTOR" && req.user.rol !== "ALUMNO") {
    return res.status(403).json({ error: "Solo un alumno guarda la firma de su tutor legal." });
  }
  if (!req.file) return res.status(400).json({ error: "No se ha recibido la firma." });
  try {
    await guardar({ titular, idUsuario: req.user.id, buffer: req.file.buffer, origen: req.body?.origen, user: req.user });
  } catch (err) {
    return responder(res, err);
  }
  return res.json({ message: "Firma guardada.", ...(await estado(req.user)) });
};

// DELETE /firmas/mia?titular=USUARIO|TUTOR — the image is erased; the row stays
// because signed documents refer to it.
exports.deleteMia = async function (req, res) {
  const titular = String(req.query?.titular || "USUARIO").toUpperCase();
  if (titular !== "USUARIO" && titular !== "TUTOR") return res.status(400).json({ error: "Firma no válida." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const actual = await activa(conn, titular, req.user.id, { bloquear: true });
    if (!actual) {
      await conn.rollback();
      return res.status(404).json({ error: "No tienes ninguna firma guardada." });
    }
    await conn.query(
      "UPDATE dual_firmas SET activa = 0, imagen = NULL, retirada_en = NOW() WHERE id_firma = ?",
      [actual.id_firma],
    );
    await recordEvent(conn, { entidad: "FIRMA", id: actual.id_firma, accion: "ELIMINAR", user: req.user, detalle: { titular } });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return res.json({ message: "Firma eliminada.", ...(await estado(req.user)) });
};

// PUT /firmas/centro (ADMINISTRADOR) — multipart: imagen
exports.putCentro = async function (req, res) {
  if (!req.file) return res.status(400).json({ error: "No se ha recibido la imagen." });
  try {
    await guardar({ titular: "CENTRO", idUsuario: null, buffer: req.file.buffer, origen: "FICHERO", user: req.user });
  } catch (err) {
    return responder(res, err);
  }
  return res.json({ message: "Firma del centro guardada.", ...(await estado(req.user)) });
};

// The images a role stamps when it signs, with the words for the Hoja de firmas.
// rolFirma: GESTOR | EMPRESA | ALUMNO. Throws 409 when one is missing.
async function sellosPara(conn, user, rolFirma) {
  const sello = (row, marca, titulo, nombre) => ({
    marca, id_firma: row.id_firma, titulo, nombre: nombre || null,
    png: Buffer.isBuffer(row.imagen) ? row.imagen : Buffer.from(row.imagen),
  });
  if (rolFirma === "GESTOR") {
    const centro = await activa(conn, "CENTRO", null);
    if (!centro) {
      throw fallo(409, "SIN_FIRMA_CENTRO", "Falta la firma del centro. Un administrador la sube en Configuración › Firma del centro.");
    }
    return [sello(centro, "CENTRO", "Por el centro", null)];
  }
  const propia = await activa(conn, "USUARIO", user.id);
  if (!propia) throw fallo(409, "SIN_FIRMA_GUARDADA", "Todavía no has creado tu firma.");
  if (rolFirma === "EMPRESA") {
    const idEmpresa = await getCompanyIdFromUser(user.id);
    const [rows] = idEmpresa
      ? await conn.query("SELECT empresa FROM ge_empresas WHERE idempresa = ?", [idEmpresa])
      : [[]];
    return [sello(propia, "EMPRESA", "Por la empresa", rows[0]?.empresa)];
  }
  const alumno = await alumnoDe(conn, user.id);
  const sellos = [sello(propia, "ALUMNO", "El alumno / La alumna", alumno?.nombre)];
  if (alumno?.menor) {
    const tutor = await activa(conn, "TUTOR", user.id);
    if (!tutor) {
      throw fallo(409, "SIN_FIRMA_TUTOR", "Eres menor de edad: falta la firma de tu tutor o tutora legal.");
    }
    sellos.push(sello(tutor, "TUTOR", "Tutor/a legal", alumno.tutor));
  }
  return sellos;
}

// ── Phone hand-off ──────────────────────────────────────────────────────────
// The computer opens a session and shows a QR with `token`; the phone uploads
// one drawing; the computer reads it with `lectura`. The session belongs to no
// account: the drawing is saved only when the computer sends it to PUT
// /firmas/mia (or with the registration form). Only hashes are stored.
const MINUTOS = 10;
const MAX_ABIERTAS = 300;
const hash = (secreto) => crypto.createHash("sha256").update(String(secreto || "")).digest("hex");
const secreto = () => crypto.randomBytes(32).toString("base64url");

exports.crearSesion = async function (req, res) {
  await pool.query("DELETE FROM dual_firma_sesiones WHERE expira_en < NOW() - INTERVAL 1 MINUTE");
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM dual_firma_sesiones");
  if (Number(n) >= MAX_ABIERTAS) {
    return res.status(429).json({ error: "Hay demasiadas firmas en curso. Inténtalo en unos minutos." });
  }
  const token = secreto();
  const lectura = secreto();
  const [ins] = await pool.query(
    `INSERT INTO dual_firma_sesiones (token_hash, lectura_hash, expira_en)
     VALUES (?, ?, NOW() + INTERVAL ? MINUTE)`,
    [hash(token), hash(lectura), MINUTOS],
  );
  return res.status(201).json({ id: ins.insertId, token, lectura, minutos: MINUTOS });
};

async function sesionDelOrdenador(req) {
  const id = parseInt(req.params.id, 10);
  if (!id) return null;
  const [rows] = await pool.query(
    `SELECT id_sesion, estado, imagen, expira_en < NOW() AS caducada, GREATEST(TIMESTAMPDIFF(SECOND, NOW(), expira_en), 0) AS segundos
       FROM dual_firma_sesiones WHERE id_sesion = ? AND lectura_hash = ?`,
    [id, hash(req.get("X-Firma-Lectura"))],
  );
  return rows[0] || null;
}

exports.leerSesion = async function (req, res) {
  const sesion = await sesionDelOrdenador(req);
  if (!sesion) return res.status(404).json({ error: "Sesión no encontrada.", estado: "CERRADA" });
  if (sesion.estado === "RECIBIDA" && sesion.imagen) {
    const imagen = Buffer.isBuffer(sesion.imagen) ? sesion.imagen : Buffer.from(sesion.imagen);
    return res.json({ estado: "RECIBIDA", imagen: `data:image/png;base64,${imagen.toString("base64")}` });
  }
  if (Number(sesion.caducada)) return res.json({ estado: "CADUCADA" });
  return res.json({ estado: sesion.estado, segundos: Number(sesion.segundos) });
};

exports.cerrarSesion = async function (req, res) {
  const sesion = await sesionDelOrdenador(req);
  if (sesion) await pool.query("DELETE FROM dual_firma_sesiones WHERE id_sesion = ?", [sesion.id_sesion]);
  return res.json({ estado: "CERRADA" });
};

async function sesionDelMovil(req) {
  const [rows] = await pool.query(
    "SELECT id_sesion, estado, expira_en < NOW() AS caducada FROM dual_firma_sesiones WHERE token_hash = ?",
    [hash(req.get("X-Firma-Token"))],
  );
  const sesion = rows[0];
  if (!sesion) return "CERRADA";
  if (sesion.estado === "ABIERTA" && Number(sesion.caducada)) return "CADUCADA";
  return sesion.estado;
}

exports.estadoMovil = async function (req, res) {
  return res.json({ estado: await sesionDelMovil(req) });
};

exports.enviarMovil = async function (req, res) {
  if (!req.file) return res.status(400).json({ error: "No se ha recibido la firma." });
  try {
    await validarPng(req.file.buffer);
  } catch (err) {
    return responder(res, err);
  }
  // One upload per session: the UPDATE only matches while it is open.
  const [r] = await pool.query(
    `UPDATE dual_firma_sesiones SET estado = 'RECIBIDA', imagen = ?
      WHERE token_hash = ? AND estado = 'ABIERTA' AND expira_en > NOW()`,
    [req.file.buffer, hash(req.get("X-Firma-Token"))],
  );
  if (!r.affectedRows) {
    const estadoActual = await sesionDelMovil(req);
    const error = estadoActual === "CADUCADA"
      ? "El código ha caducado. Genera otro en el ordenador."
      : estadoActual === "RECIBIDA"
        ? "Ya se ha enviado una firma con este código."
        : "Esta sesión ya no está abierta. Genera otro código en el ordenador.";
    return res.status(409).json({ error, estado: estadoActual });
  }
  return res.json({ estado: "RECIBIDA", message: "Firma enviada. Vuelve al ordenador." });
};

exports.validarPng = validarPng;
exports.esMenor = esMenor;
exports.guardar = guardar;
exports.sellosPara = sellosPara;
exports.estado = estado;
exports.MAX_BYTES = MAX_BYTES;
