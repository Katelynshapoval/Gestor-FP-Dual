const pool = require('../db/pool');
const { getCompanyIdFromUser, sendSqlError } = require('../helpers/dbHelpers');

// Calcula plazas directamente en SQL para no depender de las funciones BD en cada petición
const CUPOS_SUBQUERY = `
  GREATEST(0, ee.cantidad_alumnos - COUNT(
    CASE WHEN r2.id_estado_reserva IN (
      SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN ('PENDIENTE','CONFIRMADO')
    ) THEN 1 END
  ))
`;

// GET /alumnos/disponibles — empresa: alumnos validados sin confirmación en la convocatoria activa
// Filtrados por las especialidades de las ofertas aprobadas de esta empresa
exports.getAlumnosDisponibles = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  // Especialidades de las ofertas aprobadas de esta empresa en la convocatoria activa
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
                 SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN ('PENDIENTE','CONFIRMADO')
               )
         LIMIT 1) AS mi_reserva_id
     FROM dual_solicitudes_alumno sa
     JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
     JOIN dual_especialidades esp ON esp.id_especialidad = a.id_especialidad_dual
     JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
     LEFT JOIN dual_reservas r_confirmada
       ON r_confirmada.id_solicitud_alumno = sa.id_solicitud_alumno
      AND r_confirmada.id_estado_reserva = (
            SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = 'CONFIRMADO' LIMIT 1
          )
    WHERE c.activa = 1
      AND sa.id_estado_validacion = (
            SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
          )
      AND a.id_especialidad_dual IN (?)
      AND r_confirmada.id_reserva IS NULL
    ORDER BY a.nombre`,
    [idEmpresa, idEsps]
  );

  return res.json(rows);
};

// GET /cupos/empresa — empresa: sus propias ofertas con plazas disponibles
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
          SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN ('PENDIENTE','CONFIRMADO')
        ) THEN 1 END) AS plazas_ocupadas,
        GREATEST(0, ee.cantidad_alumnos - COUNT(CASE WHEN r.id_estado_reserva IN (
          SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN ('PENDIENTE','CONFIRMADO')
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
    [idEmpresa]
  );

  return res.json(rows);
};

// GET /reservas — admin/coordinador: todas las reservas con detalle completo
exports.getAll = async function (req, res) {
  const [rows] = await pool.query(
    `SELECT
        r.id_reserva,
        er.nombre AS estado_reserva,
        r.motivo,
        tc.nombre AS tipo_contrato,
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
        (SELECT id_documento FROM dual_documentos d
          WHERE d.id_reserva = r.id_reserva LIMIT 1) AS id_documento_reserva,
        (SELECT ev.nombre FROM dual_documentos d
          JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
          WHERE d.id_reserva = r.id_reserva LIMIT 1) AS estado_documento
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

// GET /reservas/empresa — empresa: sus propias reservas
exports.getMisReservas = async function (req, res) {
  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  const [rows] = await pool.query(
    `SELECT
        r.id_reserva,
        er.nombre AS estado_reserva,
        r.motivo,
        tc.nombre AS tipo_contrato,
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
        (SELECT id_documento FROM dual_documentos d
          WHERE d.id_reserva = r.id_reserva
            AND d.id_tipo_documento = (
              SELECT id_tipo_documento FROM dual_tipos_documento WHERE nombre = 'ANEXO_H' LIMIT 1
            )
          LIMIT 1) AS id_documento_reserva,
        (SELECT ev.nombre FROM dual_documentos d
          JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
          WHERE d.id_reserva = r.id_reserva
          LIMIT 1) AS estado_documento
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

// POST /reservas — empresa: reservar un alumno en una de sus ofertas
exports.reservar = async function (req, res) {
  const { id_solicitud_alumno, id_solicitud_empresa_especialidad } = req.body;

  if (!id_solicitud_alumno || !id_solicitud_empresa_especialidad) {
    return res.status(400).json({ error: 'Se requieren id_solicitud_alumno e id_solicitud_empresa_especialidad.' });
  }

  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  // Verifica que la oferta pertenece a esta empresa y está aprobada
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
    [id_solicitud_empresa_especialidad, idEmpresa]
  );

  if (!ofertaRows[0]) {
    return res.status(403).json({ error: 'No tienes permiso para usar esta oferta o no está aprobada.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // El SP maneja bloqueo, capacidad y unicidad de confirmación
    const [results] = await conn.query(
      'CALL sp_reservar_alumno(?, ?, @p_id_reserva)',
      [id_solicitud_alumno, id_solicitud_empresa_especialidad]
    );

    await conn.commit();

    const idReserva = results[0]?.[0]?.id_reserva ?? null;
    return res.status(201).json({ message: 'Alumno reservado correctamente.', id_reserva: idReserva });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};

// POST /reservas/:id/cancelar — empresa: cancelar propia reserva
exports.cancelar = async function (req, res) {
  const idReserva = parseInt(req.params.id, 10);
  const { motivo } = req.body;

  if (!motivo || !motivo.trim()) {
    return res.status(400).json({ error: 'Debe indicar el motivo de la cancelación.' });
  }

  const idEmpresa = await getCompanyIdFromUser(req.user.id);
  if (!idEmpresa) return res.status(404).json({ error: 'No se encontró empresa vinculada a este usuario.' });

  // Verifica que la reserva pertenece a esta empresa
  const [check] = await pool.query(
    `SELECT r.id_reserva
       FROM dual_reservas r
       JOIN dual_solicitud_empresa_especialidades ee
         ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
       JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
      WHERE r.id_reserva = ? AND se.id_empresa = ?`,
    [idReserva, idEmpresa]
  );

  if (!check[0]) {
    return res.status(403).json({ error: 'No tienes permiso para cancelar esta reserva.' });
  }

  try {
    await pool.query('CALL sp_cancelar_reserva(?, ?)', [idReserva, motivo.trim()]);
    return res.json({ message: 'Reserva cancelada correctamente.' });
  } catch (err) {
    return sendSqlError(res, err);
  }
};

// POST /reservas/:id/confirmar — admin/coordinador: confirmar reserva
exports.confirmar = async function (req, res) {
  const idReserva = parseInt(req.params.id, 10);
  const { id_tipo_contrato } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query('CALL sp_confirmar_reserva(?, ?)', [
      idReserva,
      id_tipo_contrato ?? null,
    ]);

    await conn.commit();

    return res.json({ message: 'Reserva confirmada correctamente.' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El alumno ya tiene otra reserva confirmada.' });
    }
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
};
