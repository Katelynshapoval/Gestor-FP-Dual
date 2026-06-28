const pool = require('../db/pool');
const { getActiveConvocatoria, sendSqlError } = require('../helpers/dbHelpers');

let transporter = null;
try {
  const mc = require('../mail/config');
  transporter = mc.transporter;
} catch { /* mail not configured */ }

async function sendConfirmationEmail(email, nombre, convocatoria) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: `"Salesianos Dual" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Solicitud Dual recibida',
      html: `
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Hemos recibido tu solicitud para la convocatoria <strong>${convocatoria}</strong>.</p>
        <p>En los próximos días revisaremos tu documentación y te informaremos del resultado.</p>
        <p>Salesianos Zaragoza — Departamento Dual</p>
      `,
    });
  } catch (err) {
    console.error('Error sending confirmation email:', err.message);
  }
}

// POST /solicitudes/alumno — public: create student application
exports.create = async function (req, res) {
  const {
    nombre, dni, domicilio, cp, localidad, telalumno, telfamilia = '', email,
    id_especialidad_dual, observaciones = '', nacionalidad, fechaNacimiento,
    emailColegio, sexo, carnetDeConducir, tieneCoche, numeroSS,
    situacionLaboral, idiomasConocidos, tutorLegal, dniTutorLegal,
    // Preferencias (IDs de dual_preferencias) — opcionales
    idPreferencia1, idPreferencia2, idPreferencia3,
  } = req.body;

  const cvFile = req.files?.cv?.[0];
  const anexo2File = req.files?.anexo2?.[0];

  if (!cvFile || !anexo2File) {
    return res.status(400).json({ error: 'Se requiere el CV y el ANEXO_2 en formato PDF.' });
  }
  if (!nombre || !dni || !domicilio || !cp || !localidad || !telalumno || !email || !id_especialidad_dual) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del formulario.' });
  }

  const convocatoria = await getActiveConvocatoria();
  if (!convocatoria) {
    return res.status(409).json({ error: 'No hay ninguna convocatoria activa. El plazo de solicitud está cerrado.' });
  }

  // Look up the speciality codigo to keep the legacy string field aligned
  const [espRows] = await pool.query(
    'SELECT codigo FROM dual_especialidades WHERE id_especialidad = ?',
    [id_especialidad_dual]
  );
  if (!espRows[0]) {
    return res.status(400).json({ error: 'La especialidad seleccionada no existe.' });
  }
  const codigoEsp = espRows[0].codigo;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Upsert student by DNI
    let idAlumno;
    const [existing] = await conn.query(
      'SELECT idalumno FROM gf_alumnosfct WHERE dni = ? FOR UPDATE',
      [dni]
    );

    if (existing[0]) {
      idAlumno = existing[0].idalumno;
      await conn.query(
        `UPDATE gf_alumnosfct
            SET nombre = ?, domicilio = ?, cp = ?, localidad = ?, telalumno = ?,
                telfamilia = ?, email = ?, especialidad = ?, id_especialidad_dual = ?,
                observaciones = ?, nacionalidad = ?, fechaNacimiento = ?,
                emailColegio = ?, sexo = ?, carnetDeConducir = ?, tieneCoche = ?,
                numeroSS = ?, situacionLaboral = ?, idiomasConocidos = ?,
                tutorLegal = ?, dniTutorLegal = ?
          WHERE idalumno = ?`,
        [nombre, domicilio, cp, localidad, telalumno, telfamilia, email,
          codigoEsp, id_especialidad_dual, observaciones, nacionalidad, fechaNacimiento,
          emailColegio, sexo, carnetDeConducir ? 1 : 0, tieneCoche ? 1 : 0,
          numeroSS, situacionLaboral, idiomasConocidos, tutorLegal, dniTutorLegal,
          idAlumno]
      );
    } else {
      const [insertResult] = await conn.query(
        `INSERT INTO gf_alumnosfct
           (nombre, dni, domicilio, cp, localidad, telalumno, telfamilia, email,
            especialidad, id_especialidad_dual, observaciones, nacionalidad, fechaNacimiento,
            emailColegio, sexo, carnetDeConducir, tieneCoche, numeroSS,
            situacionLaboral, idiomasConocidos, tutorLegal, dniTutorLegal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, dni, domicilio, cp, localidad, telalumno, telfamilia, email,
          codigoEsp, id_especialidad_dual, observaciones, nacionalidad, fechaNacimiento,
          emailColegio, sexo, carnetDeConducir ? 1 : 0, tieneCoche ? 1 : 0,
          numeroSS, situacionLaboral, idiomasConocidos, tutorLegal, dniTutorLegal]
      );
      idAlumno = insertResult.insertId;
    }

    // Check for existing application in this convocatoria
    const [solExist] = await conn.query(
      'SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_alumno = ? AND id_convocatoria = ?',
      [idAlumno, convocatoria.id_convocatoria]
    );
    if (solExist[0]) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Ya tienes una solicitud registrada para la convocatoria activa. Si necesitas corregir documentación, contacta con el centro.',
      });
    }

    // Create solicitud
    const [solResult] = await conn.query(
      `INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_estado_validacion)
       VALUES (?, ?, 1)`,
      [idAlumno, convocatoria.id_convocatoria]
    );
    const idSolicitudAlumno = solResult.insertId;

    // tipo 1 = CV, tipo 2 = ANEXO_2
    await conn.query('CALL sp_guardar_documento(?, NULL, NULL, 1, ?)', [idSolicitudAlumno, cvFile.buffer]);
    await conn.query('CALL sp_guardar_documento(?, NULL, NULL, 2, ?)', [idSolicitudAlumno, anexo2File.buffer]);

    // Save student preferences if provided (up to 3, ordered)
    const prefs = [idPreferencia1, idPreferencia2, idPreferencia3];
    for (let i = 0; i < prefs.length; i++) {
      const idPref = prefs[i] ? parseInt(prefs[i], 10) : null;
      if (idPref) {
        await conn.query(
          `INSERT INTO dual_solicitud_preferencias (id_solicitud_alumno, orden, id_preferencia)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE id_preferencia = VALUES(id_preferencia)`,
          [idSolicitudAlumno, i + 1, idPref]
        );
      }
    }

    await conn.commit();

    sendConfirmationEmail(email, nombre, convocatoria.nombre);

    return res.status(201).json({
      message: 'Solicitud enviada correctamente. Recibirás un correo de confirmación.',
      id_solicitud_alumno: idSolicitudAlumno,
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// GET /solicitudes/alumno — admin/coordinador: full list; pass ?include=full to embed reservations
exports.getAll = async function (req, res) {
  const { estado, convocatoria, include } = req.query;
  const includeExtra = include === 'full';

  let query = `
    SELECT sa.id_solicitud_alumno, sa.id_alumno, sa.id_convocatoria, sa.fecha_solicitud,
           sa.motivo,
           ev.nombre AS estado_validacion,
           a.nombre, a.dni, a.email, a.telalumno, a.carnetDeConducir, a.tieneCoche,
           a.idiomasConocidos,
           esp.id_especialidad, esp.codigo AS codigo_especialidad, esp.nombre AS especialidad,
           CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
           c.nombre AS convocatoria,
           de.id_evaluacion,
           CASE WHEN de.id_evaluacion IS NOT NULL THEN
             ROUND(LEAST(10, GREATEST(0,
               0.6  * de.nota_media +
               0.05 * de.idiomas +
               0.1  * de.madurez +
               0.1  * de.competencia +
               GREATEST(0, -0.1 * ((de.faltas / 1050.0) * 100) + 1.5)
             )), 2)
           ELSE NULL END AS nota_total,
           (SELECT id_documento FROM dual_documentos d
             JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
            WHERE d.id_solicitud_alumno = sa.id_solicitud_alumno AND td.nombre = 'CV'
            LIMIT 1) AS cv_id,
           (SELECT id_documento FROM dual_documentos d
             JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
            WHERE d.id_solicitud_alumno = sa.id_solicitud_alumno AND td.nombre = 'ANEXO_2'
            LIMIT 1) AS anexo2_id
      FROM dual_solicitudes_alumno sa
      JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
      JOIN dual_estados_validacion ev ON ev.id_estado_validacion = sa.id_estado_validacion
      LEFT JOIN dual_especialidades esp ON esp.id_especialidad = a.id_especialidad_dual
      JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
      LEFT JOIN dual_evaluaciones de ON de.id_solicitud_alumno = sa.id_solicitud_alumno
     WHERE 1=1
  `;
  const params = [];

  if (estado) {
    query += ' AND ev.nombre = ?';
    params.push(estado.toUpperCase());
  }
  if (convocatoria) {
    query += ' AND sa.id_convocatoria = ?';
    params.push(convocatoria);
  }
  query += ' ORDER BY a.nombre ASC';

  const [rows] = await pool.query(query, params);

  if (!includeExtra || rows.length === 0) {
    return res.json(rows);
  }

  // With include=full: fetch all reservations and attach them to each solicitud
  const ids = rows.map(r => r.id_solicitud_alumno);
  const [reservas] = await pool.query(
    `SELECT r.id_reserva, r.id_solicitud_alumno, r.motivo,
            er.nombre AS estado_reserva,
            tc.nombre_mostrar AS tipo_contrato,
            emp.empresa,
            esp.codigo AS codigo_especialidad,
            se.id_empresa,
            r.id_solicitud_empresa_especialidad,
            (SELECT id_documento FROM dual_documentos d WHERE d.id_reserva = r.id_reserva LIMIT 1) AS id_documento_reserva
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
      WHERE r.id_solicitud_alumno IN (?)`,
    [ids]
  );

  const reservaMap = {};
  reservas.forEach(r => {
    if (!reservaMap[r.id_solicitud_alumno]) reservaMap[r.id_solicitud_alumno] = [];
    reservaMap[r.id_solicitud_alumno].push(r);
  });

  const result = rows.map(r => ({
    ...r,
    reservas: reservaMap[r.id_solicitud_alumno] || [],
  }));

  return res.json(result);
};

// GET /solicitudes/alumno/:id — detail
exports.getById = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query(
    `SELECT sa.id_solicitud_alumno, sa.id_alumno, sa.id_convocatoria, sa.fecha_solicitud,
            sa.motivo,
            ev.nombre AS estado_validacion,
            a.nombre, a.dni, a.domicilio, a.cp, a.localidad, a.email, a.telalumno,
            a.telfamilia, a.carnetDeConducir, a.tieneCoche, a.nacionalidad,
            a.fechaNacimiento, a.emailColegio, a.sexo, a.idiomasConocidos,
            a.situacionLaboral, a.tutorLegal, a.dniTutorLegal,
            esp.id_especialidad, esp.codigo AS codigo_especialidad, esp.nombre AS especialidad,
            CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
            c.nombre AS convocatoria
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = sa.id_estado_validacion
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = a.id_especialidad_dual
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
      WHERE sa.id_solicitud_alumno = ?`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  return res.json(rows[0]);
};

// POST /solicitudes/alumno/:id/validar
exports.validar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('CALL sp_validar_solicitud_alumno(?)', [id]);
    return res.json({ message: 'Solicitud de alumno validada correctamente.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /solicitudes/alumno/:id/rechazar
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { motivo } = req.body;
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debe indicar el motivo del rechazo.' });
  }
  try {
    await pool.query('CALL sp_rechazar_solicitud_alumno(?, ?)', [id, motivo.trim()]);
    return res.json({ message: 'Solicitud de alumno rechazada.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// GET /solicitudes/alumno/:id/documentos — list documents for a solicitud
exports.getDocumentos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query(
    `SELECT d.id_documento, td.nombre AS tipo_documento, ev.nombre AS estado_validacion, d.motivo
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_solicitud_alumno = ?
      ORDER BY d.id_tipo_documento`,
    [id]
  );
  return res.json(rows);
};
