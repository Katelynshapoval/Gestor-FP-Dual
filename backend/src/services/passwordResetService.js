// «¿Has olvidado tu contraseña?»: a reset link sent by email (Phase 5).
//
// No table is needed: the link carries a JWT signed with a key derived from
// JWT_SECRET (so it can never be used as a session token) that expires in 30
// minutes and includes a fingerprint of the current password hash. Once the
// password changes, by this link or any other way, the fingerprint no longer
// matches and every older link stops working: each link works once.
//
// The form refuses the request when there is no active account, or when that
// account has no email to write to, so the user is not told that a link was
// sent when nothing went out. Requests are limited per IP and identifier,
// like the login.
//
// Where the link goes: staff → their user email; students → the personal email
// of their application; companies → the principal coordinator's email.
// Deactivated accounts (for example after a «baja») get no link.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../db/pool");
const { getJwtSecret } = require("../middleware/auth");
const { findUserByIdentifier } = require("./authService");
const { createLoginRateLimiter } = require("../middleware/loginRateLimit");
const notificar = require("./notificaciones");

const TTL = "30m";
const MIN_PASSWORD_LENGTH = 8;
const limiter = createLoginRateLimiter({ maxPerIdentifier: 3, maxPerIp: 20 });

const NOT_FOUND = "No hay ninguna cuenta con ese usuario. Comprueba el correo, el CIF o el DNI/NIE.";
const DISABLED = "La cuenta está desactivada. Contacta con el centro.";
const NO_EMAIL = "Esta cuenta no tiene un correo al que enviar el enlace. Contacta con el centro.";
const SENT =
  "Te hemos enviado un enlace al correo asociado. Caduca en 30 minutos. Revisa también la carpeta de spam.";
const INVALID = "El enlace no es válido, ya se ha usado o ha caducado. Pide uno nuevo.";

const resetSecret = () => `${getJwtSecret()}:password-reset`;
const fingerprint = (hash) => crypto.createHash("sha256").update(String(hash)).digest("base64url").slice(0, 22);

function appUrl() {
  const url = (process.env.APP_URL || "").replace(/\/$/, "");
  if (url) return url;
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

async function destino(user) {
  if (user.rol === "ADMINISTRADOR" || user.rol === "COORDINADOR") {
    return { email: user.email, nombre: user.nombre_mostrar };
  }
  if (user.rol === "ALUMNO" && user.id_alumno) {
    const [rows] = await pool.query("SELECT email, nombre FROM gf_alumnosfct WHERE idalumno = ?", [user.id_alumno]);
    return rows[0] || null;
  }
  if (user.rol === "EMPRESA" && user.id_contacto) {
    const [rows] = await pool.query("SELECT email, nombre FROM ge_contactos WHERE idcontacto = ?", [user.id_contacto]);
    return rows[0] || null;
  }
  return null;
}

function crearToken(user) {
  return jwt.sign({ sub: user.id_usuario, fp: fingerprint(user.password_hash), purpose: "reset" }, resetSecret(), {
    expiresIn: TTL,
  });
}

// POST /auth/forgotPassword { username }
exports.solicitar = async function (req, res) {
  const identifier = String(req.body?.username || "").trim();
  if (!identifier) return res.status(400).json({ error: "Indica tu usuario: correo, CIF o DNI/NIE." });

  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const wait = limiter.retryAfter(ip, identifier);
  if (wait > 0) {
    res.set("Retry-After", String(wait));
    return res.status(429).json({
      error: `Has pedido demasiados enlaces. Vuelve a intentarlo en ${Math.ceil(wait / 60)} minuto(s).`,
      code: "TOO_MANY_ATTEMPTS",
    });
  }
  limiter.recordFailure(ip, identifier); // every request counts

  const user = await findUserByIdentifier(identifier);
  if (!user) return res.status(404).json({ error: NOT_FOUND, code: "CUENTA_NO_ENCONTRADA" });
  if (!user.activo) return res.status(403).json({ error: DISABLED, code: "CUENTA_DESACTIVADA" });

  const to = await destino(user);
  const base = appUrl();
  if (!to?.email) return res.status(400).json({ error: NO_EMAIL, code: "SIN_CORREO" });
  if (!base) {
    console.warn("[recuperar contraseña] sin APP_URL para el usuario", user.id_usuario);
    return res.status(500).json({ error: "No se ha podido preparar el enlace. Contacta con el centro." });
  }

  const link = `${base}/restablecer-contrasena?token=${encodeURIComponent(crearToken(user))}`;
  notificar.restablecerContrasena(to.email, to.nombre || user.nombre_mostrar, link);
  return res.json({ message: SENT });
};

// POST /auth/resetPassword { token, newPassword }
exports.restablecer = async function (req, res) {
  const token = String(req.body?.token || "");
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
  }

  let payload;
  try {
    payload = jwt.verify(token, resetSecret());
  } catch {
    return res.status(400).json({ error: INVALID, code: "ENLACE_NO_VALIDO" });
  }
  if (payload.purpose !== "reset" || !payload.sub) {
    return res.status(400).json({ error: INVALID, code: "ENLACE_NO_VALIDO" });
  }

  const [rows] = await pool.query("SELECT password_hash, activo FROM dual_usuarios WHERE id_usuario = ?", [payload.sub]);
  const row = rows[0];
  if (!row || !row.activo || fingerprint(row.password_hash) !== payload.fp) {
    return res.status(400).json({ error: INVALID, code: "ENLACE_NO_VALIDO" });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  // The old hash in the WHERE makes two parallel uses of one link succeed only once.
  const [result] = await pool.query(
    "UPDATE dual_usuarios SET password_hash = ?, must_change_password = 0 WHERE id_usuario = ? AND password_hash = ?",
    [hash, payload.sub, row.password_hash],
  );
  if (!result.affectedRows) return res.status(400).json({ error: INVALID, code: "ENLACE_NO_VALIDO" });

  return res.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña." });
};

exports._internals = { fingerprint, resetSecret, crearToken, limiter };
