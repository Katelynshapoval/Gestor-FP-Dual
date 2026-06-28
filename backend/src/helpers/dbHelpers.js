const pool = require('../db/pool');

// Returns the single active convocatoria or null
async function getActiveConvocatoria() {
  const [rows] = await pool.query(
    'SELECT id_convocatoria, nombre, fecha_inicio, fecha_fin FROM dual_convocatorias WHERE activa = 1 LIMIT 1'
  );
  return rows[0] || null;
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

// Calls a procedure that intentionally returns one result row (e.g. sp_reservar_alumno)
async function callProcedureWithResult(conn, name, params) {
  const placeholders = params.map(() => '?').join(', ');
  const [results] = await conn.query(`CALL ${name}(${placeholders})`, params);
  // results[0] is the first result set (array of rows)
  return Array.isArray(results[0]) ? results[0][0] : null;
}

// Maps MySQL errors to HTTP-friendly objects
function mapSqlError(err) {
  if (err.sqlState === '45000') {
    return { status: 400, message: err.message };
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return { status: 409, message: 'Ya existe un registro con esos datos.' };
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
  getActiveConvocatoria,
  getCompanyIdFromUser,
  getTipoDocumentoId,
  callProcedure,
  callProcedureWithResult,
  mapSqlError,
  sendSqlError,
};
