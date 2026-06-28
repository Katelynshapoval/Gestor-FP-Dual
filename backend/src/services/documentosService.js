const pool = require('../db/pool');
const { sendSqlError, getCompanyIdFromUser } = require('../helpers/dbHelpers');

// Upload a document for a student application
// POST /documentos/alumno/:idSolicitud/:tipo   (tipo = cv | anexo2)
exports.uploadAlumno = async function (req, res) {
  const idSolicitudAlumno = parseInt(req.params.idSolicitud, 10);
  const tipo = req.params.tipo.toUpperCase(); // CV | ANEXO_2
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No se ha subido ningún archivo.' });

  const TIPO_MAP = { CV: 1, ANEXO_2: 2 };
  const idTipo = TIPO_MAP[tipo];
  if (!idTipo) return res.status(400).json({ error: 'Tipo de documento no válido. Use cv o anexo2.' });

  try {
    const [results] = await pool.query(
      'CALL sp_guardar_documento(?, NULL, NULL, ?, ?)',
      [idSolicitudAlumno, idTipo, file.buffer]
    );
    const idDocumento = results[0]?.[0]?.id_documento ?? null;
    return res.json({ message: 'Documento subido correctamente.', id_documento: idDocumento });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// Upload a convenio for a company application
// POST /documentos/empresa/:idSolicitud/convenio
exports.uploadEmpresa = async function (req, res) {
  const idSolicitudEmpresa = parseInt(req.params.idSolicitud, 10);
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No se ha subido ningún archivo.' });

  // Verify the company user owns this solicitud
  if (req.user.rol === 'EMPRESA') {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    const [rows] = await pool.query(
      'SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?',
      [idSolicitudEmpresa]
    );
    if (!rows[0] || rows[0].id_empresa !== idEmpresa) {
      return res.status(403).json({ error: 'No tiene permiso para subir documentos a esta solicitud.' });
    }
  }

  try {
    const [results] = await pool.query(
      'CALL sp_guardar_documento(NULL, ?, NULL, 3, ?)',
      [idSolicitudEmpresa, file.buffer]
    );
    const idDocumento = results[0]?.[0]?.id_documento ?? null;
    return res.json({ message: 'Convenio subido correctamente.', id_documento: idDocumento });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// Upload ANEXO_H for a reservation
// POST /documentos/reserva/:idReserva/anexoh
exports.uploadReserva = async function (req, res) {
  const idReserva = parseInt(req.params.idReserva, 10);
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No se ha subido ningún archivo.' });

  // If EMPRESA user, verify they own this reserva
  if (req.user.rol === 'EMPRESA') {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    const [rows] = await pool.query(
      `SELECT se.id_empresa
         FROM dual_reservas r
         JOIN dual_solicitud_empresa_especialidades see
           ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
        WHERE r.id_reserva = ?`,
      [idReserva]
    );
    if (!rows[0] || rows[0].id_empresa !== idEmpresa) {
      return res.status(403).json({ error: 'No tiene permiso para subir documentos a esta reserva.' });
    }
  }

  try {
    const [results] = await pool.query(
      'CALL sp_guardar_documento(NULL, NULL, ?, 4, ?)',
      [idReserva, file.buffer]
    );
    const idDocumento = results[0]?.[0]?.id_documento ?? null;
    return res.json({ message: 'Anexo H subido correctamente.', id_documento: idDocumento });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// GET /documentos/:id/descargar — download document blob
exports.descargar = async function (req, res) {
  const id = parseInt(req.params.id, 10);

  // Authorization: EMPRESA users can only download their own docs
  let query = 'SELECT d.archivo, td.nombre AS tipo FROM dual_documentos d JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento WHERE d.id_documento = ?';
  const params = [id];

  if (req.user.rol === 'EMPRESA') {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    query = `
      SELECT d.archivo, td.nombre AS tipo
        FROM dual_documentos d
        JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       WHERE d.id_documento = ?
         AND (
           (d.id_solicitud_empresa IS NOT NULL AND EXISTS (
             SELECT 1 FROM dual_solicitudes_empresa se WHERE se.id_solicitud_empresa = d.id_solicitud_empresa AND se.id_empresa = ?
           ))
           OR (d.id_reserva IS NOT NULL AND EXISTS (
             SELECT 1 FROM dual_reservas r
             JOIN dual_solicitud_empresa_especialidades see ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
             JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
             WHERE r.id_reserva = d.id_reserva AND se.id_empresa = ?
           ))
         )
    `;
    params.push(idEmpresa, idEmpresa);
  }

  const [rows] = await pool.query(query, params);
  if (!rows[0] || !rows[0].archivo) {
    return res.status(404).json({ error: 'Documento no encontrado.' });
  }

  const pdf = Buffer.isBuffer(rows[0].archivo) ? rows[0].archivo : Buffer.from(rows[0].archivo);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Content-Disposition', `inline; filename="documento_${id}.pdf"`);
  return res.send(pdf);
};

// POST /documentos/:id/validar
exports.validar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('CALL sp_validar_documento(?)', [id]);
    return res.json({ message: 'Documento validado correctamente.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /documentos/:id/rechazar
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { motivo } = req.body;
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debe indicar el motivo del rechazo.' });
  }
  try {
    await pool.query('CALL sp_rechazar_documento(?, ?)', [id, motivo.trim()]);
    return res.json({ message: 'Documento rechazado.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};
