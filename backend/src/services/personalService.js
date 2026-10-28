// Staff accounts (ADMINISTRADOR and COORDINADOR). Administración creates them
// here; there is no public registration. Deactivation is activo = 0, the same
// flag requireAuth already rejects. Rows are never deleted (FK RESTRICT and
// the audit trail).
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { sendSqlError } = require('../helpers/dbHelpers');
const { recordEvent } = require('./auditLog');

const ROLES = ['ADMINISTRADOR', 'COORDINADOR'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function httpError(status, code, error) {
  const err = new Error(error);
  err.status = status;
  err.code = code;
  return err;
}

function sendError(res, err) {
  if (err.status && err.code) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email.', code: 'EMAIL_DUPLICADO' });
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(503).json({
      error: 'La gestión de personal no está disponible: falta aplicar la migración 019 de la base de datos.',
      code: 'MIGRACION_PENDIENTE',
    });
  }
  return sendSqlError(res, err);
}

async function transact(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const value = await work(conn);
    await conn.commit();
    return value;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function activoDe(row) {
  return Number(row.activo) === 1;
}

function fila(row) {
  return {
    id_usuario: row.id_usuario,
    nombre_mostrar: row.nombre_mostrar,
    email: row.email,
    rol: row.rol,
    activo: activoDe(row),
    must_change_password: Number(row.must_change_password) === 1,
  };
}

function parseId(raw) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, 'ID_INVALIDO', 'Identificador no válido.');
  }
  return id;
}

function parseNombre(value, required) {
  if (value === undefined) {
    if (required) throw httpError(400, 'NOMBRE_OBLIGATORIO', 'El nombre es obligatorio.');
    return undefined;
  }
  const nombre = String(value).trim();
  if (!nombre) throw httpError(400, 'NOMBRE_OBLIGATORIO', 'El nombre es obligatorio.');
  if (nombre.length > 100) throw httpError(400, 'NOMBRE_LARGO', 'El nombre no puede superar 100 caracteres.');
  return nombre;
}

function parseEmail(value, required) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, 'EMAIL_INVALIDO', 'El email no es válido.');
    return undefined;
  }
  const email = String(value).trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 100) {
    throw httpError(400, 'EMAIL_INVALIDO', 'El email no es válido.');
  }
  return email;
}

function parseRol(value, required) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, 'ROL_INVALIDO', 'El rol solo puede ser administrador o coordinador.');
    return undefined;
  }
  const rol = String(value).trim().toUpperCase();
  if (!ROLES.includes(rol)) {
    throw httpError(400, 'ROL_INVALIDO', 'El rol solo puede ser administrador o coordinador.');
  }
  return rol;
}

async function idRol(conn, rol) {
  const [rows] = await conn.query('SELECT id_rol FROM dual_roles WHERE nombre = ?', [rol]);
  if (!rows[0]) throw httpError(500, 'ROL_DESCONOCIDO', 'El catálogo de roles no está completo.');
  return rows[0].id_rol;
}

// Locks every active administrator, in id order, before the decision that
// could leave none. Two administrators changing each other then serialize
// instead of both succeeding.
async function idsAdminsActivos(conn) {
  const [rows] = await conn.query(
    `SELECT u.id_usuario
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE r.nombre = 'ADMINISTRADOR' AND u.activo = 1
      ORDER BY u.id_usuario
      FOR UPDATE`,
  );
  return rows.map((row) => row.id_usuario);
}

async function lockUsuario(conn, id) {
  const [rows] = await conn.query(
    `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.activo, u.must_change_password,
            r.nombre AS rol
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ?
      FOR UPDATE`,
    [id],
  );
  const row = rows[0];
  if (!row || !ROLES.includes(row.rol)) {
    throw httpError(404, 'NOT_FOUND', 'No hay una cuenta de personal con ese identificador.');
  }
  return row;
}

async function emailOcupado(conn, email, exceptoId) {
  const [rows] = await conn.query(
    'SELECT id_usuario FROM dual_usuarios WHERE email = ? AND id_usuario <> ? FOR UPDATE',
    [email, exceptoId || 0],
  );
  if (rows[0]) throw httpError(409, 'EMAIL_DUPLICADO', 'Ya existe una cuenta con ese email.');
}

function esUltimoAdmin(adminIds, target, siguienteRol, siguienteActivo) {
  const era = target.rol === 'ADMINISTRADOR' && activoDe(target);
  const sera = siguienteRol === 'ADMINISTRADOR' && siguienteActivo;
  if (!era || sera) return false;
  return adminIds.every((id) => id === target.id_usuario);
}

function tempPassword() {
  return crypto.randomBytes(8).toString('hex');
}

// GET /usuarios/personal
exports.list = async function (req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id_usuario, u.nombre_mostrar, u.email, u.activo, u.must_change_password,
              r.nombre AS rol
         FROM dual_usuarios u
         JOIN dual_roles r ON r.id_rol = u.id_rol
        WHERE r.nombre IN ('ADMINISTRADOR', 'COORDINADOR')
        ORDER BY u.activo DESC, r.nombre, u.nombre_mostrar, u.id_usuario`,
    );
    return res.json(rows.map(fila));
  } catch (err) {
    return sendError(res, err);
  }
};

// POST /usuarios/personal { nombre, email, rol } → { usuario, newPassword }
exports.create = async function (req, res) {
  try {
    const nombre = parseNombre(req.body?.nombre, true);
    const email = parseEmail(req.body?.email, true);
    const rol = parseRol(req.body?.rol, true);
    const plain = tempPassword();
    const hash = await bcrypt.hash(plain, 10);

    const usuario = await transact(async (conn) => {
      const rolId = await idRol(conn, rol);
      await emailOcupado(conn, email, 0);
      const [result] = await conn.query(
        `INSERT INTO dual_usuarios
           (nombre_mostrar, email, password_hash, id_rol, id_contacto, id_alumno, activo, must_change_password)
         VALUES (?, ?, ?, ?, NULL, NULL, 1, 1)`,
        [nombre, email, hash, rolId],
      );
      await recordEvent(conn, {
        entidad: 'USUARIO',
        id: result.insertId,
        accion: 'ALTA',
        despues: rol,
        user: req.user,
        detalle: { activo: 1 },
      });
      return fila({
        id_usuario: result.insertId,
        nombre_mostrar: nombre,
        email,
        rol,
        activo: 1,
        must_change_password: 1,
      });
    });

    return res.status(201).json({ usuario, newPassword: plain });
  } catch (err) {
    return sendError(res, err);
  }
};

// PATCH /usuarios/personal/:id { nombre?, email?, rol? }
exports.update = async function (req, res) {
  try {
    const id = parseId(req.params.id);
    const body = req.body || {};
    const touches = ['nombre', 'email', 'rol'].filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (touches.length === 0) {
      throw httpError(400, 'SIN_CAMBIOS', 'No hay datos que guardar.');
    }
    const nombre = parseNombre(body.nombre, false);
    const email = parseEmail(body.email, false);
    const rol = parseRol(body.rol, false);

    const usuario = await transact(async (conn) => {
      const adminIds = await idsAdminsActivos(conn);
      const target = await lockUsuario(conn, id);
      const siguienteNombre = nombre === undefined ? target.nombre_mostrar : nombre;
      const siguienteEmail = email === undefined ? target.email : email;
      const siguienteRol = rol === undefined ? target.rol : rol;

      if (siguienteRol !== target.rol && target.id_usuario === req.user.id) {
        throw httpError(400, 'ROL_PROPIO', 'No puedes cambiar tu propio rol.');
      }
      if (esUltimoAdmin(adminIds, target, siguienteRol, activoDe(target))) {
        throw httpError(400, 'ULTIMO_ADMINISTRADOR', 'Tiene que quedar al menos un administrador activo.');
      }
      if (siguienteEmail !== target.email) await emailOcupado(conn, siguienteEmail, target.id_usuario);

      const nombreCambio = siguienteNombre !== target.nombre_mostrar;
      const emailCambio = siguienteEmail !== target.email;
      const rolCambio = siguienteRol !== target.rol;
      if (!nombreCambio && !emailCambio && !rolCambio) return fila(target);

      const rolId = await idRol(conn, siguienteRol);
      await conn.query(
        'UPDATE dual_usuarios SET nombre_mostrar = ?, email = ?, id_rol = ? WHERE id_usuario = ?',
        [siguienteNombre, siguienteEmail, rolId, target.id_usuario],
      );
      const detalle = { activo: activoDe(target) ? 1 : 0 };
      if (nombreCambio) detalle.nombre = true;
      if (emailCambio) detalle.email = true;
      await recordEvent(conn, {
        entidad: 'USUARIO',
        id: target.id_usuario,
        accion: rolCambio ? 'CAMBIAR_ROL' : 'CAMBIAR_DATOS',
        antes: target.rol,
        despues: siguienteRol,
        user: req.user,
        detalle,
      });
      return fila({
        ...target,
        nombre_mostrar: siguienteNombre,
        email: siguienteEmail,
        rol: siguienteRol,
      });
    });

    return res.json(usuario);
  } catch (err) {
    return sendError(res, err);
  }
};

async function cambiarActivo(req, res, activo) {
  const id = parseId(req.params.id);
  const usuario = await transact(async (conn) => {
    const adminIds = activo ? null : await idsAdminsActivos(conn);
    const target = await lockUsuario(conn, id);
    if (!activo && target.id_usuario === req.user.id) {
      throw httpError(400, 'BAJA_PROPIA', 'No puedes darte de baja a ti mismo.');
    }
    if (!activo && !activoDe(target)) {
      throw httpError(400, 'YA_INACTIVO', 'Esta cuenta ya está de baja.');
    }
    if (activo && activoDe(target)) {
      throw httpError(400, 'YA_ACTIVA', 'Esta cuenta ya está activa.');
    }
    if (!activo && esUltimoAdmin(adminIds, target, target.rol, false)) {
      throw httpError(400, 'ULTIMO_ADMINISTRADOR', 'Tiene que quedar al menos un administrador activo.');
    }
    await conn.query('UPDATE dual_usuarios SET activo = ? WHERE id_usuario = ?', [activo ? 1 : 0, target.id_usuario]);
    await recordEvent(conn, {
      entidad: 'USUARIO',
      id: target.id_usuario,
      accion: activo ? 'REACTIVAR' : 'BAJA',
      antes: activo ? 'INACTIVO' : target.rol,
      despues: activo ? target.rol : 'INACTIVO',
      user: req.user,
      detalle: { activo: activo ? 1 : 0 },
    });
    return fila({ ...target, activo: activo ? 1 : 0 });
  });
  return res.json(usuario);
}

// POST /usuarios/personal/:id/baja
exports.baja = async function (req, res) {
  try {
    return await cambiarActivo(req, res, false);
  } catch (err) {
    return sendError(res, err);
  }
};

// POST /usuarios/personal/:id/reactivar
exports.reactivar = async function (req, res) {
  try {
    return await cambiarActivo(req, res, true);
  } catch (err) {
    return sendError(res, err);
  }
};
