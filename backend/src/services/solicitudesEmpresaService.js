const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { getActiveConvocatoria, sendSqlError } = require('../helpers/dbHelpers');

let transporter = null;
try {
  const mc = require('../mail/config');
  transporter = mc.transporter;
} catch { /* mail not configured */ }

async function sendCompanyConfirmationEmail(email, empresa, convocatoria, convenioUrl) {
  if (!transporter) {
    console.warn('Mail no configurado. URL de convenio para', empresa, ':', convenioUrl);
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
    console.error('Error enviando email empresa:', err.message);
  }
}

// POST /solicitudes/empresa — public: create company application
exports.create = async function (req, res) {
  const {
    // Empresa
    cif, empresa: empresaNombre, web = '', observaciones = '',
    emailEmpresa = '', telefonoEmpresa = '', menosdecincotrabajadores = 0,
    // Domicilio legal
    domicilioLegal, cpLegal, provinciaLegal, localidadLegal, municipioLegal = '',
    telefonoLegal = '', emailLegal = '',
    // Domicilio trabajo (puede ser igual al legal)
    mismoLugarTrabajo,
    domicilioTrabajo, cpTrabajo, provinciaTrabajo, localidadTrabajo, municipioTrabajo = '',
    telefonoTrabajo = '', emailTrabajo = '',
    // Representante legal
    dniRepresentante, nombreRepresentante, emailRepresentante, telefonoRepresentante,
    cargoRepresentante = 'REPRESENTANTE LEGAL',
    // Coordinador empresa
    dniCoordinador, nombreCoordinador, emailCoordinador, telefonoCoordinador,
    cargoCoordinador = 'COORDINADOR DUAL',
    // Solicitud
    descripcion_puesto,
    // Especialidades: [{ idEspecialidad, cantidadAlumnos }]
    especialidades,
    // Transportes: [id_transporte, ...]
    transportes = [],
    // Contraseña para cuenta coordinador
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Upsert empresa by CIF
    let idEmpresa;
    const [empExist] = await conn.query(
      'SELECT idempresa FROM ge_empresas WHERE cif = ? FOR UPDATE',
      [cif]
    );
    if (empExist[0]) {
      idEmpresa = empExist[0].idempresa;
      await conn.query(
        `UPDATE ge_empresas SET empresa = ?, web = ?, observaciones = ?,
                emailEmpresa = ?, telefonoEmpresa = ?, menosdecincotrabajadores = ?
          WHERE idempresa = ?`,
        [empresaNombre, web, observaciones, emailEmpresa, telefonoEmpresa,
          menosdecincotrabajadores ? 1 : 0, idEmpresa]
      );
    } else {
      const [r] = await conn.query(
        `INSERT INTO ge_empresas (cif, empresa, convenio, fechaconvenio, web, observaciones,
                                   emailEmpresa, telefonoEmpresa, menosdecincotrabajadores)
         VALUES (?, ?, '', '1000-01-01', ?, ?, ?, ?, ?)`,
        [cif, empresaNombre, web, observaciones, emailEmpresa, telefonoEmpresa,
          menosdecincotrabajadores ? 1 : 0]
      );
      idEmpresa = r.insertId;
    }

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
    await conn.query(
      `INSERT INTO dual_usuarios (nombre_mostrar, email, password_hash, id_rol, id_contacto, activo, must_change_password)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [nombreCoordinador, emailCoordinador, hash, idRol, idCoordinador]
    );

    // Genera token seguro para subida pública del convenio
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
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
  const [rows] = await pool.query(
    `SELECT se.*, ev.nombre AS estado_validacion, emp.empresa, emp.cif, c.nombre AS convocatoria,
            rep.nombre AS representante_nombre, rep.email AS representante_email, rep.telefono AS representante_telefono,
            coord.nombre AS coordinador_nombre, coord.email AS coordinador_email, coord.telefono AS coordinador_telefono,
            dl.domicilio AS domicilio_legal, dl.cp AS cp_legal, dl.provincia AS provincia_legal,
            dl.localidad AS localidad_legal,
            dt.domicilio AS domicilio_trabajo, dt.cp AS cp_trabajo, dt.provincia AS provincia_trabajo,
            dt.localidad AS localidad_trabajo
       FROM dual_solicitudes_empresa se
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = se.id_estado_validacion
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN ge_contactos rep ON rep.idcontacto = se.id_representante_legal
       JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
       JOIN ge_domicilios dl ON dl.iddomicilio = se.id_domicilio_legal
       JOIN ge_domicilios dt ON dt.iddomicilio = se.id_domicilio_trabajo
      WHERE se.id_solicitud_empresa = ?`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada.' });

  // Especialidades
  const [esps] = await pool.query(
    `SELECT see.id_solicitud_empresa_especialidad, see.id_especialidad, see.cantidad_alumnos,
            esp.codigo, esp.nombre,
            CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno
       FROM dual_solicitud_empresa_especialidades see
       JOIN dual_especialidades esp ON esp.id_especialidad = see.id_especialidad
      WHERE see.id_solicitud_empresa = ?`,
    [id]
  );
  rows[0].especialidades = esps;

  return res.json(rows[0]);
};

// GET /solicitudes/empresa/:id/especialidades — speciality list + quotas
exports.getEspecialidades = async function (req, res) {
  const id = parseInt(req.params.id, 10);
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

// GET /solicitudes/empresa/todas — admin: lista completa con datos normalizados
// Compatible con el panel de administración (antes /getAllCompanies)
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
        u.email AS username
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

  // Para cada solicitud, carga especialidades, transportes y estado del convenio
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
      // Aliased para compatibilidad con frontend existente
      idAuxEmpresa: r.id_solicitud_empresa,
      fechaPeticion: r.fecha_solicitud,
      especialidades: espMap[r.id_solicitud_empresa] || [],
      transportes: transpMap[r.id_empresa] || [],
      tieneConvenio: conv ? 1 : 0,
      convenio_validado: conv?.validado ? 1 : 0,
      id_documento_convenio: conv?.id_documento ?? null,
    };
  });

  return res.json(result);
};

// POST /solicitudes/empresa/reapply — empresa autenticada: reaplicar en la convocatoria activa
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

    // Comprueba que no haya ya una solicitud para esta convocatoria
    const [solExist] = await conn.query(
      'SELECT id_solicitud_empresa FROM dual_solicitudes_empresa WHERE id_empresa = ? AND id_convocatoria = ?',
      [idEmpresa, convocatoria.id_convocatoria]
    );
    if (solExist[0]) {
      await conn.rollback();
      return res.status(409).json({ error: 'Ya existe una solicitud para la convocatoria activa.' });
    }

    // Recupera datos actuales de la empresa para reutilizar representante legal y domicilios
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

    // Actualiza datos del coordinador si se proporcionaron
    if (nombreCoordinador || emailCoordinador || telefonoCoordinador) {
      await conn.query(
        `UPDATE ge_contactos
            SET nombre = COALESCE(NULLIF(?, ''), nombre),
                email = COALESCE(NULLIF(?, ''), email),
                telefono = COALESCE(NULLIF(?, ''), telefono)
          WHERE idcontacto = ?`,
        [nombreCoordinador, emailCoordinador, telefonoCoordinador, prev.id_coordinador_actual]
      );
      // Actualiza también el email del usuario si cambió
      if (emailCoordinador) {
        await conn.query(
          `UPDATE dual_usuarios SET email = ?, nombre_mostrar = COALESCE(NULLIF(?, ''), nombre_mostrar)
            WHERE id_contacto = ?`,
          [emailCoordinador, nombreCoordinador, prev.id_coordinador_actual]
        );
      }
    }

    // Crea nueva solicitud
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

    // Especialidades
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

    // Transportes (reemplaza los actuales de la empresa)
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
