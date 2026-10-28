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
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autenticado. Se requiere token de acceso.', code: 'AUTH_REQUIRED' });
    }
    const token = header.slice(7);

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
  requireRole,
  assertJwtConfig,
  PASSWORD_CHANGE_CODE,
};
