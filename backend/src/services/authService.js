const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { signToken } = require('../middleware/auth');
const { normalizeCif, normalizeDni } = require('../helpers/dbHelpers');

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
        AND UPPER(TRIM(emp.cif)) = ?
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
        AND UPPER(TRIM(a.dni)) = ?
      LIMIT 1`,
    [dniNorm]
  );
  return byDni[0] ?? null;
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
