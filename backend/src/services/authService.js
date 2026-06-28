const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { signToken } = require('../middleware/auth');

// Builds the JWT payload and the public user object from a database row
function buildResponse(user) {
  const payload = {
    id: user.id_usuario,
    email: user.email,
    nombre: user.nombre_mostrar,
    rol: user.rol,
    id_contacto: user.id_contacto,
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
    },
  };
}

// Looks up a user by email first, then falls back to company CIF lookup
async function findUserByIdentifier(identifier) {
  const [byEmail] = await pool.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.password_hash,
            u.activo, u.must_change_password,
            r.nombre AS rol, u.id_contacto
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE u.email = ?`,
    [identifier]
  );
  if (byEmail[0]) return byEmail[0];

  // Companies log in using their CIF (case-insensitive) instead of an email
  const cifNorm = identifier.toUpperCase();
  const [byCIF] = await pool.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.password_hash,
            u.activo, u.must_change_password,
            r.nombre AS rol, u.id_contacto
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
       JOIN ge_contactos c ON c.idcontacto = u.id_contacto
       JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
       JOIN ge_empresas emp ON emp.idempresa = d.idempresa
      WHERE UPPER(emp.cif) = ?
      LIMIT 1`,
    [cifNorm]
  );
  return byCIF[0] ?? null;
}

// POST /auth/login — accepts both 'email' and 'username' fields for compatibility
exports.loginWithCredentials = async function (req, res) {
  const identifier = (req.body.email || req.body.username || '').trim();
  const { password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
  }

  const user = await findUserByIdentifier(identifier);

  if (!user) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }
  if (!user.activo) {
    return res.status(403).json({ error: 'La cuenta está desactivada. Contacte con el administrador.' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  return res.json(buildResponse(user));
};

// POST /auth/changePassword — skips currentPassword check when in must_change_password flow
exports.changePassword = async function (req, res) {
  const idUsuario = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  const [rows] = await pool.query(
    'SELECT password_hash FROM dual_usuarios WHERE id_usuario = ?',
    [idUsuario]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });

  if (currentPassword) {
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }
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
            r.nombre AS rol, u.id_contacto
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
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
  });
};

// GET /usuarios — admin/coordinador: full user list
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.activo, u.must_change_password,
            r.nombre AS rol, u.id_contacto
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      ORDER BY u.id_usuario`
  );
  return res.json(rows);
};

// POST /usuarios/:id/resetPassword — generates a temporary password returned once to the admin
exports.resetPassword = async function (req, res) {
  const idUsuario = parseInt(req.params.id, 10);

  const crypto = require('crypto');
  const tempPassword = crypto.randomBytes(8).toString('hex');

  const hash = await bcrypt.hash(tempPassword, 10);
  const [result] = await pool.query(
    'UPDATE dual_usuarios SET password_hash = ?, must_change_password = 1 WHERE id_usuario = ?',
    [hash, idUsuario]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

  // The temporary password is returned only once and never stored in plaintext
  return res.json({ message: 'Contraseña restablecida.', newPassword: tempPassword });
};
