const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dual_jwt_secret_change_in_production';
const JWT_EXPIRES = '8h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado. Se requiere token de acceso.' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado. Inicie sesión de nuevo.' });
  }
}

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

module.exports = { signToken, requireAuth, requireRole };
