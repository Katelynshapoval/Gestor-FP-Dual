const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { getActiveConvocatoria, getStudentIdFromUser, sendSqlError, normalizeDni, dniNieValido } = require('../helpers/dbHelpers');
const { tipoIdByNombre, attachSolicitudDocumentos, missingStudentValidation, reservaDocSummary } = require('./documentosWorkflow');
const { loginRateLimiter } = require('../middleware/loginRateLimit');
const { aplicarTransicion } = require('./solicitudTransiciones');
const { escapeHtml, cicloCorregido } = require('./notificaciones');
const alumnoDatos = require('./alumnoDatos');
const { recordEvent } = require('./auditLog');
const MIN_PASSWORD_LENGTH = 8;

// SEC-001 / SEC-009: one answer for every identity rejection on the public form,
// so it does not reveal whether a DNI already has an account or only a record.
const IDENTIDAD_NO_VERIFICADA = 'No se ha podido verificar tu identidad con este DNI/NIE. Si ya tienes cuenta en el portal, escribe en «Contraseña» tu contraseña actual. Si no la tienes o no la recuerdas, contacta con el centro.';

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
        <p>Hola <strong>${escapeHtml(nombre)}</strong>,</p>
        <p>Hemos recibido tu solicitud para la convocatoria <strong>${escapeHtml(convocatoria)}</strong>.</p>
        <p>En los próximos días revisaremos tu documentación y te informaremos del resultado.</p>
        <p>Puedes consultar el estado de tu solicitud iniciando sesión con tu DNI/NIE.</p>
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
    password,
  } = req.body;

  const cvFile = req.files?.cv?.[0];
  const anexoDgaFile = req.files?.anexoDga?.[0];

  if (!cvFile || !anexoDgaFile) {
    return res.status(400).json({ error: 'Se requiere el CV y el Anexo DGA en formato PDF.' });
  }
  if (!nombre || !dni || !domicilio || !cp || !localidad || !telalumno || !email || !id_especialidad_dual) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del formulario.' });
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const dniNorm = normalizeDni(dni);
  if (!dniNorm) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del formulario.' });
  }
  if (!dniNieValido(dniNorm)) {
    return res.status(400).json({ error: 'No es un DNI/NIE válido.' });
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

    // Find the student by DNI (canonicalized)
    let idAlumno;
    let cuentaExistente = false;
    const [existing] = await conn.query(
      // V-6: DNIs are stored normalised, so the index on dni is used and only the
      // matching row is locked (UPPER(TRIM()) scanned and locked the whole table).
      'SELECT idalumno FROM gf_alumnosfct WHERE dni = ? FOR UPDATE',
      [dniNorm]
    );

    if (existing[0]) {
      idAlumno = existing[0].idalumno;

      // Duplicate check first, so a rejected submission changes nothing
      const [dup] = await conn.query(
        'SELECT id_solicitud_alumno FROM dual_solicitudes_alumno WHERE id_alumno = ? AND id_convocatoria = ?',
        [idAlumno, convocatoria.id_convocatoria]
      );
      if (dup[0]) {
        await conn.rollback();
        return res.status(409).json({
          error: 'Ya tienes una solicitud registrada para la convocatoria activa. Si necesitas corregir documentación, contacta con el centro.',
        });
      }

      // SEC-3: a public, unauthenticated form must not overwrite someone's data.
      const [cuenta] = await conn.query(
        'SELECT id_usuario, password_hash, activo FROM dual_usuarios WHERE id_alumno = ? FOR UPDATE',
        [idAlumno]
      );

      // Every identity check below counts towards the login limiter.
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      if (cuenta[0]) {
        // Returning student with an account: the form password must be the
        // current portal password.
        const wait = loginRateLimiter.retryAfter(ip, dniNorm);
        if (wait > 0) {
          await conn.rollback();
          res.set('Retry-After', String(wait));
          return res.status(429).json({
            error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${Math.ceil(wait / 60)} minuto(s).`,
            code: 'TOO_MANY_ATTEMPTS',
          });
        }
        const ok = await bcrypt.compare(String(password), cuenta[0].password_hash);
        if (!ok) {
          loginRateLimiter.recordFailure(ip, dniNorm);
          await conn.rollback();
          return res.status(401).json({ error: IDENTIDAD_NO_VERIFICADA, code: 'IDENTIDAD_NO_VERIFICADA' });
        }
        if (!cuenta[0].activo) {
          await conn.rollback();
          return res.status(403).json({ error: 'La cuenta está desactivada. Contacta con el centro.' });
        }
        loginRateLimiter.recordSuccess(ip, dniNorm);
        cuentaExistente = true;

        // Identity proven: the student may update their own data.
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
        // SEC-001: known student without an account (e.g. imported record).
        // Nobody has proven who sends this anonymous form, so it must neither
        // create the account nor write to the record: the student has to go
        // through the centre.
        loginRateLimiter.recordFailure(ip, dniNorm);
        await conn.rollback();
        return res.status(401).json({ error: IDENTIDAD_NO_VERIFICADA, code: 'IDENTIDAD_NO_VERIFICADA' });
      }
    } else {
      const [insertResult] = await conn.query(
        `INSERT INTO gf_alumnosfct
           (nombre, dni, domicilio, cp, localidad, telalumno, telfamilia, email,
            especialidad, id_especialidad_dual, observaciones, nacionalidad, fechaNacimiento,
            emailColegio, sexo, carnetDeConducir, tieneCoche, numeroSS,
            situacionLaboral, idiomasConocidos, tutorLegal, dniTutorLegal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, dniNorm, domicilio, cp, localidad, telalumno, telfamilia, email,
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

    // Create solicitud. DB-01 (migration 017): the ciclo requested in this form
    // belongs to the application; gf_alumnosfct only keeps the latest one.
    const [solResult] = await conn.query(
      `INSERT INTO dual_solicitudes_alumno (id_alumno, id_convocatoria, id_especialidad, id_estado_validacion)
       VALUES (?, ?, ?, 1)`,
      [idAlumno, convocatoria.id_convocatoria, id_especialidad_dual]
    );
    const idSolicitudAlumno = solResult.insertId;

    const idCv = await tipoIdByNombre('CV', conn);
    const idDga = await tipoIdByNombre('ANEXO_DGA', conn);
    if (!idCv || !idDga) {
      throw new Error('El catálogo de documentos no está actualizado. Ejecuta la migración 008.');
    }
    await conn.query('CALL sp_guardar_documento(?, NULL, NULL, ?, ?)', [idSolicitudAlumno, idCv, cvFile.buffer]);
    await conn.query('CALL sp_guardar_documento(?, NULL, NULL, ?, ?)', [idSolicitudAlumno, idDga, anexoDgaFile.buffer]);
    await conn.query(
      `UPDATE dual_documentos d
         JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
          SET d.estado_workflow = 'SUBIDO_FIRMADO'
        WHERE d.id_solicitud_alumno = ? AND td.nombre = 'ANEXO_DGA'`,
      [idSolicitudAlumno],
    );

    // ALUMNO account: create only when this student has none. Never reset an existing password.
    const [rolRow] = await conn.query(
      'SELECT id_rol FROM dual_roles WHERE nombre = ?',
      ['ALUMNO']
    );
    const idRolAlumno = rolRow[0]?.id_rol;
    if (!idRolAlumno) throw new Error('Rol ALUMNO no encontrado en la base de datos.');

    const [existingUser] = await conn.query(
      'SELECT id_usuario FROM dual_usuarios WHERE id_alumno = ? FOR UPDATE',
      [idAlumno]
    );
    let idUsuarioOrigen = existingUser[0]?.id_usuario || null;
    if (!existingUser[0]) {
      const hash = await bcrypt.hash(String(password), 10);
      const [createdUser] = await conn.query(
        `INSERT INTO dual_usuarios
           (nombre_mostrar, email, password_hash, id_rol, id_contacto, id_alumno, activo, must_change_password)
         VALUES (?, NULL, ?, ?, NULL, ?, 1, 0)`,
        [nombre, hash, idRolAlumno, idAlumno]
      );
      idUsuarioOrigen = createdUser.insertId;
    }

    await conn.query(
      `UPDATE dual_documentos
          SET id_usuario_origen = ?, origen_documento = 'SUBIDA', registrado_en = NOW()
        WHERE id_solicitud_alumno = ?`,
      [idUsuarioOrigen, idSolicitudAlumno]
    );

    await conn.commit();

    sendConfirmationEmail(email, nombre, convocatoria.nombre);

    return res.status(201).json({
      message: 'Solicitud enviada correctamente. Recibirás un correo de confirmación.',
      id_solicitud_alumno: idSolicitudAlumno,
      cuenta_existente: cuentaExistente,
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
           c.nombre AS convocatoria, c.activa AS convocatoria_activa,
           CASE WHEN u.id_usuario IS NOT NULL THEN 1 ELSE 0 END AS tiene_cuenta,
           u.id_usuario, u.activo AS cuenta_activa,
           (SELECT dc.id_cambio FROM dual_alumno_cambios dc
             WHERE dc.id_solicitud_pendiente = sa.id_solicitud_alumno) AS id_cambio_pendiente,
           (SELECT e.motivo FROM dual_eventos e
             WHERE e.entidad = 'SOLICITUD_ALUMNO' AND e.id_entidad = sa.id_solicitud_alumno AND e.accion = 'BAJA'
             ORDER BY e.id_evento DESC LIMIT 1) AS motivo_baja,
           (SELECT e.creado_en FROM dual_eventos e
             WHERE e.entidad = 'SOLICITUD_ALUMNO' AND e.id_entidad = sa.id_solicitud_alumno AND e.accion = 'BAJA'
             ORDER BY e.id_evento DESC LIMIT 1) AS fecha_baja
      FROM dual_solicitudes_alumno sa
      JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
      LEFT JOIN dual_usuarios u ON u.id_alumno = a.idalumno
      JOIN dual_estados_validacion ev ON ev.id_estado_validacion = sa.id_estado_validacion
      LEFT JOIN dual_especialidades esp ON esp.id_especialidad = sa.id_especialidad
      JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
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
  const withDocs = rows.length ? await attachSolicitudDocumentos(rows, 'GESTOR') : [];

  if (!includeExtra || withDocs.length === 0) {
    return res.json(withDocs);
  }

  // With include=full: fetch all reservations and attach them to each solicitud
  const ids = withDocs.map(r => r.id_solicitud_alumno);
  const [reservas] = await pool.query(
    `SELECT r.id_reserva, r.id_solicitud_alumno, r.motivo,
            er.nombre AS estado_reserva,
            r.id_tipo_contrato,
            tc.nombre_mostrar AS tipo_contrato,
            tc.nombre AS tipo_contrato_clave,
            se.id_solicitud_empresa,
            emp.empresa,
            esp.codigo AS codigo_especialidad,
            se.id_empresa,
            r.id_solicitud_empresa_especialidad,
            r.id_empresa_tutor,
            tutor_c.nombre AS tutor_nombre,
            tutor_c.email AS tutor_email,
            tutor_c.telefono AS tutor_telefono,
            t.activo AS tutor_activo
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       LEFT JOIN dual_empresa_tutores t ON t.id_empresa_tutor = r.id_empresa_tutor
       LEFT JOIN ge_contactos tutor_c ON tutor_c.idcontacto = t.id_contacto
      WHERE r.id_solicitud_alumno IN (?)`,
    [ids]
  );

  const resumen = await reservaDocSummary(reservas);
  const reservaMap = {};
  reservas.forEach(r => {
    r.documentos_resumen = resumen[r.id_reserva] || null;
    if (!reservaMap[r.id_solicitud_alumno]) reservaMap[r.id_solicitud_alumno] = [];
    reservaMap[r.id_solicitud_alumno].push(r);
  });

  const result = withDocs.map(r => ({
    ...r,
    reservas: reservaMap[r.id_solicitud_alumno] || [],
  }));

  return res.json(result);
};

// GET /solicitudes/alumno/mia — ALUMNO: own current application
exports.getMia = async function (req, res) {
  const idAlumno = await getStudentIdFromUser(req.user.id);
  if (!idAlumno) return res.status(404).json({ error: 'No se encontró alumno vinculado a este usuario.' });

  const [rows] = await pool.query(
    `SELECT sa.id_solicitud_alumno, sa.id_alumno, sa.id_convocatoria, sa.fecha_solicitud,
            sa.motivo,
            ev.nombre AS estado_validacion,
            a.nombre, a.dni, a.email, a.telalumno, a.domicilio, a.cp, a.localidad,
            esp.id_especialidad, esp.codigo AS codigo_especialidad, esp.nombre AS especialidad,
            CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
            c.nombre AS convocatoria, c.activa
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = sa.id_estado_validacion
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = sa.id_especialidad
       JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
      WHERE sa.id_alumno = ?
      ORDER BY c.activa DESC, sa.fecha_solicitud DESC
      LIMIT 1`,
    [idAlumno]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No hay solicitud registrada para este alumno.', code: 'SIN_SOLICITUD' });
  return res.json(rows[0]);
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
       LEFT JOIN dual_especialidades esp ON esp.id_especialidad = sa.id_especialidad
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
  if (!id) return res.status(400).json({ error: 'Solicitud no válida.' });
  const pending = await missingStudentValidation(id);
  if (pending.length) {
    return res.status(400).json({
      error: `Para validar al alumno primero hay que validar: ${pending.join(', ')}.`,
    });
  }
  try {
    const out = await aplicarTransicion('SOLICITUD_ALUMNO', id, 'VALIDAR', { user: req.user });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
    return res.json({ message: 'Solicitud de alumno validada correctamente.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /solicitudes/alumno/:id/rechazar
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const motivo = String(req.body?.motivo || '').trim();
  if (!id) return res.status(400).json({ error: 'Solicitud no válida.' });
  if (!motivo) {
    return res.status(400).json({ error: 'Debe indicar el motivo del rechazo.' });
  }
  try {
    const out = await aplicarTransicion('SOLICITUD_ALUMNO', id, 'RECHAZAR', { user: req.user, motivo });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
    return res.json({ message: 'Solicitud de alumno rechazada.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /solicitudes/alumno/:id/reabrir — staff, active convocatoria only (D7)
exports.reabrir = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const motivo = String(req.body?.motivo || '').trim() || null;
  if (!id) return res.status(400).json({ error: 'Solicitud no válida.' });
  try {
    const out = await aplicarTransicion('SOLICITUD_ALUMNO', id, 'REABRIR', { user: req.user, motivo });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code });
    return res.json({ message: 'Solicitud reabierta: vuelve a estar pendiente de revisión.' });
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

function sendDatosError(res, err) {
  if (err.status && err.code) {
    const body = { error: err.message, code: err.code };
    if (err.errores) body.errores = err.errores;
    if (err.reservas) body.reservas = err.reservas;
    return res.status(err.status).json(body);
  }
  return sendSqlError(res, err);
}

// GET /solicitudes/alumno/:id/datos — Administración: editable data, plus what
// blocks a ciclo change (active reservations).
exports.getDatos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Solicitud no válida.' });
  const row = await alumnoDatos.loadDatos(pool, id);
  if (!row) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  const reservas = await alumnoDatos.reservasActivas(pool, id);
  let bloqueo = null;
  try {
    alumnoDatos.assertEditable(row);
  } catch (err) {
    bloqueo = err.message;
  }
  return res.json({
    id_solicitud_alumno: row.id_solicitud_alumno,
    dni: row.dni,
    estado_validacion: row.estado_validacion,
    editable: !bloqueo,
    motivo_no_editable: bloqueo,
    datos: alumnoDatos.pickSnapshot(row),
    reservas_activas: reservas,
  });
};

// PUT /solicitudes/alumno/:id/datos — Administración corrects a student's data.
// Body: any of the editable fields and id_especialidad. `dni` is refused. Only changed fields are written and audited.
exports.putDatos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Solicitud no válida.' });

  let proposed;
  try {
    proposed = alumnoDatos.sanitizeProposed(req.body);
  } catch (err) {
    return sendDatosError(res, err);
  }

  const conn = await pool.getConnection();
  let changed;
  try {
    await conn.beginTransaction();
    const row = await alumnoDatos.loadDatos(conn, id, { lock: true });
    alumnoDatos.assertEditable(row);

    const { changes, campos } = await alumnoDatos.corregir(conn, row, proposed);
    changed = campos;
    // Field names and ciclo ids only: never the values themselves.
    await recordEvent(conn, {
      entidad: 'SOLICITUD_ALUMNO',
      id,
      accion: 'DATOS_CORREGIDOS',
      user: req.user,
      detalle: {
        campos: changed,
        ...(changes.id_especialidad != null
          ? { especialidad_anterior: row.id_especialidad, especialidad_nueva: changes.id_especialidad }
          : {}),
      },
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    return sendDatosError(res, err);
  } finally {
    conn.release();
  }

  if (changed.includes('id_especialidad')) cicloCorregido(id);
  return res.json({ message: 'Datos del alumno actualizados.', campos: changed });
};
