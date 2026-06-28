const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { signToken } = require('../middleware/auth');

// Construye el payload JWT y la respuesta de usuario desde una fila de BD
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

// Busca un usuario por email o, si falla, por CIF de empresa (login tipo empresa)
async function findUserByIdentifier(identifier) {
  // Intenta por email primero
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

  // Intenta por CIF de empresa (el coordinador usa el CIF en minúsculas como identificador)
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

// POST /auth/login — login con email/CIF + contraseña
exports.loginWithCredentials = async function (req, res) {
  // Acepta tanto 'email' como 'username' para compatibilidad con el formulario empresa
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

// POST /auth/google — verificación server-side del token de Google
exports.loginWithGoogle = async function (req, res) {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Se requiere el token de Google.' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('GOOGLE_CLIENT_ID no configurado en variables de entorno.');
    return res.status(500).json({ error: 'Autenticación Google no configurada en el servidor.' });
  }

  let email;
  try {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload.email_verified) {
      return res.status(401).json({ error: 'El email de la cuenta Google no está verificado.' });
    }
    email = payload.email;
  } catch (err) {
    console.error('Error verificando token Google:', err.message);
    return res.status(401).json({ error: 'Token de Google inválido o expirado.' });
  }

  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.password_hash,
            u.activo, u.must_change_password,
            r.nombre AS rol, u.id_contacto
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE u.email = ?`,
    [email]
  );

  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Cuenta Google no autorizada. Contacta con el administrador.' });
  }
  if (!user.activo) {
    return res.status(403).json({ error: 'La cuenta está desactivada.' });
  }

  return res.json(buildResponse(user));
};

// POST /auth/changePassword — usuario autenticado cambia su contraseña
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

  // currentPassword es obligatoria si el usuario no está en flujo must_change_password
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

// GET /auth/me — perfil del usuario autenticado
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

// GET /usuarios — admin/coordinador: listado de todos los usuarios
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

// POST /usuarios/:id/resetPassword — admin: resetear contraseña de empresa
exports.resetPassword = async function (req, res) {
  const idUsuario = parseInt(req.params.id, 10);

  // Genera contraseña temporal segura con crypto
  const crypto = require('crypto');
  const tempPassword = crypto.randomBytes(8).toString('hex'); // 16 chars hex

  const hash = await bcrypt.hash(tempPassword, 10);
  const [result] = await pool.query(
    'UPDATE dual_usuarios SET password_hash = ?, must_change_password = 1 WHERE id_usuario = ?',
    [hash, idUsuario]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

  // La contraseña temporal se devuelve UNA sola vez al admin, nunca se persiste en claro
  return res.json({ message: 'Contraseña restablecida.', newPassword: tempPassword });
};
