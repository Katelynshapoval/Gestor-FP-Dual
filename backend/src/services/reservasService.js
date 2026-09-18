const pool = require('../db/pool');
const { getCompanyIdFromUser, getStudentIdFromUser, sendSqlError, callProcedureWithResult, callProcedure } = require('../helpers/dbHelpers');
const { ESTADOS_RESERVA } = require('../constants/reservaEstados');

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
        CASE WHEN ev.id_evaluacion IS NOT NULL THEN
          ROUND(LEAST(10, GREATEST(0,
            0.6 * ev.nota_media + 0.05 * ev.idiomas +
            0.1 * ev.madurez + 0.1 * ev.competencia +
            GREATEST(0, -0.1 * ((ev.faltas / 1050.0) * 100) + 1.5)
          )), 2)
        ELSE NULL END AS nota_total,
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
     LEFT JOIN dual_evaluaciones ev ON ev.id_solicitud_alumno = sa.id_solicitud_alumno
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

  return res.json(rows);
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
        (SELECT d.id_documento FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
          WHERE d.id_reserva = r.id_reserva AND td.nombre = 'ANEXO_H'
          ORDER BY d.id_documento DESC LIMIT 1) AS id_documento_reserva,
        (SELECT ev.nombre FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
           JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
          WHERE d.id_reserva = r.id_reserva AND td.nombre = 'ANEXO_H'
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
        (SELECT d.id_documento FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
          WHERE d.id_reserva = r.id_reserva AND td.nombre = 'ANEXO_H'
          ORDER BY d.id_documento DESC LIMIT 1) AS id_documento_reserva,
        (SELECT ev.nombre FROM dual_documentos d
           JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
           JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
          WHERE d.id_reserva = r.id_reserva AND td.nombre = 'ANEXO_H'
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
        c.nombre AS convocatoria
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
    WHERE sa.id_alumno = ?
    ORDER BY r.id_reserva DESC`,
    [idAlumno]
  );

  return res.json(rows);
};

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
        AND NOT EXISTS (
              SELECT 1
                FROM dual_reservas r
                JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
               WHERE r.id_solicitud_alumno = sa.id_solicitud_alumno
                 AND r.id_solicitud_empresa_especialidad = ee.id_solicitud_empresa_especialidad
                 AND er.nombre IN (?, ?)
            )
      ORDER BY emp.empresa, esp.nombre`,
    [idSolicitudAlumno, ESTADOS_RESERVA.PENDIENTE, ESTADOS_RESERVA.CONFIRMADA]
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

  try {
    await callProcedure(pool, 'sp_cancelar_reserva_admin', [idReserva, motivo]);
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

// POST /reservas/:id/confirmar — admin/coordinador confirms a reservation
exports.confirmar = async function (req, res) {
  const idReserva = parseId(req.params.id);
  const { id_tipo_contrato } = req.body;

  if (!idReserva) {
    return res.status(400).json({ error: 'Reserva no válida.' });
  }

  try {
    await callProcedure(pool, 'sp_confirmar_reserva', [idReserva, id_tipo_contrato ?? null]);
    return res.json({ message: 'Reserva confirmada correctamente.', estado_reserva: ESTADOS_RESERVA.CONFIRMADA });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El alumno ya tiene otra reserva confirmada.' });
    }
    return sendSqlError(res, err);
  }
};

exports.ESTADOS_RESERVA = ESTADOS_RESERVA;
