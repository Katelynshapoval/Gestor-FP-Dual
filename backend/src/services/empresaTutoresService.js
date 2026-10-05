const pool = require('../db/pool');
const {
  getCompanyIdFromUser,
  sendSqlError,
} = require('../helpers/dbHelpers');

function parseId(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function tutorSelectSql(whereSql) {
  return `
    SELECT
      t.id_empresa_tutor,
      t.id_empresa,
      t.id_contacto,
      t.activo,
      t.creado_en,
      t.actualizado_en,
      c.nombre,
      c.dni,
      c.email,
      c.telefono,
      c.cargo
    FROM dual_empresa_tutores t
    JOIN ge_contactos c ON c.idcontacto = t.id_contacto
    ${whereSql}
    ORDER BY t.activo DESC, c.nombre ASC`;
}

async function resolveOwnedEmpresaId(req, explicitIdEmpresa) {
  const role = req.user?.rol;
  if (role === 'EMPRESA') {
    const ownId = await getCompanyIdFromUser(req.user.id);
    if (!ownId) {
      return { error: { status: 404, message: 'No se encontró empresa vinculada a este usuario.' } };
    }
    if (explicitIdEmpresa != null && explicitIdEmpresa !== ownId) {
      return { error: { status: 403, message: 'No puedes gestionar tutores de otra empresa.' } };
    }
    return { idEmpresa: ownId };
  }
  if (role === 'ADMINISTRADOR' || role === 'COORDINADOR') {
    if (!explicitIdEmpresa) {
      return { error: { status: 400, message: 'Se requiere id de empresa.' } };
    }
    return { idEmpresa: explicitIdEmpresa };
  }
  return { error: { status: 403, message: 'No autorizado.' } };
}

async function getWorkDomicilioId(conn, idEmpresa) {
  const [fromSol] = await conn.query(
    `SELECT se.id_domicilio_trabajo AS iddomicilio
       FROM dual_solicitudes_empresa se
      WHERE se.id_empresa = ?
      ORDER BY se.id_solicitud_empresa DESC
      LIMIT 1`,
    [idEmpresa]
  );
  if (fromSol[0]?.iddomicilio) return fromSol[0].iddomicilio;

  const [fromDom] = await conn.query(
    `SELECT iddomicilio FROM ge_domicilios WHERE idempresa = ? ORDER BY iddomicilio DESC LIMIT 1`,
    [idEmpresa]
  );
  return fromDom[0]?.iddomicilio ?? null;
}

async function loadTutorForEmpresa(conn, idEmpresaTutor, idEmpresa) {
  const [rows] = await conn.query(
    tutorSelectSql('WHERE t.id_empresa_tutor = ? AND t.id_empresa = ?'),
    [idEmpresaTutor, idEmpresa]
  );
  return rows[0] || null;
}

// GET /tutores/empresa — EMPRESA own tutors
// GET /tutores/empresa/:idEmpresa — staff (or EMPRESA if own)
exports.list = async function (req, res) {
  const explicit = req.params.idEmpresa != null ? parseId(req.params.idEmpresa) : null;
  if (req.params.idEmpresa != null && !explicit) {
    return res.status(400).json({ error: 'Identificador de empresa no válido.' });
  }

  const { idEmpresa, error } = await resolveOwnedEmpresaId(req, explicit);
  if (error) return res.status(error.status).json({ error: error.message });

  const onlyActive = String(req.query.activo || '') === '1';
  const where = onlyActive
    ? 'WHERE t.id_empresa = ? AND t.activo = 1'
    : 'WHERE t.id_empresa = ?';

  const [rows] = await pool.query(tutorSelectSql(where), [idEmpresa]);
  return res.json(rows);
};

// POST /tutores/empresa
// POST /tutores/empresa/:idEmpresa
exports.create = async function (req, res) {
  const explicit = req.params.idEmpresa != null ? parseId(req.params.idEmpresa) : null;
  if (req.params.idEmpresa != null && !explicit) {
    return res.status(400).json({ error: 'Identificador de empresa no válido.' });
  }

  const { idEmpresa, error } = await resolveOwnedEmpresaId(req, explicit);
  if (error) return res.status(error.status).json({ error: error.message });

  const nombre = trimOrNull(req.body?.nombre);
  const email = trimOrNull(req.body?.email);
  const telefono = trimOrNull(req.body?.telefono);
  const dni = trimOrNull(req.body?.dni);
  const cargo = trimOrNull(req.body?.cargo) || 'TUTOR EMPRESA';

  if (!nombre) return res.status(400).json({ error: 'El nombre del tutor es obligatorio.' });
  if (!email) return res.status(400).json({ error: 'El email del tutor es obligatorio.' });
  if (!telefono) return res.status(400).json({ error: 'El teléfono del tutor es obligatorio.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [emp] = await conn.query(
      'SELECT idempresa FROM ge_empresas WHERE idempresa = ? FOR UPDATE',
      [idEmpresa]
    );
    if (!emp[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    const idDomicilio = await getWorkDomicilioId(conn, idEmpresa);
    if (!idDomicilio) {
      await conn.rollback();
      return res.status(400).json({ error: 'La empresa no tiene domicilio para asociar el tutor.' });
    }

    const [insContacto] = await conn.query(
      `INSERT INTO ge_contactos (
         iddomicilio, dni, nombre, email, telefono, cargo, observaciones, especialidad
       ) VALUES (?, ?, ?, ?, ?, ?, '', '')`,
      [idDomicilio, dni || '', nombre, email, telefono, cargo]
    );
    const idContacto = insContacto.insertId;

    const [insTutor] = await conn.query(
      `INSERT INTO dual_empresa_tutores (id_empresa, id_contacto, activo)
       VALUES (?, ?, 1)`,
      [idEmpresa, idContacto]
    );

    const tutor = await loadTutorForEmpresa(conn, insTutor.insertId, idEmpresa);
    await conn.commit();
    return res.status(201).json(tutor);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Este contacto ya está registrado como tutor de la empresa.' });
    }
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// PATCH /tutores/:id
exports.update = async function (req, res) {
  const idTutor = parseId(req.params.id);
  if (!idTutor) return res.status(400).json({ error: 'Identificador de tutor no válido.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT t.id_empresa_tutor, t.id_empresa, t.id_contacto, t.activo
         FROM dual_empresa_tutores t
        WHERE t.id_empresa_tutor = ?
        FOR UPDATE`,
      [idTutor]
    );
    const tutor = rows[0];
    if (!tutor) {
      await conn.rollback();
      return res.status(404).json({ error: 'Tutor no encontrado.' });
    }

    const { error } = await resolveOwnedEmpresaId(req, tutor.id_empresa);
    if (error) {
      await conn.rollback();
      return res.status(error.status).json({ error: error.message });
    }

    const fields = {
      nombre: trimOrNull(req.body?.nombre),
      email: trimOrNull(req.body?.email),
      telefono: trimOrNull(req.body?.telefono),
      dni: trimOrNull(req.body?.dni),
      cargo: trimOrNull(req.body?.cargo),
    };

    const sets = [];
    const params = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== null && req.body && Object.prototype.hasOwnProperty.call(req.body, col)) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    }

    // Allow clearing DNI with empty string when explicitly sent
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'dni') && fields.dni === null) {
      if (!sets.some((s) => s.startsWith('dni'))) {
        sets.push('dni = ?');
        params.push('');
      }
    }

    if (!sets.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'No hay campos para actualizar.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'nombre') && !fields.nombre) {
      await conn.rollback();
      return res.status(400).json({ error: 'El nombre del tutor es obligatorio.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email') && !fields.email) {
      await conn.rollback();
      return res.status(400).json({ error: 'El email del tutor es obligatorio.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'telefono') && !fields.telefono) {
      await conn.rollback();
      return res.status(400).json({ error: 'El teléfono del tutor es obligatorio.' });
    }

    params.push(tutor.id_contacto);
    await conn.query(`UPDATE ge_contactos SET ${sets.join(', ')} WHERE idcontacto = ?`, params);

    const updated = await loadTutorForEmpresa(conn, idTutor, tutor.id_empresa);
    await conn.commit();
    return res.json(updated);
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// POST /tutores/:id/desactivar
exports.deactivate = async function (req, res) {
  const idTutor = parseId(req.params.id);
  if (!idTutor) return res.status(400).json({ error: 'Identificador de tutor no válido.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT t.id_empresa_tutor, t.id_empresa, t.activo
         FROM dual_empresa_tutores t
        WHERE t.id_empresa_tutor = ?
        FOR UPDATE`,
      [idTutor]
    );
    const tutor = rows[0];
    if (!tutor) {
      await conn.rollback();
      return res.status(404).json({ error: 'Tutor no encontrado.' });
    }

    const { error } = await resolveOwnedEmpresaId(req, tutor.id_empresa);
    if (error) {
      await conn.rollback();
      return res.status(error.status).json({ error: error.message });
    }

    if (!tutor.activo) {
      const current = await loadTutorForEmpresa(conn, idTutor, tutor.id_empresa);
      await conn.commit();
      return res.json(current);
    }

    await conn.query(
      'UPDATE dual_empresa_tutores SET activo = 0 WHERE id_empresa_tutor = ?',
      [idTutor]
    );

    const updated = await loadTutorForEmpresa(conn, idTutor, tutor.id_empresa);
    await conn.commit();
    return res.json(updated);
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// PATCH /reservas/:id/tutor  body: { id_empresa_tutor: number | null }
exports.assignToReserva = async function (req, res) {
  const idReserva = parseId(req.params.id);
  if (!idReserva) return res.status(400).json({ error: 'Identificador de reserva no válido.' });

  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'id_empresa_tutor')) {
    return res.status(400).json({ error: 'Se requiere id_empresa_tutor (número o null).' });
  }

  const rawTutor = req.body.id_empresa_tutor;
  const clearTutor = rawTutor === null || rawTutor === '';
  const idEmpresaTutor = clearTutor ? null : parseId(rawTutor);
  if (!clearTutor && !idEmpresaTutor) {
    return res.status(400).json({ error: 'id_empresa_tutor no válido.' });
  }

  const role = req.user?.rol;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [resRows] = await conn.query(
      `SELECT r.id_reserva, r.id_empresa_tutor, r.id_estado_reserva,
              se.id_empresa, er.nombre AS estado_reserva
         FROM dual_reservas r
         JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         JOIN dual_solicitud_empresa_especialidades ee
           ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
         JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
        WHERE r.id_reserva = ?
        FOR UPDATE`,
      [idReserva]
    );
    const reserva = resRows[0];
    if (!reserva) {
      await conn.rollback();
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    if (role === 'EMPRESA') {
      const ownId = await getCompanyIdFromUser(req.user.id);
      if (!ownId || ownId !== reserva.id_empresa) {
        await conn.rollback();
        return res.status(403).json({ error: 'No puedes modificar reservas de otra empresa.' });
      }
    } else if (role !== 'ADMINISTRADOR' && role !== 'COORDINADOR') {
      await conn.rollback();
      return res.status(403).json({ error: 'No autorizado.' });
    }

    if (reserva.estado_reserva === 'CANCELADA') {
      await conn.rollback();
      return res.status(400).json({ error: 'No se puede asignar tutor a una reserva cancelada.' });
    }

    if (idEmpresaTutor != null) {
      const [tutRows] = await conn.query(
        `SELECT t.id_empresa_tutor, t.id_empresa, t.activo
           FROM dual_empresa_tutores t
          WHERE t.id_empresa_tutor = ?
          FOR UPDATE`,
        [idEmpresaTutor]
      );
      const tutor = tutRows[0];
      if (!tutor) {
        await conn.rollback();
        return res.status(404).json({ error: 'Tutor no encontrado.' });
      }
      if (tutor.id_empresa !== reserva.id_empresa) {
        await conn.rollback();
        return res.status(400).json({ error: 'El tutor debe pertenecer a la misma empresa que la reserva.' });
      }
      if (!tutor.activo) {
        await conn.rollback();
        return res.status(400).json({ error: 'No se puede asignar un tutor inactivo.' });
      }
    }

    await conn.query(
      'UPDATE dual_reservas SET id_empresa_tutor = ? WHERE id_reserva = ?',
      [idEmpresaTutor, idReserva]
    );

    const [out] = await conn.query(
      `SELECT
          r.id_reserva,
          r.id_empresa_tutor,
          t.activo AS tutor_activo,
          c.nombre AS tutor_nombre,
          c.email AS tutor_email,
          c.telefono AS tutor_telefono
         FROM dual_reservas r
         LEFT JOIN dual_empresa_tutores t ON t.id_empresa_tutor = r.id_empresa_tutor
         LEFT JOIN ge_contactos c ON c.idcontacto = t.id_contacto
        WHERE r.id_reserva = ?`,
      [idReserva]
    );

    await conn.commit();
    return res.json(out[0]);
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

