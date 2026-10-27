const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const JWT_EXPIRES = '8h';
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

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES });
}

// Current account state, checked on every authenticated request so that
// deactivation, role changes and forced password changes apply immediately.
async function loadAccountState(idUsuario) {
  const [rows] = await pool.query(
    `SELECT u.activo, u.must_change_password, r.nombre AS rol
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
      return res.status(401).json({ error: 'No autenticado. Se requiere token de acceso.' });
    }
    const token = header.slice(7);

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado. Inicie sesión de nuevo.' });
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

    req.user = { ...payload, rol: account.rol, must_change_password: mustChange };
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
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tiene permiso para realizar esta acción.' });
    }
    next();
  };
}

module.exports = {
  signToken,
  requireAuth,
  requireAuthAllowPasswordChange,
  requireRole,
  assertJwtConfig,
  PASSWORD_CHANGE_CODE,
};
