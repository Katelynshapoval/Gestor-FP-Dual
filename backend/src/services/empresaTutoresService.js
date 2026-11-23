const pool = require('../db/pool');
const {
  getCompanyIdFromUser,
  sendSqlError,
  dniNieValido,
  normalizeDni,
} = require('../helpers/dbHelpers');
const { recordEvent } = require('./auditLog');

function parseId(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^\+?[0-9]{9,15}$/;

// Stores what people type in one shape (lower-case email, phone without
// spaces, DNI in capitals) and says what is wrong, in Spanish. A typo in a
// tutor's email means their notices never arrive; the DNI goes on the anexos.
function formatoTutor(fields) {
  if (fields.email) fields.email = fields.email.toLowerCase();
  if (fields.telefono) fields.telefono = fields.telefono.replace(/[\s.\-()/]/g, '');
  if (fields.dni) fields.dni = normalizeDni(fields.dni);
  if (fields.email && !EMAIL_RE.test(fields.email)) return 'El email del tutor no es válido.';
  if (fields.telefono && !TEL_RE.test(fields.telefono)) return 'El teléfono del tutor no es válido (al menos 9 cifras).';
  if (fields.dni && !dniNieValido(fields.dni)) return 'El DNI/NIE del tutor no es válido.';
  return null;
}

// Reservations a tutor is looking after now: not cancelled, in the active
// convocatoria. A confirmed placement of an earlier year is finished, so it
// does not hold the tutor back.
const RESERVAS_EN_CURSO_JOINS = `
    FROM dual_reservas r_ac
    JOIN dual_estados_reserva er_ac ON er_ac.id_estado_reserva = r_ac.id_estado_reserva
    JOIN dual_solicitud_empresa_especialidades ee_ac
      ON ee_ac.id_solicitud_empresa_especialidad = r_ac.id_solicitud_empresa_especialidad
    JOIN dual_solicitudes_empresa se_ac ON se_ac.id_solicitud_empresa = ee_ac.id_solicitud_empresa
    JOIN dual_convocatorias cv_ac ON cv_ac.id_convocatoria = se_ac.id_convocatoria`;
const RESERVAS_EN_CURSO_WHERE = `er_ac.nombre <> 'CANCELADA' AND cv_ac.activa = 1`;

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
      c.cargo,
      EXISTS (
        SELECT 1 FROM dual_solicitudes_empresa se_coord
         WHERE se_coord.id_empresa = t.id_empresa
           AND se_coord.id_coordinador_empresa = t.id_contacto
      ) AS es_coordinador,
      (SELECT COUNT(*) ${RESERVAS_EN_CURSO_JOINS}
        WHERE ${RESERVAS_EN_CURSO_WHERE}
          AND r_ac.id_empresa_tutor = t.id_empresa_tutor) AS reservas_en_curso,
      (SELECT COUNT(*) FROM dual_reservas r_all
        WHERE r_all.id_empresa_tutor = t.id_empresa_tutor) AS reservas_total
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

// SEC-4: the principal coordinator is also a tutor row, but companies may only
// change it through the reviewed "Editar datos" workflow, not from Tutores.
const COORDINADOR_PROTEGIDO =
  'El coordinador principal no se modifica desde Tutores. Usa «Mis datos › Editar datos»; el cambio lo revisa el centro.';

// Staff may switch the coordinator's tutor entry on and off, but its data is
// changed only through the company's «Editar datos», which keeps earlier
// years' applications pointing at the old values (WF-11, empresaDatos.js).
const COORDINADOR_DATOS_STAFF =
  'Los datos del coordinador principal se cambian en «Información» con el lápiz (editar datos de la empresa), que conserva los de años anteriores.';

// Students whose current placement has this tutor (names, for the message).
async function alumnosEnCurso(conn, idEmpresaTutor) {
  const [rows] = await conn.query(
    `SELECT a.nombre AS alumno
       ${RESERVAS_EN_CURSO_JOINS}
       JOIN dual_solicitudes_alumno sa_ac ON sa_ac.id_solicitud_alumno = r_ac.id_solicitud_alumno
       JOIN gf_alumnosfct a ON a.idalumno = sa_ac.id_alumno
      WHERE ${RESERVAS_EN_CURSO_WHERE}
        AND r_ac.id_empresa_tutor = ?
      ORDER BY a.nombre`,
    [idEmpresaTutor]
  );
  return rows.map((r) => r.alumno);
}

// Another tutor of the company with the same email (active or not): it is the
// same person, so they are edited or reactivated instead of duplicated.
async function tutorConEmail(conn, idEmpresa, email, exceptoIdTutor = null) {
  const [rows] = await conn.query(
    `SELECT t.id_empresa_tutor, t.activo, c.nombre
       FROM dual_empresa_tutores t
       JOIN ge_contactos c ON c.idcontacto = t.id_contacto
      WHERE t.id_empresa = ? AND LOWER(c.email) = ?
        AND (? IS NULL OR t.id_empresa_tutor <> ?)
      LIMIT 1`,
    [idEmpresa, email, exceptoIdTutor, exceptoIdTutor]
  );
  return rows[0] || null;
}

function emailRepetido(otro) {
  return Number(otro.activo)
    ? `${otro.nombre} ya es tutor de esta empresa con ese email.`
    : `${otro.nombre} ya está registrado con ese email, pero desactivado: reactívalo en lugar de crearlo de nuevo.`;
}

async function isCoordinadorDeEmpresa(conn, idContacto, idEmpresa) {
  const [rows] = await conn.query(
    `SELECT 1 AS es
       FROM dual_solicitudes_empresa
      WHERE id_empresa = ? AND id_coordinador_empresa = ?
      LIMIT 1`,
    [idEmpresa, idContacto]
  );
  return !!rows[0];
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

  const datos = {
    email: trimOrNull(req.body?.email),
    telefono: trimOrNull(req.body?.telefono),
    dni: trimOrNull(req.body?.dni),
  };
  const nombre = trimOrNull(req.body?.nombre);
  const cargo = trimOrNull(req.body?.cargo) || 'TUTOR EMPRESA';

  if (!nombre) return res.status(400).json({ error: 'El nombre del tutor es obligatorio.' });
  if (!datos.email) return res.status(400).json({ error: 'El email del tutor es obligatorio.' });
  if (!datos.telefono) return res.status(400).json({ error: 'El teléfono del tutor es obligatorio.' });
  const formato = formatoTutor(datos);
  if (formato) return res.status(400).json({ error: formato });
  const { email, telefono, dni } = datos;

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

    // The company row lock above makes two simultaneous adds take turns.
    const otro = await tutorConEmail(conn, idEmpresa, email);
    if (otro) {
      await conn.rollback();
      return res.status(409).json({ error: emailRepetido(otro), code: 'EMAIL_REPETIDO', id_empresa_tutor: otro.id_empresa_tutor });
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

    // DB-11 (migration 018): tutor changes are audited (ids only, no personal data).
    await recordEvent(conn, {
      entidad: 'TUTOR', id: insTutor.insertId, accion: 'ALTA', despues: 'ACTIVO', user: req.user,
      detalle: { id_empresa: idEmpresa },
    });

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

    if (await isCoordinadorDeEmpresa(conn, tutor.id_contacto, tutor.id_empresa)) {
      await conn.rollback();
      const error = req.user.rol === 'EMPRESA' ? COORDINADOR_PROTEGIDO : COORDINADOR_DATOS_STAFF;
      return res.status(403).json({ error, code: 'COORDINADOR_PRINCIPAL' });
    }

    const fields = {
      nombre: trimOrNull(req.body?.nombre),
      email: trimOrNull(req.body?.email),
      telefono: trimOrNull(req.body?.telefono),
      dni: trimOrNull(req.body?.dni),
      cargo: trimOrNull(req.body?.cargo),
    };
    const formato = formatoTutor(fields);
    if (formato) {
      await conn.rollback();
      return res.status(400).json({ error: formato });
    }

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

    if (fields.email && Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      // Same turn-taking as an add: two edits cannot both take one email.
      await conn.query('SELECT idempresa FROM ge_empresas WHERE idempresa = ? FOR UPDATE', [tutor.id_empresa]);
      const otro = await tutorConEmail(conn, tutor.id_empresa, fields.email, idTutor);
      if (otro) {
        await conn.rollback();
        return res.status(409).json({ error: emailRepetido(otro), code: 'EMAIL_REPETIDO', id_empresa_tutor: otro.id_empresa_tutor });
      }
    }

    params.push(tutor.id_contacto);
    await conn.query(`UPDATE ge_contactos SET ${sets.join(', ')} WHERE idcontacto = ?`, params);
    await recordEvent(conn, {
      entidad: 'TUTOR', id: idTutor, accion: 'EDITAR', user: req.user,
      detalle: { id_empresa: tutor.id_empresa, campos: sets.map((x) => x.split(' ')[0]) },
    });

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

    if (req.user.rol === 'EMPRESA' && await isCoordinadorDeEmpresa(conn, tutor.id_contacto, tutor.id_empresa)) {
      await conn.rollback();
      return res.status(403).json({ error: COORDINADOR_PROTEGIDO, code: 'COORDINADOR_PRINCIPAL' });
    }

    if (!tutor.activo) {
      const current = await loadTutorForEmpresa(conn, idTutor, tutor.id_empresa);
      await conn.commit();
      return res.json(current);
    }

    // A student must not be left with an inactive tutor. No race with an
    // assignment: assignToReserva locks this same tutor row and re-reads
    // `activo`, so whichever commits second sees the other's change.
    const alumnos = await alumnosEnCurso(conn, idTutor);
    if (alumnos.length) {
      await conn.rollback();
      return res.status(409).json({
        error: `No se puede desactivar: es el tutor de ${alumnos.join(', ')} este curso. Asigna otro tutor en sus reservas y vuelve a intentarlo.`,
        code: 'TUTOR_ASIGNADO',
        alumnos,
      });
    }

    await conn.query(
      'UPDATE dual_empresa_tutores SET activo = 0 WHERE id_empresa_tutor = ?',
      [idTutor]
    );
    await recordEvent(conn, {
      entidad: 'TUTOR', id: idTutor, accion: 'DESACTIVAR', antes: 'ACTIVO', despues: 'INACTIVO',
      user: req.user, detalle: { id_empresa: tutor.id_empresa },
    });

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

// POST /tutores/:id/activar — undoes a deactivation
exports.activate = async function (req, res) {
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

    if (req.user.rol === 'EMPRESA' && await isCoordinadorDeEmpresa(conn, tutor.id_contacto, tutor.id_empresa)) {
      await conn.rollback();
      return res.status(403).json({ error: COORDINADOR_PROTEGIDO, code: 'COORDINADOR_PRINCIPAL' });
    }

    if (!tutor.activo) {
      await conn.query(
        'UPDATE dual_empresa_tutores SET activo = 1 WHERE id_empresa_tutor = ?',
        [idTutor]
      );
      await recordEvent(conn, {
        entidad: 'TUTOR', id: idTutor, accion: 'ACTIVAR', antes: 'INACTIVO', despues: 'ACTIVO',
        user: req.user, detalle: { id_empresa: tutor.id_empresa },
      });
    }

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
        FOR UPDATE OF r`,
      [idReserva]
    );
    // OF r: only the reservation is locked. Locking the joined offer and company
    // application after it would invert the lock order of migration 018.
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
    if (!((reserva.id_empresa_tutor ?? null) === (idEmpresaTutor ?? null))) {
      await recordEvent(conn, {
        entidad: 'RESERVA', id: idReserva, accion: 'TUTOR',
        antes: reserva.id_empresa_tutor != null ? String(reserva.id_empresa_tutor) : null,
        despues: idEmpresaTutor != null ? String(idEmpresaTutor) : null,
        user: req.user,
      });
    }

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

