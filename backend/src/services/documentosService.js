const pool = require('../db/pool');
const { sendSqlError, getCompanyIdFromUser, getStudentIdFromUser } = require('../helpers/dbHelpers');

function extractIdDocumento(results) {
  const queue = [results];
  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    if (current && typeof current === 'object' && current.id_documento != null) {
      return current.id_documento;
    }
  }
  return null;
}

async function resolveDocumentoId(results, whereSql, params) {
  const fromCall = extractIdDocumento(results);
  if (fromCall != null) return fromCall;
  const [rows] = await pool.query(
    `SELECT id_documento FROM dual_documentos WHERE ${whereSql} ORDER BY id_documento DESC LIMIT 1`,
    params
  );
  return rows[0]?.id_documento ?? null;
}

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
    const idDocumento = await resolveDocumentoId(
      results,
      'id_solicitud_alumno = ? AND id_tipo_documento = ?',
      [idSolicitudAlumno, idTipo]
    );
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
    const idDocumento = await resolveDocumentoId(
      results,
      'id_solicitud_empresa = ? AND id_tipo_documento = 3',
      [idSolicitudEmpresa]
    );
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
    const idDocumento = await resolveDocumentoId(
      results,
      'id_reserva = ? AND id_tipo_documento = 4',
      [idReserva]
    );
    return res.json({ message: 'Anexo H subido correctamente.', id_documento: idDocumento });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

const TIPO_LABEL = {
  CONVENIO: 'Convenio',
  ANEXO_H: 'Anexo H',
  CV: 'CV',
  ANEXO_2: 'Anexo 2',
  OTRO: 'Documento',
};

async function loadDocumentoMeta(idDocumento) {
  const [rows] = await pool.query(
    `SELECT
        d.id_documento,
        d.archivo,
        d.id_solicitud_alumno,
        d.id_solicitud_empresa,
        d.id_reserva,
        d.motivo,
        td.nombre AS tipo,
        ev.nombre AS estado_validacion
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_documento = ?`,
    [idDocumento]
  );
  return rows[0] || null;
}

async function empresaOwnsDocumento(idEmpresa, doc) {
  if (!idEmpresa || !doc) return false;
  if (doc.id_solicitud_empresa) {
    const [rows] = await pool.query(
      'SELECT id_empresa FROM dual_solicitudes_empresa WHERE id_solicitud_empresa = ?',
      [doc.id_solicitud_empresa]
    );
    return rows[0]?.id_empresa === idEmpresa;
  }
  if (doc.id_reserva) {
    const [rows] = await pool.query(
      `SELECT se.id_empresa
         FROM dual_reservas r
         JOIN dual_solicitud_empresa_especialidades see
           ON see.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = see.id_solicitud_empresa
        WHERE r.id_reserva = ?`,
      [doc.id_reserva]
    );
    return rows[0]?.id_empresa === idEmpresa;
  }
  return false;
}

async function alumnoMayDownload(idAlumno, doc) {
  if (!idAlumno || !doc) return false;
  // Students may only download documents that belong to their own application
  // (CV / Anexo 2). Company convenio and Anexo H are not student downloads.
  if (!doc.id_solicitud_alumno) return false;
  if (!['CV', 'ANEXO_2'].includes(doc.tipo)) return false;
  const [rows] = await pool.query(
    'SELECT id_alumno FROM dual_solicitudes_alumno WHERE id_solicitud_alumno = ?',
    [doc.id_solicitud_alumno]
  );
  return rows[0]?.id_alumno === idAlumno;
}

async function canDownloadDocumento(user, doc) {
  if (!user || !doc) return false;
  if (user.rol === 'ADMINISTRADOR' || user.rol === 'COORDINADOR') return true;
  if (user.rol === 'EMPRESA') {
    const idEmpresa = await getCompanyIdFromUser(user.id);
    return empresaOwnsDocumento(idEmpresa, doc);
  }
  if (user.rol === 'ALUMNO') {
    const idAlumno = await getStudentIdFromUser(user.id);
    return alumnoMayDownload(idAlumno, doc);
  }
  return false;
}

// GET /documentos/:id/descargar — download document blob
exports.descargar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const doc = await loadDocumentoMeta(id);
  if (!doc || !doc.archivo) {
    return res.status(404).json({ error: 'Documento no encontrado.' });
  }
  if (!await canDownloadDocumento(req.user, doc)) {
    return res.status(403).json({ error: 'No tiene permiso para descargar este documento.' });
  }

  const pdf = Buffer.isBuffer(doc.archivo) ? doc.archivo : Buffer.from(doc.archivo);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Content-Disposition', `inline; filename="documento_${id}.pdf"`);
  return res.send(pdf);
};

// GET /documentos/empresa — EMPRESA: convenio + anexo H of own company
exports.getEmpresaDocumentos = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [solicitudes] = await pool.query(
    `SELECT
        d.id_documento,
        td.nombre AS tipo,
        ev.nombre AS estado_validacion,
        d.motivo,
        se.id_solicitud_empresa,
        c.nombre AS convocatoria,
        c.activa AS convocatoria_activa,
        se.fecha_solicitud
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = d.id_solicitud_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ?
        AND td.nombre = 'CONVENIO'
      ORDER BY c.activa DESC, se.fecha_solicitud DESC, d.id_documento DESC`,
    [idEmpresa]
  );

  const [reservas] = await pool.query(
    `SELECT
        d.id_documento,
        td.nombre AS tipo,
        ev.nombre AS estado_validacion,
        d.motivo,
        r.id_reserva,
        er.nombre AS estado_reserva,
        a.nombre AS alumno,
        a.dni AS dni_alumno,
        esp.nombre AS especialidad,
        c.nombre AS convocatoria
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
       JOIN dual_reservas r ON r.id_reserva = d.id_reserva
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ?
        AND td.nombre = 'ANEXO_H'
      ORDER BY r.id_reserva DESC`,
    [idEmpresa]
  );

  const [todasSolicitudes] = await pool.query(
    `SELECT se.id_solicitud_empresa, c.nombre AS convocatoria, c.activa AS convocatoria_activa, se.fecha_solicitud
       FROM dual_solicitudes_empresa se
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ?
      ORDER BY c.activa DESC, se.fecha_solicitud DESC`,
    [idEmpresa]
  );

  const present = (row, extra = {}) => ({
    id_documento: row.id_documento,
    tipo: row.tipo,
    tipo_mostrar: TIPO_LABEL[row.tipo] || row.tipo,
    estado_validacion: row.estado_validacion,
    motivo: row.motivo || null,
    convocatoria: row.convocatoria || null,
    ...extra,
  });

  const convenioBySolicitud = new Map(solicitudes.map((row) => [row.id_solicitud_empresa, row]));

  return res.json({
    solicitudes: todasSolicitudes.map((se) => {
      const row = convenioBySolicitud.get(se.id_solicitud_empresa);
      if (row) {
        return present(row, {
          ambito: 'solicitud',
          id_solicitud_empresa: se.id_solicitud_empresa,
          convocatoria_activa: Number(se.convocatoria_activa) === 1,
          puede_reemplazar: row.estado_validacion !== 'VALIDADO',
        });
      }
      return {
        id_documento: null,
        tipo: 'CONVENIO',
        tipo_mostrar: 'Convenio',
        estado_validacion: null,
        motivo: null,
        convocatoria: se.convocatoria,
        ambito: 'solicitud',
        id_solicitud_empresa: se.id_solicitud_empresa,
        convocatoria_activa: Number(se.convocatoria_activa) === 1,
        puede_reemplazar: true,
      };
    }),
    reservas: reservas.map((row) => present(row, {
      ambito: 'reserva',
      id_reserva: row.id_reserva,
      alumno: row.alumno,
      dni_alumno: row.dni_alumno,
      especialidad: row.especialidad,
      estado_reserva: row.estado_reserva,
      puede_reemplazar: row.estado_validacion !== 'VALIDADO' && row.estado_reserva !== 'CANCELADA',
    })),
  });
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
