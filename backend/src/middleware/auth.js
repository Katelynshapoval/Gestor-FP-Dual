const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const JWT_EXPIRES = '8h';
const JWT_ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;
// Secrets that were ever committed to the repository must never be accepted again.
const REVOKED_SECRETS = new Set(['dual_jwt_secret_change_in_production']);

// Routes a user with must_change_password = 1 may still call.
const PASSWORD_CHANGE_CODE = 'PASSWORD_CHANGE_REQUIRED';

// The browser keeps the session in an HttpOnly cookie: page scripts never see
// the token, so a script injected into the page cannot steal it. SameSite=Strict
// keeps other sites from sending it, and every cookie-authenticated write must
// also carry CSRF_HEADER, which another site cannot add to a request without a
// CORS permission this API never grants. Scripts and tests may still send the
// token as `Authorization: Bearer`.
const SESSION_COOKIE = 'fpdual_sesion';
const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'fpdual';
const SESSION_MS = 8 * 60 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    // Over HTTPS in production (Caddy); plain HTTP on a development computer.
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    path: '/',
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// { token, viaCookie } from the Authorization header or the session cookie.
function readToken(req) {
  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) return { token: header.slice(7), viaCookie: false };
  const cookie = readCookie(req, SESSION_COOKIE);
  return cookie ? { token: cookie, viaCookie: true } : { token: null, viaCookie: false };
}

// A write sent with the session cookie must come from this application's pages.
const csrfOk = (req, viaCookie) =>
  !viaCookie || SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_VALUE;

// Returns the configured secret or throws. Read lazily so tests and the
// startup check (assertJwtConfig) see the current environment.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH || REVOKED_SECRETS.has(secret)) {
    throw new Error(
      `JWT_SECRET no está configurado o es inseguro (mínimo ${MIN_SECRET_LENGTH} caracteres). ` +
      'Defínelo en el entorno antes de arrancar el servidor.'
    );
  }
  return secret;
}

// Called once at startup: the server must not run without a strong secret.
function assertJwtConfig() {
  getJwtSecret();
}

// SEC-006: short, non-reversible tag of the current password hash. A session
// token carries it, so changing or resetting the password ends every session
// issued before (the reset link already uses the same idea).
function passwordFingerprint(hash) {
  return crypto.createHash('sha256').update(String(hash)).digest('base64url').slice(0, 22);
}

// passwordHash is the user's current password_hash; it is stored only as a fingerprint.
function signToken(payload, passwordHash) {
  return jwt.sign({ ...payload, pwd: passwordFingerprint(passwordHash) }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES,
    algorithm: JWT_ALGORITHM,
  });
}

// Current account state, checked on every authenticated request so that
// deactivation, role changes and forced password changes apply immediately.
async function loadAccountState(idUsuario) {
  const [rows] = await pool.query(
    `SELECT u.activo, u.must_change_password, u.password_hash, r.nombre AS rol
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ?`,
    [idUsuario]
  );
  return rows[0] || null;
}

function buildRequireAuth({ allowPendingPasswordChange = false } = {}) {
  return async function requireAuth(req, res, next) {
    const { token, viaCookie } = readToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No has iniciado sesión.', code: 'AUTH_REQUIRED' });
    }
    if (!csrfOk(req, viaCookie)) {
      return res.status(403).json({ error: 'Petición rechazada: recarga la página y vuelve a intentarlo.', code: 'CSRF' });
    }

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] });
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado. Inicie sesión de nuevo.', code: 'TOKEN_INVALID' });
    }

    let account;
    try {
      account = await loadAccountState(payload.id);
    } catch (err) {
      return next(err);
    }

    if (!account || !account.activo) {
      return res.status(401).json({
        error: 'La cuenta está desactivada o ya no existe. Contacte con el administrador.',
        code: 'ACCOUNT_DISABLED',
      });
    }
    if (payload.pwd !== passwordFingerprint(account.password_hash)) {
      return res.status(401).json({
        error: 'La contraseña ha cambiado. Inicie sesión de nuevo.',
        code: 'SESSION_STALE',
      });
    }
    if (account.rol !== payload.rol) {
      return res.status(401).json({
        error: 'Tus permisos han cambiado. Inicie sesión de nuevo.',
        code: 'SESSION_STALE',
      });
    }

    const mustChange = !!account.must_change_password;
    if (mustChange && !allowPendingPasswordChange) {
      return res.status(403).json({
        error: 'Debes cambiar la contraseña antes de continuar.',
        code: PASSWORD_CHANGE_CODE,
      });
    }

    const { pwd, ...claims } = payload;
    req.user = { ...claims, rol: account.rol, must_change_password: mustChange };
    return next();
  };
}

// Standard guard for every protected route.
const requireAuth = buildRequireAuth();
// Only for /auth/me and /auth/changePassword: lets a user with a temporary
// password finish the mandatory change.
const requireAuthAllowPasswordChange = buildRequireAuth({ allowPendingPasswordChange: true });

// For public routes whose answer depends on who asks: sets req.user when the
// token is valid and the account is active, and otherwise carries on as an
// anonymous visitor. Never answers 401.
async function optionalAuth(req, _res, next) {
  req.user = undefined;
  const { token, viaCookie } = readToken(req);
  // A cookie on a write without the CSRF header counts as an anonymous visit.
  if (!token || !csrfOk(req, viaCookie)) return next();
  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] });
  } catch {
    return next();
  }
  let account;
  try {
    account = await loadAccountState(payload.id);
  } catch (err) {
    return next(err);
  }
  if (
    account &&
    account.activo &&
    payload.pwd === passwordFingerprint(account.password_hash) &&
    account.rol === payload.rol
  ) {
    const { pwd, ...claims } = payload;
    req.user = { ...claims, rol: account.rol, must_change_password: !!account.must_change_password };
  }
  return next();
}

// requireRole('ADMINISTRADOR', 'COORDINADOR')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.', code: 'AUTH_REQUIRED' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tiene permiso para realizar esta acción.', code: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = {
  getJwtSecret,
  signToken,
  passwordFingerprint,
  requireAuth,
  requireAuthAllowPasswordChange,
  optionalAuth,
  requireRole,
  assertJwtConfig,
  setSessionCookie,
  clearSessionCookie,
  PASSWORD_CHANGE_CODE,
  SESSION_COOKIE,
  CSRF_VALUE,
  SESSION_MS,
};
