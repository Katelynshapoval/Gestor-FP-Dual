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

// Spanish DNI (8 digits + check letter) or NIE (X/Y/Z + 7 digits + letter).
function dniNieValido(value) {
  const v = normalizeDni(value);
  const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
  let numero;
  if (/^[0-9]{8}[A-Z]$/.test(v)) numero = parseInt(v.slice(0, 8), 10);
  else if (/^[XYZ][0-9]{7}[A-Z]$/.test(v)) numero = parseInt('XYZ'.indexOf(v[0]) + v.slice(1, 8), 10);
  else return false;
  return v[8] === letras[numero % 23];
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

// Unique keys whose clash the user can cause, in their words.
const DUPLICADOS = {
  uq_dd_actual: { status: 409, code: 'DOCUMENTO_CONCURRENTE', message: 'Este documento se acaba de guardar desde otra sesión. Recarga la página y vuelve a intentarlo.' },
  uq_dual_convocatorias_una_activa: { status: 409, code: 'CONVOCATORIA_ACTIVA', message: 'Ya hay otra convocatoria activa. Solo puede haber una.' },
  uq_dual_convocatorias_nombre: { status: 409, code: 'DUPLICADO', message: 'Ya existe una convocatoria con ese nombre.' },
  uq_plantilla_tipo_version: { status: 409, code: 'PLANTILLA_CONCURRENTE', message: 'Se acaba de subir otra plantilla de este tipo. Recarga la página y vuelve a intentarlo.' },
  uq_plantilla_activa: { status: 409, code: 'PLANTILLA_CONCURRENTE', message: 'Se acaba de subir otra plantilla de este tipo. Recarga la página y vuelve a intentarlo.' },
};

// CHECK constraints the user can reach through a form. The rest describe
// states the backend never writes: a generic message, the name only in the log.
const RESTRICCIONES = {
  chk_dual_convocatorias_fechas: 'La fecha de fin no puede ser anterior a la de inicio.',
  chk_dsee_cantidad_alumnos: 'El número de plazas no es válido.',
  chk_tipos_documento_familia: 'La familia de contrato solo se indica en documentos de una reserva.',
  chk_tipos_documento_firmas: 'Ese firmante no corresponde a quien pertenece el documento.',
  chk_tipos_documento_generado: 'Un documento añadido por el centro se genera desde una plantilla y debe indicar a quién pertenece.',
};

const nombreRestriccion = (err) => (String(err.sqlMessage || err.message).match(/(?:key|constraint) '([^']+)'/) || [])[1] || '';
const sinPrefijoTabla = (nombre) => nombre.split('.').pop();

// Maps MySQL errors to HTTP-friendly objects. Every message is in Spanish and
// none exposes table, column or constraint names.
function mapSqlError(err) {
  // SIGNAL from triggers and procedures: their messages are written for users.
  if (err.sqlState === '45000') {
    return { status: 400, message: err.message, code: 'REGLA_NEGOCIO' };
  }
  if (err.code === 'ER_DUP_ENTRY') {
    const conocido = DUPLICADOS[sinPrefijoTabla(nombreRestriccion(err))];
    return conocido ? { ...conocido } : { status: 409, message: 'Ya existe un registro con esos datos.', code: 'DUPLICADO' };
  }
  // InnoDB rolled the statement (deadlock: the whole transaction) back; nothing was saved.
  if (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT') {
    return { status: 409, message: 'Otra operación estaba modificando los mismos datos. Inténtalo de nuevo.', code: 'CONCURRENCIA' };
  }
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    const nombre = nombreRestriccion(err);
    if (!RESTRICCIONES[nombre]) console.error('DB restricción:', nombre || err.message);
    return { status: 400, message: RESTRICCIONES[nombre] || 'Los datos no cumplen las reglas de la aplicación.', code: 'RESTRICCION' };
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return { status: 409, message: 'Alguno de los datos elegidos ya no existe. Recarga la página y vuelve a intentarlo.', code: 'REFERENCIA' };
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return { status: 409, message: 'No se puede borrar: hay otros datos que dependen de este registro.', code: 'EN_USO' };
  }
  if (err.code === 'ER_DATA_TOO_LONG') {
    return { status: 400, message: 'Alguno de los textos es demasiado largo.', code: 'DEMASIADO_LARGO' };
  }
  if (['ER_TRUNCATED_WRONG_VALUE', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'ER_WARN_DATA_OUT_OF_RANGE', 'ER_BAD_NULL_ERROR'].includes(err.code)) {
    return { status: 400, message: 'Alguno de los datos no tiene un valor válido.', code: 'VALOR_NO_VALIDO' };
  }
  console.error('DB error:', err);
  return { status: 500, message: 'Error interno del servidor.', code: 'INTERNAL' };
}

// Sends a standardised error response
function sendSqlError(res, err) {
  const mapped = mapSqlError(err);
  return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
}

module.exports = {
  normalizeCif,
  normalizeDni,
  cifValido,
  dniNieValido,
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
