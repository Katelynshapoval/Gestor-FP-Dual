// Ciclos (dual_especialidades). Everyone reads the active ones (the public
// forms list them); administrators list all of them, add new ones, rename
// them and switch them on or off in Configuración › Ciclos.
//
// A ciclo is never deleted: applications, offers and students point at it.
// Its code and shift identify it in those records, so they change only while
// nothing uses it; the name and the on/off switch can always change. A ciclo
// switched off disappears from the forms; existing records keep it.
const pool = require('../db/pool');
const { inTransaction } = require('../db/transaction');
const { sendSqlError } = require('../helpers/dbHelpers');

const TURNOS = { 0: 'DIURNO', 1: 'VESPERTINO' };
const MAX_CODIGO = 20;
const MAX_NOMBRE = 150;

class CicloError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// GET /especialidades — all active specialities
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT id_especialidad, codigo, nombre,
            CASE turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
            activa
       FROM dual_especialidades
      WHERE activa = 1
      ORDER BY codigo, turno`
  );
  return res.json(rows);
};

// How many records point at a ciclo: student applications, company offers
// and students in the shared student table. The last one only counts the
// foreign key gf_alumnosfct → dual_especialidades; an application's own
// ciclo is always read from dual_solicitudes_alumno (DB-01).
const USO_SQL = `
  (SELECT COUNT(*) FROM dual_solicitudes_alumno sa WHERE sa.id_especialidad = e.id_especialidad) AS solicitudes,
  (SELECT COUNT(*) FROM dual_solicitud_empresa_especialidades ee WHERE ee.id_especialidad = e.id_especialidad) AS ofertas,
  (SELECT COUNT(*) FROM gf_alumnosfct gf WHERE gf.id_especialidad_dual = e.id_especialidad) AS alumnos`;

function fila(r) {
  const solicitudes = Number(r.solicitudes) || 0;
  const ofertas = Number(r.ofertas) || 0;
  const alumnos = Number(r.alumnos) || 0;
  return {
    id_especialidad: r.id_especialidad,
    codigo: r.codigo,
    nombre: r.nombre,
    turno: Number(r.turno),
    turno_nombre: TURNOS[Number(r.turno)],
    activa: Boolean(Number(r.activa)),
    solicitudes,
    ofertas,
    alumnos,
    en_uso: solicitudes + ofertas + alumnos > 0,
  };
}

// GET /especialidades/todas — ADMINISTRADOR: active and inactive, with their use.
exports.listAdmin = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT e.id_especialidad, e.codigo, e.nombre, e.turno, e.activa, ${USO_SQL}
       FROM dual_especialidades e
      ORDER BY e.activa DESC, e.codigo, e.turno`
  );
  return res.json({ ciclos: rows.map(fila) });
};

// Validates the fields present in `body`; `parcial` allows leaving some out (edit).
function validar(body = {}, { parcial = false } = {}) {
  const out = {};
  if (!parcial || body.codigo !== undefined) {
    const codigo = String(body.codigo ?? '').trim().toUpperCase();
    if (!codigo) throw new CicloError(400, 'Escribe el código del ciclo.', 'CODIGO_OBLIGATORIO');
    if (codigo.length > MAX_CODIGO) throw new CicloError(400, `El código tiene como máximo ${MAX_CODIGO} caracteres.`, 'CODIGO_LARGO');
    if (!/^[A-Z0-9][A-Z0-9 ._-]*$/.test(codigo)) {
      throw new CicloError(400, 'El código solo admite letras, números, espacios, puntos, guiones y guiones bajos.', 'CODIGO_NO_VALIDO');
    }
    out.codigo = codigo;
  }
  if (!parcial || body.nombre !== undefined) {
    const nombre = String(body.nombre ?? '').trim().replace(/\s+/g, ' ');
    if (nombre.length < 3) throw new CicloError(400, 'Escribe el nombre del ciclo.', 'NOMBRE_OBLIGATORIO');
    if (nombre.length > MAX_NOMBRE) throw new CicloError(400, `El nombre tiene como máximo ${MAX_NOMBRE} caracteres.`, 'NOMBRE_LARGO');
    out.nombre = nombre;
  }
  if (!parcial || body.turno !== undefined) {
    const turno = Number(body.turno);
    if (!(turno in TURNOS) || String(body.turno).trim() === '') {
      throw new CicloError(400, 'Elige el turno: diurno o vespertino.', 'TURNO_NO_VALIDO');
    }
    out.turno = turno;
  }
  if (body.activa !== undefined) {
    if (typeof body.activa !== 'boolean') throw new CicloError(400, 'Valor de «activo» no válido.', 'ACTIVA_NO_VALIDA');
    out.activa = body.activa ? 1 : 0;
  }
  return out;
}

function enviarError(res, err) {
  if (err instanceof CicloError) return res.status(err.status).json({ error: err.message, code: err.code });
  return sendSqlError(res, err);
}

// POST /especialidades — ADMINISTRADOR: { codigo, nombre, turno }
exports.create = async function (req, res) {
  try {
    const v = validar(req.body);
    const [ins] = await pool.query(
      'INSERT INTO dual_especialidades (codigo, nombre, turno, activa) VALUES (?, ?, ?, 1)',
      [v.codigo, v.nombre, v.turno],
    );
    return res.status(201).json({ message: `Ciclo «${v.nombre}» añadido.`, id_especialidad: ins.insertId });
  } catch (err) {
    return enviarError(res, err);
  }
};

// PUT /especialidades/:id — ADMINISTRADOR: any of { codigo, nombre, turno, activa }
exports.update = async function (req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Identificador no válido.', code: 'ID_INVALIDO' });
  try {
    const v = validar(req.body, { parcial: true });
    if (!Object.keys(v).length) throw new CicloError(400, 'No hay nada que guardar.', 'SIN_CAMBIOS');
    const nombre = await inTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT e.id_especialidad, e.codigo, e.nombre, e.turno, e.activa, ${USO_SQL}
           FROM dual_especialidades e
          WHERE e.id_especialidad = ?
          FOR UPDATE`,
        [id],
      );
      if (!rows[0]) throw new CicloError(404, 'Ciclo no encontrado.', 'NOT_FOUND');
      const actual = fila(rows[0]);
      const cambiaIdentidad = (v.codigo !== undefined && v.codigo !== actual.codigo)
        || (v.turno !== undefined && v.turno !== actual.turno);
      if (cambiaIdentidad && actual.en_uso) {
        throw new CicloError(409,
          'Este ciclo ya tiene solicitudes, ofertas o alumnos: su código y su turno no se pueden cambiar. Puedes cambiar el nombre o desactivarlo y añadir uno nuevo.',
          'CICLO_EN_USO');
      }
      const campos = Object.keys(v);
      await conn.query(
        `UPDATE dual_especialidades SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id_especialidad = ?`,
        [...campos.map((c) => v[c]), id],
      );
      return v.nombre ?? actual.nombre;
    });
    return res.json({ message: `Ciclo «${nombre}» guardado.` });
  } catch (err) {
    return enviarError(res, err);
  }
};

exports.TURNOS = TURNOS;
