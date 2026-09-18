const pool = require('../db/pool');

function normalizeCif(cif) {
  return String(cif || '').trim().toUpperCase();
}

function normalizeDni(dni) {
  return String(dni || '').trim().toUpperCase();
}

function cifValido(cif) {
  const value = normalizeCif(cif);
  if (!/^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(value)) return false;

  let sumaPar = 0;
  let sumaImpar = 0;
  const numero = value.substring(1, 8);

  for (let i = 0; i < numero.length; i++) {
    const n = parseInt(numero[i], 10);
    if (i % 2 === 0) {
      let doble = n * 2;
      if (doble > 9) doble -= 9;
      sumaImpar += doble;
    } else {
      sumaPar += n;
    }
  }

  const letras = 'JABCDEFGHI';
  const letra = value[0];
  const valorControl = value[8];
  const valorCalculado = (10 - ((sumaPar + sumaImpar) % 10)) % 10;

  if ('PQRSNW'.includes(letra)) return valorControl === letras[valorCalculado];
  if ('ABEH'.includes(letra)) return valorControl === String(valorCalculado);
  return valorControl === String(valorCalculado) || valorControl === letras[valorCalculado];
}

// Returns the single active convocatoria or null
async function getActiveConvocatoria() {
  const [rows] = await pool.query(
    'SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1 LIMIT 1'
  );
  return rows[0] || null;
}

// Resolves student id from the authenticated ALUMNO user id
async function getStudentIdFromUser(idUsuario) {
  const [rows] = await pool.query(
    `SELECT u.id_alumno
       FROM dual_usuarios u
       JOIN dual_roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ?
        AND r.nombre = 'ALUMNO'`,
    [idUsuario]
  );
  return rows[0]?.id_alumno ?? null;
}

// Resolves company id from the authenticated EMPRESA user id
async function getCompanyIdFromUser(idUsuario) {
  const [rows] = await pool.query(
    `SELECT d.idempresa
       FROM dual_usuarios u
       JOIN ge_contactos c ON c.idcontacto = u.id_contacto
       JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
      WHERE u.id_usuario = ?`,
    [idUsuario]
  );
  return rows[0]?.idempresa ?? null;
}

// Returns the numeric id_tipo_documento for a given name (e.g. 'CV', 'ANEXO_2')
async function getTipoDocumentoId(nombre) {
  const [rows] = await pool.query(
    'SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = ?',
    [nombre]
  );
  return rows[0]?.id_tipo_documento ?? null;
}

// Calls a stored procedure that returns no business result set.
// Some SPs return a SELECT with a single id column — this discards it safely.
async function callProcedure(conn, name, params) {
  const placeholders = params.map(() => '?').join(', ');
  await conn.query(`CALL ${name}(${placeholders})`, params);
}

// mysql2 CALL payloads are nested result sets: [ [rows], extra, ... ]
function extractCallRow(results) {
  const matches = [];
  const queue = [results];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    if (current && typeof current === 'object' && current.id_reserva != null) {
      matches.push(current);
    }
  }
  return matches.length ? matches[matches.length - 1] : null;
}

// Calls a procedure that intentionally returns one result row (e.g. sp_reservar_alumno)
async function callProcedureWithResult(conn, name, params) {
  const placeholders = params.map(() => '?').join(', ');
  const [results] = await conn.query(`CALL ${name}(${placeholders})`, params);
  return extractCallRow(results);
}

// Maps MySQL errors to HTTP-friendly objects
function mapSqlError(err) {
  if (err.sqlState === '45000') {
    return { status: 400, message: err.message };
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return { status: 409, message: 'Ya existe un registro con esos datos.' };
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return { status: 400, message: err.message };
  }
  console.error('DB error:', err);
  return { status: 500, message: 'Error interno del servidor.' };
}

// Sends a standardised error response
function sendSqlError(res, err) {
  const mapped = mapSqlError(err);
  return res.status(mapped.status).json({ error: mapped.message });
}

module.exports = {
  normalizeCif,
  normalizeDni,
  cifValido,
  getActiveConvocatoria,
  getStudentIdFromUser,
  getCompanyIdFromUser,
  getTipoDocumentoId,
  callProcedure,
  callProcedureWithResult,
  extractCallRow,
  mapSqlError,
  sendSqlError,
};
