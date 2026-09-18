const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { getActiveConvocatoria, sendSqlError, normalizeCif, getCompanyIdFromUser } = require('../helpers/dbHelpers');
const empresaDatos = require('./empresaDatos');

const EMPRESA_YA_REGISTRADA =
  'Esta empresa ya está registrada. Inicia sesión con el CIF para gestionar su participación.';

let transporter = null;
try {
  const mc = require('../mail/config');
  transporter = mc.transporter;
} catch { /* mail not configured */ }

async function sendCompanyConfirmationEmail(email, empresa, convocatoria, convenioUrl) {
  if (!transporter) {
    console.warn('Mail not configured. Convenio URL for', empresa, ':', convenioUrl);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Salesianos Dual" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Solicitud Dual Empresa recibida',
      html: `
        <p>Estimado coordinador de <strong>${empresa}</strong>,</p>
        <p>Hemos recibido vuestra solicitud de participación en la convocatoria <strong>${convocatoria}</strong>.</p>
        <p>Revisaremos la documentación y os informaremos del resultado.</p>
        ${convenioUrl ? `<p>Para subir el convenio firmado, accede al siguiente enlace (válido 30 días):<br>
        <a href="${convenioUrl}">${convenioUrl}</a></p>` : ''}
        <p>Salesianos Zaragoza — Departamento Dual</p>
      `,
    });
  } catch (err) {
    console.error('Error sending company confirmation email:', err.message);
  }
}

// POST /solicitudes/empresa — public: create company application
exports.create = async function (req, res) {
  const {
    // Company
    cif, empresa: empresaNombre, web = '', observaciones = '',
    emailEmpresa = '', telefonoEmpresa = '', menosdecincotrabajadores = 0,
    // Legal address
    domicilioLegal, cpLegal, provinciaLegal, localidadLegal, municipioLegal = '',
    telefonoLegal = '', emailLegal = '',
    // Work address (may be the same as the legal address)
    mismoLugarTrabajo,
    domicilioTrabajo, cpTrabajo, provinciaTrabajo, localidadTrabajo, municipioTrabajo = '',
    telefonoTrabajo = '', emailTrabajo = '',
    // Legal representative
    dniRepresentante, nombreRepresentante, emailRepresentante, telefonoRepresentante,
    cargoRepresentante = 'REPRESENTANTE LEGAL',
    // Company coordinator (dual tutor)
    dniCoordinador, nombreCoordinador, emailCoordinador, telefonoCoordinador,
    cargoCoordinador = 'COORDINADOR DUAL',
    // Application details
    descripcion_puesto,
    // Specialities: [{ idEspecialidad, cantidadAlumnos }]
    especialidades,
    // Transports: [id_transporte, ...]
    transportes = [],
    // Initial password for the coordinator user account
    passwordCoordinador,
  } = req.body;

  if (!cif || !empresaNombre || !domicilioLegal || !cpLegal || !provinciaLegal || !localidadLegal) {
    return res.status(400).json({ error: 'Faltan datos obligatorios de la empresa.' });
  }
  if (!dniRepresentante || !nombreRepresentante || !emailRepresentante || !telefonoRepresentante) {
    return res.status(400).json({ error: 'Faltan datos del representante legal.' });
  }
  if (!dniCoordinador || !nombreCoordinador || !emailCoordinador || !telefonoCoordinador) {
    return res.status(400).json({ error: 'Faltan datos del coordinador de empresa.' });
  }
  if (!descripcion_puesto) {
    return res.status(400).json({ error: 'La descripción del puesto es obligatoria.' });
  }
  if (!especialidades || !Array.isArray(especialidades) || especialidades.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos una especialidad y cantidad de alumnos.' });
  }
  if (!passwordCoordinador) {
    return res.status(400).json({ error: 'Se requiere contraseña para la cuenta del coordinador.' });
  }

  const convocatoria = await getActiveConvocatoria();
  if (!convocatoria) {
    return res.status(409).json({ error: 'No hay ninguna convocatoria activa. El plazo de solicitud está cerrado.' });
  }

  const cifNorm = normalizeCif(cif);
  if (!cifNorm) {
    return res.status(400).json({ error: 'Faltan datos obligatorios de la empresa.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Public registration must not upsert: an existing CIF is a duplicate company.
    const [empExist] = await conn.query(
      'SELECT idempresa FROM ge_empresas WHERE UPPER(TRIM(cif)) = ? FOR UPDATE',
      [cifNorm]
    );
    if (empExist[0]) {
      await conn.rollback();
      return res.status(409).json({ error: EMPRESA_YA_REGISTRADA });
    }

    const [r] = await conn.query(
      `INSERT INTO ge_empresas (cif, empresa, convenio, fechaconvenio, web, observaciones,
                                 emailEmpresa, telefonoEmpresa, menosdecincotrabajadores)
       VALUES (?, ?, '', '1000-01-01', ?, ?, ?, ?, ?)`,
      [cifNorm, empresaNombre, web, observaciones, emailEmpresa, telefonoEmpresa,
        menosdecincotrabajadores ? 1 : 0]
    );
    const idEmpresa = r.insertId;

    // Check for duplicate application in this convocatoria
    const [solExist] = await conn.query(
      'SELECT id_solicitud_empresa FROM dual_solicitudes_empresa WHERE id_empresa = ? AND id_convocatoria = ?',
      [idEmpresa, convocatoria.id_convocatoria]
    );
    if (solExist[0]) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Esta empresa ya tiene una solicitud registrada para la convocatoria activa.',
      });
    }

    // 2. Legal address
    const [domLegalRes] = await conn.query(
      `INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, telefono, email, especialidad, municipio)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
      [idEmpresa, domicilioLegal, cpLegal, provinciaLegal, localidadLegal,
        telefonoLegal, emailLegal, municipioLegal]
    );
    const idDomicilioLegal = domLegalRes.insertId;

    // 3. Work address (may reuse legal)
    let idDomicilioTrabajo;
    if (mismoLugarTrabajo) {
      idDomicilioTrabajo = idDomicilioLegal;
    } else {
      if (!domicilioTrabajo || !cpTrabajo || !provinciaTrabajo || !localidadTrabajo) {
        await conn.rollback();
        return res.status(400).json({ error: 'Faltan datos del domicilio de trabajo.' });
      }
      const [domTrabRes] = await conn.query(
        `INSERT INTO ge_domicilios (idempresa, domicilio, cp, provincia, localidad, telefono, email, especialidad, municipio)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
        [idEmpresa, domicilioTrabajo, cpTrabajo, provinciaTrabajo, localidadTrabajo,
          telefonoTrabajo, emailTrabajo, municipioTrabajo]
      );
      idDomicilioTrabajo = domTrabRes.insertId;
    }

    // 4. Legal representative contact (attached to legal address)
    const [repRes] = await conn.query(
      `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones, especialidad)
       VALUES (?, ?, ?, ?, ?, ?, '', '')`,
      [idDomicilioLegal, dniRepresentante, nombreRepresentante, emailRepresentante,
        telefonoRepresentante, cargoRepresentante]
    );
    const idRepresentante = repRes.insertId;

    // 5. Company coordinator contact (attached to work address)
    const [coordRes] = await conn.query(
      `INSERT INTO ge_contactos (iddomicilio, dni, nombre, email, telefono, cargo, observaciones, especialidad)
       VALUES (?, ?, ?, ?, ?, ?, '', '')`,
      [idDomicilioTrabajo, dniCoordinador, nombreCoordinador, emailCoordinador,
        telefonoCoordinador, cargoCoordinador]
    );
    const idCoordinador = coordRes.insertId;

    // 6. Create solicitud empresa
    const [solRes] = await conn.query(
      `INSERT INTO dual_solicitudes_empresa
         (id_empresa, id_convocatoria, id_estado_validacion, id_representante_legal,
          id_coordinador_empresa, id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [idEmpresa, convocatoria.id_convocatoria, idRepresentante, idCoordinador,
        idDomicilioLegal, idDomicilioTrabajo, descripcion_puesto]
    );
    const idSolicitudEmpresa = solRes.insertId;

    // 7. Speciality rows
    for (const esp of especialidades) {
      const idEsp = parseInt(esp.idEspecialidad, 10);
      const cant = parseInt(esp.cantidadAlumnos, 10);
      if (!idEsp || !cant || cant < 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'Cada especialidad debe tener un id válido y cantidad > 0.' });
      }
      await conn.query(
        `INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos)
         VALUES (?, ?, ?)`,
        [idSolicitudEmpresa, idEsp, cant]
      );
    }

    // 8. Transports
    for (const idT of transportes) {
      await conn.query('CALL sp_asignar_transporte_empresa(?, ?)', [idEmpresa, idT]);
    }

    // 9. Coordinator user account
    const [rolRow] = await conn.query(
      'SELECT id_rol FROM dual_roles WHERE nombre = ?',
      ['EMPRESA']
    );
    const idRol = rolRow[0]?.id_rol;
    if (!idRol) throw new Error('Rol EMPRESA no encontrado en la base de datos.');

    const hash = await bcrypt.hash(passwordCoordinador, 10);
    // Login identifier is the company CIF. Coordinator email stays in ge_contactos.
    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, id_contacto, activo, must_change_password)
       VALUES (?, NULL, ?, ?, ?, 1, 1)`,
      [nombreCoordinador, hash, idRol, idCoordinador]
    );

    // Generates a one-time token so the company can upload their signed convenio without logging in
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day expiry
    await conn.query(
      `INSERT INTO dual_convenio_tokens (id_solicitud_empresa, token, expira_en) VALUES (?, ?, ?)`,
      [idSolicitudEmpresa, token, expiraEn]
    );

    await conn.commit();

    const urlBase = process.env.APP_URL || 'http://localhost:3000';
    const convenioUrl = `${urlBase}/addConvenio/${token}`;
    sendCompanyConfirmationEmail(emailCoordinador, empresaNombre, convocatoria.nombre, convenioUrl);

    return res.status(201).json({
      message: 'Solicitud de empresa enviada correctamente.',
      id_solicitud_empresa: idSolicitudEmpresa,
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY' && /uq_ge_empresas_cif|ge_empresas/i.test(err.message)) {
      return res.status(409).json({ error: EMPRESA_YA_REGISTRADA });
    }
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// GET /solicitudes/empresa — admin/coordinador: list all
exports.getAll = async function (req, res) {
  const { estado, convocatoria } = req.query;
  let query = `
    SELECT se.id_solicitud_empresa, se.id_empresa, se.id_convocatoria, se.fecha_solicitud,
           se.descripcion_puesto, se.motivo,
           ev.nombre AS estado_validacion,
           emp.empresa, emp.cif,
           c.nombre AS convocatoria,
           rep.nombre AS representante_nombre, rep.email AS representante_email,
           coord.nombre AS coordinador_nombre, coord.email AS coordinador_email
      FROM dual_solicitudes_empresa se
      JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
      JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
      JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      JOIN ge_contactos rep ON rep.idcontacto = se.id_representante_legal
      JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
     WHERE 1=1
  `;
  const params = [];
  if (estado) { query += ' AND ev.nombre = ?'; params.push(estado.toUpperCase()); }
  if (convocatoria) { query += ' AND se.id_convocatoria = ?'; params.push(convocatoria); }
  query += ' ORDER BY se.fecha_solicitud DESC';

  const [rows] = await pool.query(query, params);
  return res.json(rows);
};

// GET /solicitudes/empresa/mia — EMPRESA user's own application
exports.getMia = async function (req, res) {
  const { getCompanyIdFromUser } = require('../helpers/dbHelpers');
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [rows] = await pool.query(
    `SELECT se.id_solicitud_empresa, se.id_empresa, se.id_convocatoria, se.fecha_solicitud,
            se.descripcion_puesto, se.motivo,
            ev.nombre AS estado_validacion,
            emp.empresa, emp.cif,
            c.nombre AS convocatoria
       FROM dual_solicitudes_empresa se
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ?
        AND c.activa = 1
      LIMIT 1`,
    [idEmpresa]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No hay solicitud para la convocatoria activa.' });
  return res.json(rows[0]);
};

// GET /solicitudes/empresa/:id — detail
exports.getById = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const datos = await empresaDatos.loadEmpresaDatosRead(pool, id);
  if (!datos) return res.status(404).json({ error: 'Solicitud no encontrada.' });

  if (req.user.rol === 'EMPRESA') {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    if (!idEmpresa || idEmpresa !== datos.id_empresa) {
      return res.status(403).json({ error: 'No tiene permiso para acceder a esta solicitud.' });
    }
  }

  const [esps] = await pool.query(
    `SELECT see.id_solicitud_empresa_especialidad, see.id_especialidad, see.cantidad_alumnos,
            esp.codigo, esp.nombre,
            CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno
       FROM dual_solicitud_empresa_especialidades see
       JOIN dual_especialidades esp ON esp.id_especialidad = see.id_especialidad
      WHERE see.id_solicitud_empresa = ?`,
    [id]
  );
  datos.especialidades = esps;
  return res.json(datos);
};

// GET /solicitudes/empresa/:id/especialidades — speciality list + quotas
exports.getEspecialidades = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });
  const [rows] = await pool.query(
    `SELECT see.id_solicitud_empresa_especialidad, see.id_especialidad, see.cantidad_alumnos,
            esp.codigo, esp.nombre,
            CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
            fn_cupos_disponibles(see.id_solicitud_empresa_especialidad) AS plazas_disponibles,
            fn_reservas_activas(see.id_solicitud_empresa_especialidad) AS plazas_ocupadas
       FROM dual_solicitud_empresa_especialidades see
       JOIN dual_especialidades esp ON esp.id_especialidad = see.id_especialidad
      WHERE see.id_solicitud_empresa = ?`,
    [id]
  );
  return res.json(rows);
};

// POST /solicitudes/empresa/:id/validar
exports.validar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('CALL sp_validar_solicitud_empresa(?)', [id]);
    return res.json({ message: 'Solicitud de empresa validada correctamente.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /solicitudes/empresa/:id/rechazar
exports.rechazar = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { motivo } = req.body;
  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debe indicar el motivo del rechazo.' });
  }
  try {
    await pool.query('CALL sp_rechazar_solicitud_empresa(?, ?)', [id, motivo.trim()]);
    return res.json({ message: 'Solicitud de empresa rechazada.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// GET /solicitudes/empresa/todas — admin: normalised list used by the company admin panel
exports.getTodas = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT
        se.id_solicitud_empresa,
        se.id_empresa,
        se.fecha_solicitud,
        se.descripcion_puesto,
        se.motivo,
        ev.nombre AS estado_validacion,
        emp.empresa AS razonSocial,
        emp.cif,
        emp.telefonoEmpresa AS telEmpresa,
        c.nombre AS convocatoria,
        c.activa AS convocatoria_activa,
        coord.nombre AS nombreCoordinador,
        coord.email AS emailCoordinador,
        coord.telefono AS telefonoCoordinador,
        rep.nombre AS responsableLegal,
        rep.dni AS dniRl,
        rep.cargo,
        dl.domicilio AS dirRazSocial,
        dl.provincia,
        dl.municipio,
        dl.cp AS cpRazSoc,
        dt.domicilio AS direccionLugarTrabajo,
        u.id_usuario,
        emp.cif AS username
     FROM dual_solicitudes_empresa se
     JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
     JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
     JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
     JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
     JOIN ge_contactos rep ON rep.idcontacto = se.id_representante_legal
     JOIN ge_domicilios dl ON dl.iddomicilio = se.id_domicilio_legal
     JOIN ge_domicilios dt ON dt.iddomicilio = se.id_domicilio_trabajo
     LEFT JOIN dual_usuarios u ON u.id_contacto = coord.idcontacto
    ORDER BY se.fecha_solicitud DESC`
  );

  if (rows.length === 0) return res.json([]);

  // Batch-load specialities, transports, and convenio status for each solicitud
  const ids = rows.map(r => r.id_solicitud_empresa);
  const idEmpresas = rows.map(r => r.id_empresa);

  const [esps] = await pool.query(
    `SELECT see.id_solicitud_empresa, see.cantidad_alumnos,
            esp.id_especialidad, esp.codigo, esp.nombre,
            CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno
       FROM dual_solicitud_empresa_especialidades see
       JOIN dual_especialidades esp ON esp.id_especialidad = see.id_especialidad
      WHERE see.id_solicitud_empresa IN (?)`,
    [ids]
  );

  const [transp] = await pool.query(
    `SELECT det.id_empresa, dt.id_transporte, dt.nombre
       FROM dual_empresa_transportes det
       JOIN dual_transportes dt ON dt.id_transporte = det.id_transporte
      WHERE det.id_empresa IN (?)`,
    [idEmpresas]
  );

  const [convenios] = await pool.query(
    `SELECT d.id_solicitud_empresa, d.id_documento,
            ev.nombre AS estado_validacion
       FROM dual_documentos d
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
      WHERE d.id_solicitud_empresa IN (?)
        AND td.nombre = 'CONVENIO'`,
    [ids]
  );

  const espMap = {};
  esps.forEach(e => {
    if (!espMap[e.id_solicitud_empresa]) espMap[e.id_solicitud_empresa] = [];
    espMap[e.id_solicitud_empresa].push({ id_especialidad: e.id_especialidad, nombre: e.nombre, codigo: e.codigo, turno: e.turno, cantidad_alumnos: e.cantidad_alumnos });
  });

  const transpMap = {};
  transp.forEach(t => {
    if (!transpMap[t.id_empresa]) transpMap[t.id_empresa] = [];
    transpMap[t.id_empresa].push({ id_transporte: t.id_transporte, nombre: t.nombre });
  });

  let cambiosPend = [];
  try {
    const [rowsC] = await pool.query(
      `SELECT id_solicitud_empresa, id_cambio, fecha_solicitud
         FROM dual_empresa_cambios
        WHERE estado = 'PENDIENTE'
          AND id_solicitud_empresa IN (?)`,
      [ids]
    );
    cambiosPend = rowsC;
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  const cambioMap = {};
  cambiosPend.forEach((c) => {
    cambioMap[c.id_solicitud_empresa] = {
      id_cambio: c.id_cambio,
      fecha_solicitud: c.fecha_solicitud,
    };
  });
  const convenioMap = {};
  convenios.forEach(d => {
    if (!convenioMap[d.id_solicitud_empresa]) {
      convenioMap[d.id_solicitud_empresa] = {
        id_documento: d.id_documento,
        validado: d.estado_validacion === 'VALIDADO',
      };
    }
  });

  const result = rows.map(r => {
    const conv = convenioMap[r.id_solicitud_empresa];
    return {
      ...r,
      // Aliased for frontend compatibility
      empresa: r.razonSocial,
      convocatoria_activa: Number(r.convocatoria_activa) === 1,
      idAuxEmpresa: r.id_solicitud_empresa,
      fechaPeticion: r.fecha_solicitud,
      especialidades: espMap[r.id_solicitud_empresa] || [],
      transportes: transpMap[r.id_empresa] || [],
      tieneConvenio: conv ? 1 : 0,
      convenio_validado: conv?.validado ? 1 : 0,
      id_documento_convenio: conv?.id_documento ?? null,
      cambio_pendiente: cambioMap[r.id_solicitud_empresa] ? 1 : 0,
      id_cambio_pendiente: cambioMap[r.id_solicitud_empresa]?.id_cambio ?? null,
      fecha_cambio_pendiente: cambioMap[r.id_solicitud_empresa]?.fecha_solicitud ?? null,
    };
  });

  return res.json(result);
};

// POST /solicitudes/empresa/reapply — authenticated empresa re-applies for the active convocatoria
exports.reapply = async function (req, res) {
  const { getCompanyIdFromUser } = require('../helpers/dbHelpers');
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const convocatoria = await getActiveConvocatoria();
  if (!convocatoria) {
    return res.status(409).json({ error: 'No hay ninguna convocatoria activa.' });
  }

  const {
    nombreCoordinador, emailCoordinador, telefonoCoordinador,
    descripcion_puesto,
    especialidades,
    transportes = [],
  } = req.body;

  if (!especialidades || !Array.isArray(especialidades) || especialidades.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos una especialidad.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Guard against duplicate applications in the same convocatoria
    const [solExist] = await conn.query(
      'SELECT id_solicitud_empresa FROM dual_solicitudes_empresa WHERE id_empresa = ? AND id_convocatoria = ?',
      [idEmpresa, convocatoria.id_convocatoria]
    );
    if (solExist[0]) {
      await conn.rollback();
      return res.status(409).json({ error: 'Ya existe una solicitud para la convocatoria activa.' });
    }

    // Reuse legal representative and addresses from the most recent previous application
    const [empData] = await conn.query(
      `SELECT se.id_representante_legal, se.id_domicilio_legal, se.id_domicilio_trabajo,
              coord.idcontacto AS id_coordinador_actual, coord.iddomicilio AS id_domicilio_coord
         FROM dual_solicitudes_empresa se
         JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
        WHERE se.id_empresa = ?
        ORDER BY se.fecha_solicitud DESC
        LIMIT 1`,
      [idEmpresa]
    );

    if (!empData[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'No se encontró una solicitud previa de esta empresa para copiar los datos base.' });
    }

    const prev = empData[0];

    // Update coordinator contact fields with any new values provided
    if (nombreCoordinador || emailCoordinador || telefonoCoordinador) {
      await conn.query(
        `UPDATE ge_contactos
            SET nombre = COALESCE(NULLIF(?, ''), nombre),
                email = COALESCE(NULLIF(?, ''), email),
                telefono = COALESCE(NULLIF(?, ''), telefono)
          WHERE idcontacto = ?`,
        [nombreCoordinador, emailCoordinador, telefonoCoordinador, prev.id_coordinador_actual]
      );
      // Display name may change with the coordinator; login remains the company CIF.
      if (nombreCoordinador) {
        await conn.query(
          `UPDATE dual_usuarios SET nombre_mostrar = COALESCE(NULLIF(?, ''), nombre_mostrar)
            WHERE id_contacto = ?`,
          [nombreCoordinador, prev.id_coordinador_actual]
        );
      }
    }

    // Create the new solicitud, reusing addresses and legal representative from the previous one
    const [solRes] = await conn.query(
      `INSERT INTO dual_solicitudes_empresa
         (id_empresa, id_convocatoria, id_estado_validacion, id_representante_legal,
          id_coordinador_empresa, id_domicilio_legal, id_domicilio_trabajo, descripcion_puesto)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [idEmpresa, convocatoria.id_convocatoria, prev.id_representante_legal,
        prev.id_coordinador_actual, prev.id_domicilio_legal, prev.id_domicilio_trabajo,
        descripcion_puesto || '']
    );
    const idSolicitudEmpresa = solRes.insertId;

    // Insert speciality rows for the new solicitud
    for (const esp of especialidades) {
      const idEsp = parseInt(esp.idEspecialidad, 10);
      const cant = parseInt(esp.cantidadAlumnos, 10);
      if (!idEsp || !cant || cant < 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'Especialidad inválida.' });
      }
      await conn.query(
        `INSERT INTO dual_solicitud_empresa_especialidades (id_solicitud_empresa, id_especialidad, cantidad_alumnos)
         VALUES (?, ?, ?)`,
        [idSolicitudEmpresa, idEsp, cant]
      );
    }

    // Replace all existing transport assignments for this empresa
    await conn.query('DELETE FROM dual_empresa_transportes WHERE id_empresa = ?', [idEmpresa]);
    for (const idT of transportes) {
      await conn.query('CALL sp_asignar_transporte_empresa(?, ?)', [idEmpresa, parseInt(idT, 10)]);
    }

    await conn.commit();

    return res.status(201).json({
      message: 'Reaplicación enviada correctamente.',
      id_solicitud_empresa: idSolicitudEmpresa,
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// GET /solicitudes/empresa/:id/documentos
exports.getDocumentos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });
  const [rows] = await pool.query(
    `SELECT d.id_documento, td.nombre AS tipo_documento, ev.nombre AS estado_validacion, d.motivo
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_solicitud_empresa = ?
      ORDER BY d.id_tipo_documento`,
    [id]
  );
  return res.json(rows);
};

async function resolveSolicitudForUser(req, idSolicitud) {
  const datos = await empresaDatos.loadEmpresaDatosRead(pool, idSolicitud);
  if (!datos) return { error: { status: 404, message: 'Solicitud no encontrada.' } };
  if (req.user.rol === 'EMPRESA') {
    const idEmpresa = await getCompanyIdFromUser(req.user.id);
    if (!idEmpresa || idEmpresa !== datos.id_empresa) {
      return { error: { status: 403, message: 'No tiene permiso para acceder a esta solicitud.' } };
    }
  }
  return { datos };
}

async function transportLabelMap(conn) {
  const [rows] = await conn.query(
    'SELECT id_transporte, nombre, nombre_mostrar FROM dual_transportes'
  );
  const map = {};
  rows.forEach((r) => {
    map[r.id_transporte] = r.nombre_mostrar || r.nombre;
  });
  return map;
}

function presentCambio(row, actualSnap, labels) {
  const payload = empresaDatos.parsePayload(row.payload) || {};
  const proposed = payload.proposed || {};
  return {
    id_cambio: row.id_cambio,
    id_solicitud_empresa: row.id_solicitud_empresa,
    estado: row.estado,
    fecha_solicitud: row.fecha_solicitud,
    fecha_resolucion: row.fecha_resolucion,
    motivo: row.motivo,
    proposed,
    snapshot: payload.snapshot || {},
    diff: empresaDatos.buildDiff(actualSnap, proposed, labels),
  };
}

exports.getDatos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { datos, error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });
  return res.json(datos);
};

exports.putDatos = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { datos, error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!datos.convocatoria_activa) {
    return res.status(400).json({ error: 'Solo se pueden editar los datos de la convocatoria activa.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const snapshot = empresaDatos.pickSnapshot(datos);
    const proposedAll = empresaDatos.sanitizeProposed(req.body, { allowCif: true });
    const proposed = empresaDatos.diffProposed(snapshot, proposedAll);
    if (!Object.keys(proposed).length) {
      await conn.rollback();
      return res.status(400).json({ error: 'No hay cambios respecto a los datos actuales.' });
    }
    await empresaDatos.applyEmpresaDatos(conn, datos, proposed, { allowCif: true });
    await conn.commit();
    const updated = await empresaDatos.loadEmpresaDatosRead(pool, id);
    return res.json({ message: 'Datos de la empresa actualizados.', datos: updated });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.getCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { datos, error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });

  const [pend] = await pool.query(
    `SELECT * FROM dual_empresa_cambios
      WHERE id_solicitud_empresa = ? AND estado = ?
      ORDER BY id_cambio DESC LIMIT 1`,
    [id, empresaDatos.ESTADOS_CAMBIO.PENDIENTE]
  );
  const [ultimo] = await pool.query(
    `SELECT * FROM dual_empresa_cambios
      WHERE id_solicitud_empresa = ? AND estado <> ?
      ORDER BY COALESCE(fecha_resolucion, fecha_solicitud) DESC, id_cambio DESC
      LIMIT 1`,
    [id, empresaDatos.ESTADOS_CAMBIO.PENDIENTE]
  );

  const labels = await transportLabelMap(pool);
  const actualSnap = empresaDatos.pickSnapshot(datos);
  return res.json({
    pending: pend[0] ? presentCambio(pend[0], actualSnap, labels) : null,
    ultimo: ultimo[0] ? presentCambio(ultimo[0], actualSnap, labels) : null,
  });
};

exports.upsertCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { datos, error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!datos.convocatoria_activa) {
    return res.status(400).json({ error: 'Solo se pueden solicitar cambios sobre la convocatoria activa.' });
  }
  if ('cif' in (req.body || {})) {
    return res.status(403).json({ error: 'El CIF no se puede modificar desde la empresa.' });
  }

  const proposedAll = empresaDatos.sanitizeProposed(req.body, { allowCif: false });
  const snapshot = empresaDatos.pickSnapshot(datos);
  const proposed = empresaDatos.diffProposed(snapshot, proposedAll);
  if (!Object.keys(proposed).length) {
    return res.status(400).json({ error: 'No hay cambios respecto a los datos actuales.' });
  }
  const invalid = empresaDatos.validateMerged({ ...snapshot, ...proposed }, { allowCif: false });
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pend] = await conn.query(
      `SELECT id_cambio FROM dual_empresa_cambios
        WHERE id_solicitud_empresa = ? AND estado = ?
        FOR UPDATE`,
      [id, empresaDatos.ESTADOS_CAMBIO.PENDIENTE]
    );

    const payload = JSON.stringify({ proposed, snapshot });
    let idCambio;
    if (pend[0]) {
      await conn.query(
        `UPDATE dual_empresa_cambios
            SET payload = ?, fecha_solicitud = NOW(), motivo = NULL
          WHERE id_cambio = ?`,
        [payload, pend[0].id_cambio]
      );
      idCambio = pend[0].id_cambio;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO dual_empresa_cambios
           (id_solicitud_empresa, id_empresa, id_usuario_solicitante, payload, estado)
         VALUES (?, ?, ?, ?, ?)`,
        [id, datos.id_empresa, req.user.id, payload, empresaDatos.ESTADOS_CAMBIO.PENDIENTE]
      );
      idCambio = ins.insertId;
    }
    await conn.commit();

    const labels = await transportLabelMap(pool);
    const [row] = await pool.query('SELECT * FROM dual_empresa_cambios WHERE id_cambio = ?', [idCambio]);
    return res.status(pend[0] ? 200 : 201).json({
      message: 'Cambios enviados para revisión',
      cambio: presentCambio(row[0], snapshot, labels),
    });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.aprobarCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const idCambio = parseInt(req.params.idCambio, 10);
  const confirmarConflicto = Boolean(req.body?.confirmar_conflicto);

  const { error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT * FROM dual_empresa_cambios
        WHERE id_cambio = ? AND id_solicitud_empresa = ?
        FOR UPDATE`,
      [idCambio, id]
    );
    const cambio = rows[0];
    if (!cambio) {
      await conn.rollback();
      return res.status(404).json({ error: 'Solicitud de cambio no encontrada.' });
    }
    if (cambio.estado !== empresaDatos.ESTADOS_CAMBIO.PENDIENTE) {
      await conn.rollback();
      return res.status(400).json({ error: 'Esta solicitud de cambio ya está resuelta.' });
    }

    const payload = empresaDatos.parsePayload(cambio.payload) || {};
    const proposed = payload.proposed || {};
    const snapshot = payload.snapshot || {};
    const live = await empresaDatos.loadEmpresaDatos(conn, id);
    const liveSnap = empresaDatos.pickSnapshot(live);
    const conflictos = empresaDatos.detectConflicts(snapshot, liveSnap, proposed);

    if (conflictos.length && !confirmarConflicto) {
      await conn.rollback();
      const labels = await transportLabelMap(pool);
      return res.status(409).json({
        error: 'Los datos actuales han cambiado desde que se envió la solicitud.',
        conflictos: conflictos.map((c) => ({
          ...c,
          label: empresaDatos.FIELD_DEFS[c.field]?.label || c.field,
        })),
        diff: empresaDatos.buildDiff(liveSnap, proposed, labels),
        requires_confirm: true,
      });
    }

    await empresaDatos.applyEmpresaDatos(conn, live, proposed, { allowCif: false });
    await conn.query(
      `UPDATE dual_empresa_cambios
          SET estado = ?, fecha_resolucion = NOW(), id_usuario_resolutor = ?, motivo = NULL
        WHERE id_cambio = ?`,
      [empresaDatos.ESTADOS_CAMBIO.APROBADO, req.user.id, idCambio]
    );
    await conn.commit();

    const updated = await empresaDatos.loadEmpresaDatosRead(pool, id);
    return res.json({ message: 'Cambios aprobados y aplicados.', datos: updated });
  } catch (err) {
    await conn.rollback();
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

exports.rechazarCambio = async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const idCambio = parseInt(req.params.idCambio, 10);
  const motivo = String(req.body?.motivo || '').trim();
  if (!motivo) {
    return res.status(400).json({ error: 'Debe indicar el motivo del rechazo.' });
  }

  const { error } = await resolveSolicitudForUser(req, id);
  if (error) return res.status(error.status).json({ error: error.message });

  const [rows] = await pool.query(
    `SELECT id_cambio, estado FROM dual_empresa_cambios
      WHERE id_cambio = ? AND id_solicitud_empresa = ?`,
    [idCambio, id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Solicitud de cambio no encontrada.' });
  if (rows[0].estado !== empresaDatos.ESTADOS_CAMBIO.PENDIENTE) {
    return res.status(400).json({ error: 'Esta solicitud de cambio ya está resuelta.' });
  }

  await pool.query(
    `UPDATE dual_empresa_cambios
        SET estado = ?, fecha_resolucion = NOW(), id_usuario_resolutor = ?, motivo = ?
      WHERE id_cambio = ?`,
    [empresaDatos.ESTADOS_CAMBIO.RECHAZADO, req.user.id, motivo, idCambio]
  );
  return res.json({ message: 'Solicitud de cambio rechazada.' });
};
