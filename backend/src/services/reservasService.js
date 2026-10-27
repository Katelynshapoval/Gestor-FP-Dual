const pool = require('../db/pool');
const { getCompanyIdFromUser, getStudentIdFromUser, sendSqlError, callProcedureWithResult, callProcedure } = require('../helpers/dbHelpers');
const { attachSolicitudDocumentos } = require('./documentosWorkflow');
const { ESTADOS_RESERVA } = require('../constants/reservaEstados');
const { anexoClaveSql, anexoClaveForContrato, defByClave } = require('./documentCatalogue');
const { recordEvent, recordEventAfterCommit } = require('./auditLog');
const reglas = require('./estadoReglas');

// Current annex of the stored contract family (Anexo III for beca, II otherwise).
const ANEXO_SQL = anexoClaveSql('tc');

function parseId(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function loadReservaPair(idSolicitudAlumno, idOferta) {
  const [rows] = await pool.query(
    `SELECT r.id_reserva, er.nombre AS estado_reserva
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
      WHERE r.id_solicitud_alumno = ?
        AND r.id_solicitud_empresa_especialidad = ?
      LIMIT 1`,
    [idSolicitudAlumno, idOferta]
  );
  return rows[0] || null;
}

async function resolveReservaId(callRow, idSolicitudAlumno, idOferta) {
  const fromCall = parseId(callRow?.id_reserva);
  if (fromCall) return fromCall;
  const pair = await loadReservaPair(idSolicitudAlumno, idOferta);
  return parseId(pair?.id_reserva);
}

async function validateReservaTargets(idSolicitudAlumno, idOferta, { requireActive = false } = {}) {
  const [rows] = await pool.query(
    `SELECT
        sa.id_solicitud_alumno,
        sa.id_convocatoria AS conv_alumno,
        a.id_especialidad_dual,
        ev_a.nombre AS estado_alumno,
        ee.id_especialidad AS esp_oferta,
        se.id_convocatoria AS conv_empresa,
        se.id_empresa,
        ev_e.nombre AS estado_empresa,
        c.activa,
        fn_cupos_disponibles(ee.id_solicitud_empresa_especialidad) AS plazas_disponibles
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_estados_validacion ev_a ON ev_a.id_estado_validacion = sa.id_estado_validacion
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = ?
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN dual_estados_validacion ev_e ON ev_e.id_estado_validacion = se.id_estado_validacion
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE sa.id_solicitud_alumno = ?`,
    [idOferta, idSolicitudAlumno]
  );

  const row = rows[0];
  if (!row) {
    return { error: 'No se encontró la solicitud del alumno o la oferta indicada.', status: 404 };
  }
  if (row.estado_alumno !== 'VALIDADO' || row.estado_empresa !== 'VALIDADO') {
    return { error: 'Solo se pueden reservar alumnos y empresas validados.', status: 400 };
  }
  if (requireActive && Number(row.activa) !== 1) {
    return { error: 'La oferta no pertenece a la convocatoria activa.', status: 400 };
  }
  if (row.conv_alumno !== row.conv_empresa) {
    return { error: 'Alumno y empresa deben pertenecer a la misma convocatoria.', status: 400 };
  }
  if (row.esp_oferta !== row.id_especialidad_dual) {
    return { error: 'La especialidad del alumno no coincide con la especialidad solicitada por la empresa.', status: 400 };
  }
  return { ok: true, row };
}

async function executeReservar(idSolicitudAlumno, idOferta) {
  const callRow = await callProcedureWithResult(pool, 'sp_reservar_alumno', [
    idSolicitudAlumno,
    idOferta,
  ]);
  const idReserva = await resolveReservaId(callRow, idSolicitudAlumno, idOferta);
  if (!idReserva) {
    const err = new Error('No se pudo obtener el identificador de la reserva.');
    err.status = 500;
    throw err;
  }
  return idReserva;
}

// GET /alumnos/disponibles — validated students without a confirmed placement,
// scoped to the specialities of the empresa's approved offers in the active convocatoria
exports.getAlumnosDisponibles = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [especialidades] = await pool.query(
    `SELECT DISTINCT ee.id_especialidad
       FROM dual_solicitud_empresa_especialidades ee
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE se.id_empresa = ?
        AND c.activa = 1
        AND se.id_estado_validacion = (
              SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
            )`,
    [idEmpresa]
  );

  if (especialidades.length === 0) {
    return res.json([]);
  }

  const idEsps = especialidades.map(r => r.id_especialidad);

  const [rows] = await pool.query(
    `SELECT
        sa.id_solicitud_alumno,
        a.idalumno,
        a.nombre,
        a.dni,
        a.email,
        a.telalumno,
        a.carnetDeConducir,
        a.tieneCoche,
        esp.id_especialidad,
        esp.codigo AS codigo_especialidad,
        esp.nombre AS especialidad,
        CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
        c.nombre AS convocatoria,
        (SELECT id_reserva FROM dual_reservas r_propia
          JOIN dual_solicitud_empresa_especialidades ee_propia
            ON ee_propia.id_solicitud_empresa_especialidad = r_propia.id_solicitud_empresa_especialidad
          JOIN dual_solicitudes_empresa se_propia
            ON se_propia.id_solicitud_empresa = ee_propia.id_solicitud_empresa
         WHERE r_propia.id_solicitud_alumno = sa.id_solicitud_alumno
           AND se_propia.id_empresa = ?
           AND r_propia.id_estado_reserva IN (
                 SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN (?, ?)
               )
         LIMIT 1) AS mi_reserva_id
     FROM dual_solicitudes_alumno sa
     JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
     JOIN dual_especialidades esp ON esp.id_especialidad = a.id_especialidad_dual
     JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
     LEFT JOIN dual_reservas r_confirmada
       ON r_confirmada.id_solicitud_alumno = sa.id_solicitud_alumno
      AND r_confirmada.id_estado_reserva = (
            SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = ? LIMIT 1
          )
    WHERE c.activa = 1
      AND sa.id_estado_validacion = (
            SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
          )
      AND a.id_especialidad_dual IN (?)
      AND r_confirmada.id_reserva IS NULL
    ORDER BY a.nombre`,
    [idEmpresa, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, ESTADOS_RESERVA.CONFIRMADA, idEsps]
  );

  const withDocs = rows.length ? await attachSolicitudDocumentos(rows, 'EMPRESA') : [];
  return res.json(withDocs);
};

// GET /cupos/empresa — empresa's own validated offers with available and occupied quotas
exports.getCuposEmpresa = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [rows] = await pool.query(
    `SELECT
        ee.id_solicitud_empresa_especialidad,
        se.id_solicitud_empresa,
        esp.id_especialidad,
        esp.codigo AS codigo_especialidad,
        esp.nombre AS especialidad,
        CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
        ee.cantidad_alumnos AS plazas_ofertadas,
        COUNT(CASE WHEN r.id_estado_reserva IN (
          SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN (?, ?)
        ) THEN 1 END) AS plazas_ocupadas,
        COUNT(CASE WHEN r.id_estado_reserva IN (
          SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = ?
        ) THEN 1 END) AS plazas_confirmadas,
        COUNT(CASE WHEN r.id_estado_reserva IN (
          SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = ?
        ) THEN 1 END) AS plazas_pendientes,
        GREATEST(0, ee.cantidad_alumnos - COUNT(CASE WHEN r.id_estado_reserva IN (
          SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN (?, ?)
        ) THEN 1 END)) AS plazas_disponibles
     FROM dual_solicitud_empresa_especialidades ee
     JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
     JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
     JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
     LEFT JOIN dual_reservas r ON r.id_solicitud_empresa_especialidad = ee.id_solicitud_empresa_especialidad
    WHERE se.id_empresa = ?
      AND c.activa = 1
      AND se.id_estado_validacion = (
            SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
          )
    GROUP BY ee.id_solicitud_empresa_especialidad`,
    [ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, ESTADOS_RESERVA.CONFIRMADA, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, idEmpresa]
  );

  return res.json(rows);
};

// GET /reservas — admin/coordinador: full reservation list with student and company detail
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT
        r.id_reserva,
        er.nombre AS estado_reserva,
        r.motivo,
        r.id_tipo_contrato,
        tc.nombre_mostrar AS tipo_contrato,
        sa.id_solicitud_alumno,
        a.idalumno,
        a.nombre AS alumno,
        a.dni AS dni_alumno,
        a.email AS email_alumno,
        esp.codigo AS codigo_especialidad,
        esp.nombre AS especialidad,
        CASE esp.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END AS turno,
        emp.idempresa,
        emp.empresa,
        ee.cantidad_alumnos AS plazas_ofertadas,
        coord.email AS email_coordinador,
        r.id_empresa_tutor,
        tutor_c.nombre AS tutor_nombre,
        tutor_c.email AS tutor_email,
        tutor_c.telefono AS tutor_telefono,
        t.activo AS tutor_activo,
        (SELECT d.id_documento FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
          WHERE d.id_reserva = r.id_reserva AND td.nombre = ${ANEXO_SQL}
            AND d.es_actual = 1
          ORDER BY d.id_documento DESC LIMIT 1) AS id_documento_reserva,
        (SELECT ev.nombre FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
           JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
          WHERE d.id_reserva = r.id_reserva AND td.nombre = ${ANEXO_SQL}
            AND d.es_actual = 1
          ORDER BY d.id_documento DESC LIMIT 1) AS estado_documento
     FROM dual_reservas r
     JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
     LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
     JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
     JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
     JOIN dual_solicitud_empresa_especialidades ee
       ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
     JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
     JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
     JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
     JOIN ge_contactos coord ON coord.idcontacto = se.id_coordinador_empresa
     LEFT JOIN dual_empresa_tutores t ON t.id_empresa_tutor = r.id_empresa_tutor
     LEFT JOIN ge_contactos tutor_c ON tutor_c.idcontacto = t.id_contacto
    ORDER BY r.id_reserva DESC`
  );

  return res.json(rows);
};

// GET /reservas/empresa — empresa's own reservations
exports.getMisReservas = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [rows] = await pool.query(
    `SELECT
        r.id_reserva,
        er.nombre AS estado_reserva,
        r.motivo,
        tc.nombre_mostrar AS tipo_contrato,
        sa.id_solicitud_alumno,
        a.idalumno,
        a.nombre AS alumno,
        a.dni AS dni_alumno,
        a.email AS email_alumno,
        a.telalumno,
        a.carnetDeConducir,
        a.tieneCoche,
        esp.codigo AS codigo_especialidad,
        esp.nombre AS especialidad,
        se.id_empresa,
        r.id_empresa_tutor,
        tutor_c.nombre AS tutor_nombre,
        tutor_c.email AS tutor_email,
        tutor_c.telefono AS tutor_telefono,
        t.activo AS tutor_activo,
        (SELECT d.id_documento FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
          WHERE d.id_reserva = r.id_reserva AND td.nombre = ${ANEXO_SQL}
            AND d.es_actual = 1
          ORDER BY d.id_documento DESC LIMIT 1) AS id_documento_reserva,
        (SELECT ev.nombre FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
           JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
          WHERE d.id_reserva = r.id_reserva AND td.nombre = ${ANEXO_SQL}
            AND d.es_actual = 1
          ORDER BY d.id_documento DESC LIMIT 1) AS estado_documento
     FROM dual_reservas r
     JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
     LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
     JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
     JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
     JOIN dual_solicitud_empresa_especialidades ee
       ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
     JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
     JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
     LEFT JOIN dual_empresa_tutores t ON t.id_empresa_tutor = r.id_empresa_tutor
     LEFT JOIN ge_contactos tutor_c ON tutor_c.idcontacto = t.id_contacto
    WHERE se.id_empresa = ?
    ORDER BY r.id_reserva DESC`,
    [idEmpresa]
  );

  return res.json(rows);
};

// GET /reservas/alumno — ALUMNO: reservations for own applications only
exports.getReservasAlumno = async function (req, res) {
  const idAlumno = await getStudentIdFromUser(req.user.id);
  if (!idAlumno) return res.status(404).json({ error: 'No se encontró alumno vinculado a este usuario.' });

  const [rows] = await pool.query(
    `SELECT
        r.id_reserva,
        er.nombre AS estado_reserva,
        r.motivo,
        tc.nombre_mostrar AS tipo_contrato,
        emp.empresa,
        esp.nombre AS especialidad,
        esp.codigo AS codigo_especialidad,
        sa.id_solicitud_alumno,
        c.nombre AS convocatoria,
        r.id_empresa_tutor,
        tutor_c.nombre AS tutor_nombre,
        tutor_c.email AS tutor_email,
        tutor_c.telefono AS tutor_telefono,
        t.activo AS tutor_activo
     FROM dual_reservas r
     JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
     LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
     JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
     JOIN dual_solicitud_empresa_especialidades ee
       ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
     JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
     JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
     JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
     JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
     LEFT JOIN dual_empresa_tutores t ON t.id_empresa_tutor = r.id_empresa_tutor
     LEFT JOIN ge_contactos tutor_c ON tutor_c.idcontacto = t.id_contacto
    WHERE sa.id_alumno = ?
    ORDER BY r.id_reserva DESC`,
    [idAlumno]
  );

  return res.json(rows);
};

const ACTIVE_PAIR_SQL = `
  AND NOT EXISTS (
        SELECT 1
          FROM dual_reservas r
          JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
           AND r.id_solicitud_empresa_especialidad = ee.id_solicitud_empresa_especialidad
           AND er.nombre IN (?, ?)
      )
  AND NOT EXISTS (
        SELECT 1
          FROM dual_reservas r
          JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
           AND er.nombre = ?
      )`;

// GET /reservas/ofertas-elegibles — staff: validated offers matching a student
exports.getOfertasElegibles = async function (req, res) {
  const idSolicitudAlumno = parseId(req.query.id_solicitud_alumno);
  if (!idSolicitudAlumno) {
    return res.status(400).json({ error: 'Se requiere id_solicitud_alumno.' });
  }

  const [rows] = await pool.query(
    `SELECT
        ee.id_solicitud_empresa_especialidad,
        se.id_solicitud_empresa,
        se.id_empresa,
        emp.empresa,
        se.id_convocatoria,
        c.nombre AS convocatoria,
        ee.id_especialidad,
        esp.nombre AS especialidad,
        esp.codigo AS codigo_especialidad,
        ee.cantidad_alumnos AS plazas_ofertadas,
        fn_reservas_activas(ee.id_solicitud_empresa_especialidad) AS plazas_ocupadas,
        fn_cupos_disponibles(ee.id_solicitud_empresa_especialidad) AS plazas_disponibles
       FROM dual_solicitudes_alumno sa
       JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
       JOIN dual_estados_validacion ev_a
         ON ev_a.id_estado_validacion = sa.id_estado_validacion
        AND ev_a.nombre = 'VALIDADO'
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_especialidad = a.id_especialidad_dual
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
        AND se.id_convocatoria = sa.id_convocatoria
       JOIN dual_estados_validacion ev_e
         ON ev_e.id_estado_validacion = se.id_estado_validacion
        AND ev_e.nombre = 'VALIDADO'
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN ge_empresas emp ON emp.idempresa = se.id_empresa
      WHERE sa.id_solicitud_alumno = ?
        AND fn_cupos_disponibles(ee.id_solicitud_empresa_especialidad) > 0
        ${ACTIVE_PAIR_SQL}
      ORDER BY emp.empresa, esp.nombre`,
    [idSolicitudAlumno, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, ESTADOS_RESERVA.CONFIRMADA]
  );

  return res.json(rows);
};

// GET /reservas/alumnos-elegibles — staff: validated students matching one company offer
exports.getAlumnosElegibles = async function (req, res) {
  const idOferta = parseId(req.query.id_solicitud_empresa_especialidad);
  if (!idOferta) {
    return res.status(400).json({ error: 'Se requiere id_solicitud_empresa_especialidad.' });
  }

  const [offer] = await pool.query(
    `SELECT ee.id_solicitud_empresa_especialidad
       FROM dual_solicitud_empresa_especialidades ee
      WHERE ee.id_solicitud_empresa_especialidad = ?`,
    [idOferta]
  );
  if (!offer[0]) return res.status(404).json({ error: 'No se encontró la especialidad de la empresa.' });

  const [rows] = await pool.query(
    `SELECT
        sa.id_solicitud_alumno,
        a.nombre,
        a.dni,
        esp.nombre AS especialidad,
        esp.codigo AS codigo_especialidad,
        c.nombre AS convocatoria,
        (
          SELECT GROUP_CONCAT(CONCAT(emp2.empresa, ' · ', er2.nombre) ORDER BY r2.id_reserva DESC SEPARATOR ' | ')
            FROM dual_reservas r2
            JOIN dual_estados_reserva er2 ON er2.id_estado_reserva = r2.id_estado_reserva
            JOIN dual_solicitud_empresa_especialidades ee2
              ON ee2.id_solicitud_empresa_especialidad = r2.id_solicitud_empresa_especialidad
            JOIN dual_solicitudes_empresa se2 ON se2.id_solicitud_empresa = ee2.id_solicitud_empresa
            JOIN ge_empresas emp2 ON emp2.idempresa = se2.id_empresa
           WHERE r2.id_solicitud_alumno = sa.id_solicitud_alumno
             AND er2.nombre = ?
        ) AS reserva_actual
       FROM dual_solicitud_empresa_especialidades ee
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN dual_estados_validacion ev_e
         ON ev_e.id_estado_validacion = se.id_estado_validacion
        AND ev_e.nombre = 'VALIDADO'
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
       JOIN dual_especialidades esp ON esp.id_especialidad = ee.id_especialidad
       JOIN dual_solicitudes_alumno sa ON sa.id_convocatoria = se.id_convocatoria
       JOIN dual_estados_validacion ev_a
         ON ev_a.id_estado_validacion = sa.id_estado_validacion
        AND ev_a.nombre = 'VALIDADO'
       JOIN gf_alumnosfct a
         ON a.idalumno = sa.id_alumno
        AND a.id_especialidad_dual = ee.id_especialidad
      WHERE ee.id_solicitud_empresa_especialidad = ?
        AND fn_cupos_disponibles(ee.id_solicitud_empresa_especialidad) > 0
        ${ACTIVE_PAIR_SQL}
      ORDER BY a.nombre`,
    [ESTADOS_RESERVA.PENDIENTE, idOferta, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA, ESTADOS_RESERVA.CONFIRMADA]
  );

  return res.json(rows);
};

// POST /reservas — empresa reserves a student against one of its validated speciality offers
exports.reservar = async function (req, res) {
  const idSolicitudAlumno = parseId(req.body.id_solicitud_alumno);
  const idOferta = parseId(req.body.id_solicitud_empresa_especialidad);

  if (!idSolicitudAlumno || !idOferta) {
    return res.status(400).json({ error: 'Se requieren id_solicitud_alumno e id_solicitud_empresa_especialidad.' });
  }

  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [ofertaRows] = await pool.query(
    `SELECT ee.id_solicitud_empresa_especialidad
       FROM dual_solicitud_empresa_especialidades ee
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
       JOIN dual_convocatorias c ON c.id_convocatoria = se.id_convocatoria
      WHERE ee.id_solicitud_empresa_especialidad = ?
        AND se.id_empresa = ?
        AND c.activa = 1
        AND se.id_estado_validacion = (
              SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
            )`,
    [idOferta, idEmpresa]
  );

  if (!ofertaRows[0]) {
    return res.status(403).json({ error: 'No tienes permiso para usar esta oferta o no está aprobada.' });
  }

  const validation = await validateReservaTargets(idSolicitudAlumno, idOferta, { requireActive: true });
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  try {
    const idReserva = await executeReservar(idSolicitudAlumno, idOferta);
    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idReserva, accion: 'RESERVAR', despues: ESTADOS_RESERVA.PENDIENTE,
      user: req.user, detalle: { id_solicitud_alumno: idSolicitudAlumno, id_oferta: idOferta },
    });
    return res.status(201).json({
      message: 'Alumno reservado correctamente.',
      id_reserva: idReserva,
      estado_reserva: ESTADOS_RESERVA.PENDIENTE,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};

// POST /reservas/admin — staff reserves a student for a validated company offer
exports.reservarAdmin = async function (req, res) {
  const idSolicitudAlumno = parseId(req.body.id_solicitud_alumno);
  const idOferta = parseId(req.body.id_solicitud_empresa_especialidad);

  if (!idSolicitudAlumno || !idOferta) {
    return res.status(400).json({ error: 'Se requieren id_solicitud_alumno e id_solicitud_empresa_especialidad.' });
  }

  const validation = await validateReservaTargets(idSolicitudAlumno, idOferta, { requireActive: false });
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  try {
    const idReserva = await executeReservar(idSolicitudAlumno, idOferta);
    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idReserva, accion: 'RESERVAR', despues: ESTADOS_RESERVA.PENDIENTE,
      user: req.user, detalle: { id_solicitud_alumno: idSolicitudAlumno, id_oferta: idOferta },
    });
    return res.status(201).json({
      message: 'Reserva creada correctamente.',
      id_reserva: idReserva,
      estado_reserva: ESTADOS_RESERVA.PENDIENTE,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return sendSqlError(res, err);
  }
};

// POST /reservas/:id/cancelar — empresa cancels its own pending reservation (motivo required)
exports.cancelar = async function (req, res) {
  const idReserva = parseId(req.params.id);
  const motivo = String(req.body?.motivo || '').trim();

  if (!idReserva) {
    return res.status(400).json({ error: 'Reserva no válida.' });
  }
  if (!motivo) {
    return res.status(400).json({ error: 'Debe indicar el motivo de la cancelación.' });
  }

  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [check] = await pool.query(
    `SELECT r.id_reserva, er.nombre AS estado_reserva, se.id_empresa
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
      WHERE r.id_reserva = ?`,
    [idReserva]
  );

  if (!check[0] || check[0].id_empresa !== idEmpresa) {
    return res.status(403).json({ error: 'No tienes permiso para cancelar esta reserva.' });
  }
  if (check[0].estado_reserva !== ESTADOS_RESERVA.PENDIENTE) {
    return res.status(400).json({ error: 'Solo puede cancelar una reserva pendiente propia.' });
  }

  try {
    await callProcedure(pool, 'sp_cancelar_reserva', [idReserva, motivo]);
    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idReserva, accion: 'CANCELAR',
      antes: ESTADOS_RESERVA.PENDIENTE, despues: ESTADOS_RESERVA.CANCELADA, user: req.user, motivo,
    });
    return res.json({ message: 'Reserva cancelada correctamente.', estado_reserva: ESTADOS_RESERVA.CANCELADA });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /reservas/:id/cancelar-admin — staff cancels pending or confirmed reservations
exports.cancelarAdmin = async function (req, res) {
  const idReserva = parseId(req.params.id);
  const motivo = String(req.body?.motivo || '').trim();

  if (!idReserva) {
    return res.status(400).json({ error: 'Reserva no válida.' });
  }
  if (!motivo) {
    return res.status(400).json({ error: 'Debe indicar el motivo de la cancelación.' });
  }

  const [antes] = await pool.query(
    `SELECT er.nombre AS estado FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
      WHERE r.id_reserva = ?`,
    [idReserva]
  );

  try {
    await callProcedure(pool, 'sp_cancelar_reserva_admin', [idReserva, motivo]);
    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idReserva, accion: 'CANCELAR',
      antes: antes[0]?.estado || null, despues: ESTADOS_RESERVA.CANCELADA, user: req.user, motivo,
      detalle: { administrativa: true },
    });
    return res.json({ message: 'Reserva cancelada correctamente.', estado_reserva: ESTADOS_RESERVA.CANCELADA });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /reservas/:id/reasignar — staff moves a student to another eligible offer atomically
exports.reasignar = async function (req, res) {
  const idReservaOrigen = parseId(req.params.id);
  const idOferta = parseId(req.body.id_solicitud_empresa_especialidad);
  const motivo = String(req.body?.motivo || '').trim();

  if (!idReservaOrigen || !idOferta) {
    return res.status(400).json({ error: 'Se requieren la reserva de origen y id_solicitud_empresa_especialidad.' });
  }
  if (!motivo) {
    return res.status(400).json({ error: 'Debe indicar el motivo de la reasignación.' });
  }

  const [origen] = await pool.query(
    `SELECT r.id_reserva, r.id_solicitud_alumno, r.id_solicitud_empresa_especialidad,
            er.nombre AS estado_reserva
       FROM dual_reservas r
       JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
      WHERE r.id_reserva = ?`,
    [idReservaOrigen]
  );

  if (!origen[0]) {
    return res.status(404).json({ error: 'La reserva de origen no existe.' });
  }
  if (origen[0].estado_reserva === ESTADOS_RESERVA.CANCELADA) {
    return res.status(400).json({ error: 'No se puede reasignar una reserva cancelada.' });
  }
  if (origen[0].id_solicitud_empresa_especialidad === idOferta) {
    return res.status(400).json({ error: 'La oferta de destino debe ser distinta a la actual.' });
  }

  const validation = await validateReservaTargets(origen[0].id_solicitud_alumno, idOferta, { requireActive: false });
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  try {
    const callRow = await callProcedureWithResult(pool, 'sp_reasignar_reserva', [
      idReservaOrigen,
      idOferta,
      motivo,
    ]);
    const idNueva = await resolveReservaId(callRow, origen[0].id_solicitud_alumno, idOferta);
    if (!idNueva) {
      return res.status(500).json({ error: 'No se pudo obtener el identificador de la nueva reserva.' });
    }
    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idReservaOrigen, accion: 'REASIGNAR',
      antes: origen[0].estado_reserva, despues: ESTADOS_RESERVA.CANCELADA, user: req.user, motivo,
      detalle: { id_reserva_destino: idNueva, id_oferta_destino: idOferta },
    });
    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idNueva, accion: 'RESERVAR', despues: ESTADOS_RESERVA.PENDIENTE,
      user: req.user, motivo, detalle: { reasignada_desde: idReservaOrigen },
    });
    return res.json({
      message: 'Alumno reasignado correctamente.',
      id_reserva: idNueva,
      id_reserva_origen: idReservaOrigen,
      estado_reserva: ESTADOS_RESERVA.PENDIENTE,
    });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

async function currentAnexos(conn, idReserva, { lock = false } = {}) {
  const [rows] = await conn.query(
    `SELECT d.id_documento, td.nombre AS clave, ev.nombre AS estado_validacion,
            d.firmas_exentas_legacy,
            CASE WHEN d.archivo IS NULL THEN 0 ELSE 1 END AS tiene_archivo
       FROM dual_documentos d
       JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
       JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
      WHERE d.id_reserva = ?
        AND d.es_actual = 1
        AND td.nombre IN ('ANEXO_II', 'ANEXO_III')
      ORDER BY d.id_documento DESC${lock ? '\n      FOR UPDATE' : ''}`,
    [idReserva]
  );
  return rows;
}

// POST /reservas/:id/tipo-contrato — staff records the contract family before confirmation.
// D2: a mistaken type can be corrected while no file of its annex is under review or
// validated. A rejected annex of the old family is moved to history.
exports.setTipoContrato = async function (req, res) {
  const idReserva = parseId(req.params.id);
  const idTipo = parseId(req.body?.id_tipo_contrato);
  if (!idReserva || !idTipo) {
    return res.status(400).json({ error: 'Indica la reserva y el tipo de contrato.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT r.id_reserva, r.id_tipo_contrato, er.nombre AS estado, tc.nombre AS tipo_contrato
         FROM dual_reservas r
         JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
        WHERE r.id_reserva = ?
        FOR UPDATE`,
      [idReserva],
    );
    const [tipos] = await conn.query(
      'SELECT id_tipo_contrato, nombre FROM dual_tipos_contrato WHERE id_tipo_contrato = ?',
      [idTipo],
    );
    if (rows[0] && !tipos[0]) {
      await conn.rollback();
      return res.status(400).json({ error: 'Tipo de contrato no válido.' });
    }
    const anexos = rows[0] ? await currentAnexos(conn, idReserva, { lock: true }) : [];
    const denied = reglas.tipoContratoCambiable(rows[0] || null, tipos[0]?.nombre, anexos);
    if (denied) {
      await conn.rollback();
      return res.status(denied.status).json({ error: denied.error, code: denied.code });
    }
    if (rows[0].id_tipo_contrato === idTipo) {
      await conn.rollback();
      return res.json({ message: 'Tipo de contrato actualizado.' });
    }

    await conn.query('UPDATE dual_reservas SET id_tipo_contrato = ? WHERE id_reserva = ?', [idTipo, idReserva]);

    const familiaAnterior = anexoClaveForContrato(rows[0].tipo_contrato);
    const retirados = familiaAnterior && familiaAnterior !== anexoClaveForContrato(tipos[0].nombre)
      ? anexos.filter((a) => a.clave === familiaAnterior).map((a) => a.id_documento)
      : [];
    if (retirados.length) {
      await conn.query('UPDATE dual_documentos SET es_actual = 0 WHERE id_documento IN (?)', [retirados]);
    }
    await recordEvent(conn, {
      entidad: 'RESERVA', id: idReserva, accion: 'TIPO_CONTRATO',
      antes: rows[0].tipo_contrato || null, despues: tipos[0].nombre, user: req.user,
      detalle: retirados.length ? { documentos_retirados: retirados } : null,
    });
    await conn.commit();
    return res.json({ message: 'Tipo de contrato actualizado.', documentos_retirados: retirados });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// POST /reservas/:id/confirmar — admin/coordinador confirms a reservation.
// D2: uses the stored contract type and needs its annex fully signed and validated.
// sp_confirmar_reserva re-checks the type and the validated annex under its lock.
exports.confirmar = async function (req, res) {
  const idReserva = parseId(req.params.id);
  const raw = req.body?.id_tipo_contrato;
  const idTipoPedido = raw === undefined || raw === null || raw === '' ? null : parseId(raw);

  if (!idReserva) {
    return res.status(400).json({ error: 'Reserva no válida.' });
  }
  if (raw !== undefined && raw !== null && raw !== '' && !idTipoPedido) {
    return res.status(400).json({ error: 'Tipo de contrato no válido.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT r.id_reserva, r.id_solicitud_alumno, r.id_tipo_contrato,
              er.nombre AS estado, tc.nombre AS tipo_contrato
         FROM dual_reservas r
         JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
         LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
        WHERE r.id_reserva = ?`,
      [idReserva]
    );
    const reserva = rows[0] || null;
    const clave = reserva ? anexoClaveForContrato(reserva.tipo_contrato) : null;
    const def = clave ? defByClave(clave) : null;
    const anexo = clave ? (await currentAnexos(pool, idReserva)).find((a) => a.clave === clave) || null : null;
    let firmas = [];
    if (anexo) {
      [firmas] = await pool.query(
        'SELECT rol, estado FROM dual_documento_firmas WHERE id_documento = ?',
        [anexo.id_documento]
      );
    }
    const denied = reglas.reservaConfirmable(reserva, idTipoPedido, def, anexo, firmas);
    if (denied) return res.status(denied.status).json({ error: denied.error, code: denied.code });

    const [otras] = await pool.query(
      `SELECT r.id_reserva FROM dual_reservas r
         JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
        WHERE r.id_solicitud_alumno = ? AND r.id_reserva <> ? AND er.nombre = ?`,
      [reserva.id_solicitud_alumno, idReserva, ESTADOS_RESERVA.PENDIENTE]
    );

    await callProcedure(pool, 'sp_confirmar_reserva', [idReserva, reserva.id_tipo_contrato]);

    await recordEventAfterCommit({
      entidad: 'RESERVA', id: idReserva, accion: 'CONFIRMAR',
      antes: ESTADOS_RESERVA.PENDIENTE, despues: ESTADOS_RESERVA.CONFIRMADA, user: req.user,
      detalle: { tipo_contrato: reserva.tipo_contrato, id_documento_anexo: anexo.id_documento },
    });
    for (const o of otras) {
      await recordEventAfterCommit({
        entidad: 'RESERVA', id: o.id_reserva, accion: 'CANCELAR',
        antes: ESTADOS_RESERVA.PENDIENTE, despues: ESTADOS_RESERVA.CANCELADA, user: req.user,
        motivo: 'Alumno asignado a otra empresa.', detalle: { por_confirmacion_de: idReserva },
      });
    }
    return res.json({ message: 'Reserva confirmada correctamente.', estado_reserva: ESTADOS_RESERVA.CONFIRMADA });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El alumno ya tiene otra reserva confirmada.' });
    }
    return sendSqlError(res, err);
  }
};

exports.ESTADOS_RESERVA = ESTADOS_RESERVA;
