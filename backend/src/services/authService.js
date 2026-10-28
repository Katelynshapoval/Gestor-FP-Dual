const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { signToken } = require('../middleware/auth');
const { normalizeCif, normalizeDni, sendSqlError } = require('../helpers/dbHelpers');
const { recordEvent } = require('./auditLog');
const { loginRateLimiter } = require('../middleware/loginRateLimit');

const MIN_PASSWORD_LENGTH = 8;

const USER_COLUMNS = `u.id_usuario, u.nombre_mostrar, u.email, u.password_hash,
            u.activo, u.must_change_password,
            r.nombre AS rol, u.id_contacto, u.id_alumno`;

// Builds the JWT payload and the public user object from a database row
function buildResponse(user) {
  const payload = {
    id: user.id_usuario,
    email: user.email,
    nombre: user.nombre_mostrar,
    rol: user.rol,
    id_contacto: user.id_contacto,
    id_alumno: user.id_alumno ?? null,
  };
  const token = signToken(payload);
  return {
    token,
    user: {
      id: user.id_usuario,
      nombre: user.nombre_mostrar,
      email: user.email,
      rol: user.rol,
      must_change_password: !!user.must_change_password,
      cif: user.cif || null,
      dni: user.dni || null,
    },
  };
}

// Role-aware lookup. Identifiers are never interchangeable across roles:
// staff → email, EMPRESA → CIF, ALUMNO → DNI/NIE.
async function findUserByIdentifier(identifier) {
  const trimmed = String(identifier || '').trim();
  if (!trimmed) return null;

  const [byStaffEmail] = await pool.query(
    `SELECT ${USER_COLUMNS}
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE u.email IS NOT NULL
        AND u.email = ?
        AND r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')`,
    [trimmed]
  );
  if (byStaffEmail[0]) return byStaffEmail[0];

  const cifNorm = normalizeCif(trimmed);
  const [byCIF] = await pool.query(
    `SELECT ${USER_COLUMNS}, emp.cif
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
       JOIN ge_contactos c ON c.idcontacto = u.id_contacto
       JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
       JOIN ge_empresas emp ON emp.idempresa = d.idempresa
      WHERE r.nombre = 'EMPRESA'
        AND emp.cif = ?
      LIMIT 1`,
    [cifNorm]
  );
  if (byCIF[0]) return byCIF[0];

  const dniNorm = normalizeDni(trimmed);
  const [byDni] = await pool.query(
    `SELECT ${USER_COLUMNS}, a.dni
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
       JOIN gf_alumnosfct a ON a.idalumno = u.id_alumno
      WHERE r.nombre = 'ALUMNO'
        AND a.dni = ?
      LIMIT 1`,
    [dniNorm]
  );
  return byDni[0] ?? null;
}

exports.findUserByIdentifier = findUserByIdentifier;

// POST /auth/login — accepts both 'email' and 'username' fields for compatibility
exports.loginWithCredentials = async function (req, res) {
  const identifier = (req.body.email || req.body.username || '').trim();
  const { password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const wait = loginRateLimiter.retryAfter(ip, identifier);
  if (wait > 0) {
    res.set('Retry-After', String(wait));
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${Math.ceil(wait / 60)} minuto(s).`,
      code: 'TOO_MANY_ATTEMPTS',
    });
  }

  const user = await findUserByIdentifier(identifier);

  if (!user) {
    loginRateLimiter.recordFailure(ip, identifier);
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  // The password is checked before the account state so that the response
  // does not reveal whether a deactivated account exists.
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    loginRateLimiter.recordFailure(ip, identifier);
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }
  if (!user.activo) {
    return res.status(403).json({ error: 'La cuenta está desactivada. Contacte con el administrador.' });
  }

  loginRateLimiter.recordSuccess(ip, identifier);
  return res.json(buildResponse(user));
};

// POST /auth/changePassword
// The current password is mandatory, except during the forced change that
// follows a login with a temporary password (must_change_password = 1, read
// from the database, never from the request).
exports.changePassword = async function (req, res) {
  const idUsuario = req.user.id;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  const [rows] = await pool.query(
    'SELECT password_hash, must_change_password FROM dual_usuarios WHERE id_usuario = ?',
    [idUsuario]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const forcedChange = !!rows[0].must_change_password;
  if (!forcedChange && !currentPassword) {
    return res.status(400).json({ error: 'Debes indicar la contraseña actual.' });
  }
  if (currentPassword) {
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }
  }
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
    return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual.' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    'UPDATE dual_usuarios SET password_hash = ?, must_change_password = 0 WHERE id_usuario = ?',
    [hash, idUsuario]
  );

  return res.json({ message: 'Contraseña actualizada correctamente.' });
};

// GET /auth/me
exports.getMe = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.must_change_password,
            r.nombre AS rol, u.id_contacto, u.id_alumno, emp.cif, a.dni
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
       LEFT JOIN ge_contactos c ON c.idcontacto = u.id_contacto
       LEFT JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
       LEFT JOIN ge_empresas emp ON emp.idempresa = d.idempresa
       LEFT JOIN gf_alumnosfct a ON a.idalumno = u.id_alumno
      WHERE u.id_usuario = ?`,
    [req.user.id]
  );
  const u = rows[0];
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
  return res.json({
    id: u.id_usuario,
    nombre: u.nombre_mostrar,
    email: u.email,
    rol: u.rol,
    must_change_password: !!u.must_change_password,
    id_contacto: u.id_contacto,
    id_alumno: u.id_alumno,
    cif: u.cif || null,
    dni: u.dni || null,
  });
};

// GET /usuarios — admin/coordinador: full user list
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.activo, u.must_change_password,
            r.nombre AS rol, u.id_contacto, u.id_alumno
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      ORDER BY u.id_usuario`
  );
  return res.json(rows);
};

// POST /usuarios/:id/resetPassword — generates a temporary password returned once to the admin.
// Staff resets are audited (entidad USUARIO). Student and company resets are not.
exports.resetPassword = async function (req, res) {
  const idUsuario = parseInt(req.params.id, 10);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({ error: 'Identificador no válido.', code: 'ID_INVALIDO' });
  }

  const crypto = require('crypto');
  const tempPassword = crypto.randomBytes(8).toString('hex');
  const hash = await bcrypt.hash(tempPassword, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT u.id_usuario, u.activo, r.nombre AS rol
         FROM dual_usuarios u
         JOIN dual_roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ?
        FOR UPDATE`,
      [idUsuario],
    );
    const target = rows[0];
    if (!target) {
      await conn.rollback();
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'NOT_FOUND' });
    }
    await conn.query(
      'UPDATE dual_usuarios SET password_hash = ?, must_change_password = 1 WHERE id_usuario = ?',
      [hash, idUsuario],
    );
    if (target.rol === 'ADMINISTRADOR' || target.rol === 'COORDINADOR') {
      await recordEvent(conn, {
        entidad: 'USUARIO',
        id: idUsuario,
        accion: 'RESETEAR_PASSWORD',
        antes: target.rol,
        despues: target.rol,
        user: req.user,
        detalle: { activo: Number(target.activo) === 1 ? 1 : 0 },
      });
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      return res.status(503).json({
        error: 'La gestión de personal no está disponible: falta aplicar la migración 019 de la base de datos.',
        code: 'MIGRACION_PENDIENTE',
      });
    }
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }

  // The temporary password is returned only once and never stored in plaintext.
  return res.json({ message: 'Contraseña restablecida.', newPassword: tempPassword });
};
