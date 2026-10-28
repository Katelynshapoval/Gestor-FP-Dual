-- 017_integridad_especialidad_documentos_cupos.sql
-- Database improvement plan · Stage 1 (DB-01, DB-03, DB-10). See
-- docs/DATABASE_IMPROVEMENT_PLAN.md and docs/DATABASE_STAGE_1_REPORT.md.
--
-- 1. DB-01: the ciclo (speciality) of a student application is stored on the
--    application, dual_solicitudes_alumno.id_especialidad. Until now it was read
--    from gf_alumnosfct.id_especialidad_dual, which a re-application overwrites,
--    so earlier applications and their reservations changed ciclo with it.
--    gf_alumnosfct (protected) is NOT altered: the backend keeps writing the
--    latest ciclo there. Triggers trg_dsa_bi_reglas, trg_dsa_bu_reglas,
--    trg_dr_bi_reglas and the view vw_alumnos_disponibles read the new column.
-- 2. DB-03: at most one current document (es_actual = 1) per parent and type,
--    enforced by a generated column and a unique key (uq_dd_actual), and
--    sp_guardar_documento finds the current row with a locking read.
-- 3. DB-10: an offer's places cannot be reduced below its active (PENDIENTE or
--    CONFIRMADA) reservations (trigger trg_dsee_bu_cupo).
--
-- Data preservation: the speciality is COPIED from gf_alumnosfct into each
-- application; no row is deleted or merged. The migration STOPS before changing
-- anything when the copy could be wrong or a new rule is already violated:
--   * a student has more than one application (the stored value is only the
--     latest ciclo, so earlier applications cannot be backfilled reliably);
--   * an application's student has no speciality;
--   * a reservation's offer is of a different speciality than its student;
--   * two current documents share parent and type;
--   * an offer already has more active reservations than places.
-- The audit queries for each case are at the end of this file.
--
-- The protected tables ge_contactos, ge_domicilios, ge_empresas and gf_alumnosfct
-- are only read.
-- Rollback: db/rollback/017_integridad_especialidad_documentos_cupos.down.sql

-- ─── guards (change nothing) ───────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_017_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_017_comprobar`()
BEGIN
  DECLARE v_n INT DEFAULT 0;

  SELECT COUNT(*) INTO v_n
    FROM (SELECT id_alumno FROM dual_solicitudes_alumno GROUP BY id_alumno HAVING COUNT(*) > 1) x;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '017: hay alumnos con varias solicitudes; su ciclo de años anteriores no se puede copiar con seguridad. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM dual_solicitudes_alumno sa
    JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
   WHERE a.id_especialidad_dual IS NULL;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '017: hay solicitudes cuyo alumno no tiene especialidad. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM dual_reservas r
    JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
    JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
    JOIN dual_solicitud_empresa_especialidades ee
      ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
   WHERE ee.id_especialidad <> a.id_especialidad_dual;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '017: hay reservas en una oferta de otra especialidad que la del alumno. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM (SELECT 1 FROM dual_documentos
           WHERE es_actual = 1
           GROUP BY COALESCE(id_solicitud_alumno, 0), COALESCE(id_solicitud_empresa, 0),
                    COALESCE(id_reserva, 0), id_tipo_documento
          HAVING COUNT(*) > 1) x;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '017: hay documentos actuales duplicados (mismo padre y tipo). No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM dual_solicitud_empresa_especialidades ee
   WHERE fn_reservas_activas(ee.id_solicitud_empresa_especialidad) > ee.cantidad_alumnos;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '017: hay ofertas con más reservas activas que plazas. No se ha cambiado nada.';
  END IF;
END$$
DELIMITER ;

CALL `sp_017_comprobar`();
DROP PROCEDURE IF EXISTS `sp_017_comprobar`;

-- ─── 1. DB-01: speciality on the application ───────────────────────────────
ALTER TABLE `dual_solicitudes_alumno`
  ADD COLUMN `id_especialidad` int DEFAULT NULL AFTER `id_convocatoria`,
  ADD KEY `ix_dsa_especialidad` (`id_especialidad`),
  ADD CONSTRAINT `fk_dsa_especialidad` FOREIGN KEY (`id_especialidad`)
    REFERENCES `dual_especialidades` (`id_especialidad`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Copy (fires the current trg_dsa_bu_reglas; motive and state are unchanged).
UPDATE `dual_solicitudes_alumno` sa
  JOIN `gf_alumnosfct` a ON a.idalumno = sa.id_alumno
   SET sa.id_especialidad = a.id_especialidad_dual;

ALTER TABLE `dual_solicitudes_alumno`
  MODIFY COLUMN `id_especialidad` int NOT NULL;

DROP TRIGGER IF EXISTS `trg_dsa_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dsa_bi_reglas` BEFORE INSERT ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  DECLARE v_activa TINYINT DEFAULT 0;

  SELECT activa INTO v_activa
    FROM dual_convocatorias
   WHERE id_convocatoria = NEW.id_convocatoria;

  -- Checked here (before NOT NULL) so the caller gets a readable message.
  IF NEW.id_especialidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno debe indicar la especialidad.';
  END IF;

  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;

  IF NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dsa_bu_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dsa_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  DECLARE v_rechazado TINYINT UNSIGNED;
  DECLARE v_activas INT DEFAULT 0;
  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de alumno es rechazada.';
  END IF;

  -- Active reservations were checked against this ciclo (trg_dr_bi_reglas).
  IF NOT (NEW.id_especialidad <=> OLD.id_especialidad) THEN
    SELECT COUNT(*) INTO v_activas
      FROM dual_reservas
     WHERE id_solicitud_alumno = OLD.id_solicitud_alumno
       AND id_estado_reserva IN (fn_id_estado_reserva('PENDIENTE'), fn_id_estado_reserva('CONFIRMADA'));
    IF v_activas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No se puede cambiar la especialidad de una solicitud con reservas activas.';
    END IF;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dr_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bi_reglas` BEFORE INSERT ON `dual_reservas` FOR EACH ROW BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_estado_alumno TINYINT DEFAULT NULL;
  DECLARE v_estado_empresa TINYINT DEFAULT NULL;
  DECLARE v_convocatoria_alumno INT DEFAULT NULL;
  DECLARE v_convocatoria_empresa INT DEFAULT NULL;
  DECLARE v_especialidad_alumno INT DEFAULT NULL;
  DECLARE v_especialidad_empresa INT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');
  SET v_validado = fn_id_estado_validacion('VALIDADO');

  -- DB-01: the application's own ciclo, not the student's latest one.
  SELECT sa.id_estado_validacion, sa.id_convocatoria, sa.id_especialidad
    INTO v_estado_alumno, v_convocatoria_alumno, v_especialidad_alumno
    FROM dual_solicitudes_alumno sa
   WHERE sa.id_solicitud_alumno = NEW.id_solicitud_alumno;

  SELECT se.id_estado_validacion, se.id_convocatoria, ee.id_especialidad, ee.cantidad_alumnos
    INTO v_estado_empresa, v_convocatoria_empresa, v_especialidad_empresa, v_cantidad
    FROM dual_solicitud_empresa_especialidades ee
    JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
   WHERE ee.id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad;

  IF v_estado_alumno <> v_validado OR v_estado_empresa <> v_validado THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden reservar alumnos y empresas validados.';
  END IF;

  IF v_convocatoria_alumno <> v_convocatoria_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Alumno y empresa deben pertenecer a la misma convocatoria.';
  END IF;

  IF v_especialidad_alumno <> v_especialidad_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La especialidad del alumno no coincide con la especialidad solicitada por la empresa.';
  END IF;

  IF NEW.id_estado_reserva IN (v_pendiente, v_confirmada) THEN
    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (v_pendiente, v_confirmada);

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad de empresa.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = v_confirmada;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;

  IF NEW.id_estado_reserva = v_confirmada AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva <> v_confirmada AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato solo se indica en una reserva confirmada.';
  END IF;

  IF NEW.id_estado_reserva = fn_id_estado_reserva('CANCELADA')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;
END$$
DELIMITER ;

-- Unused by the backend (removal is planned for Stage 4); kept consistent meanwhile.
CREATE OR REPLACE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_alumnos_disponibles` AS
SELECT sa.id_solicitud_alumno AS id_solicitud_alumno,
       a.idalumno AS idalumno,
       a.nombre AS nombre,
       a.dni AS dni,
       a.email AS email,
       a.telalumno AS telalumno,
       e.codigo AS codigo_especialidad,
       e.nombre AS especialidad,
       (CASE e.turno WHEN 0 THEN 'DIURNO' WHEN 1 THEN 'VESPERTINO' END) AS turno,
       c.nombre AS convocatoria
  FROM dual_solicitudes_alumno sa
  JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
  JOIN dual_especialidades e ON e.id_especialidad = sa.id_especialidad
  JOIN dual_convocatorias c ON c.id_convocatoria = sa.id_convocatoria
  LEFT JOIN dual_reservas r_confirmada
    ON r_confirmada.id_solicitud_alumno = sa.id_solicitud_alumno
   AND r_confirmada.id_estado_reserva = 2
 WHERE c.activa = 1
   AND sa.id_estado_validacion = 2
   AND r_confirmada.id_reserva IS NULL;

-- ─── 2. DB-03: one current document per parent and type ────────────────────
ALTER TABLE `dual_documentos`
  ADD COLUMN `padre_actual` varchar(16) GENERATED ALWAYS AS (
    (CASE WHEN `es_actual` = 1 THEN
       (CASE WHEN `id_solicitud_alumno` IS NOT NULL THEN CONCAT('A', `id_solicitud_alumno`)
             WHEN `id_solicitud_empresa` IS NOT NULL THEN CONCAT('E', `id_solicitud_empresa`)
             ELSE CONCAT('R', `id_reserva`) END)
     END)) STORED,
  ADD UNIQUE KEY `uq_dd_actual` (`padre_actual`, `id_tipo_documento`);

-- sp_guardar_documento: the "current document" lookup becomes a locking read, so a
-- caller whose REPEATABLE READ snapshot predates a concurrent upload still finds
-- that upload's row (and waits for it) instead of inserting a duplicate.
-- Otherwise identical to the baseline definition.
DROP PROCEDURE IF EXISTS `sp_guardar_documento`;
DELIMITER $$
CREATE PROCEDURE `sp_guardar_documento`(
  IN p_id_solicitud_alumno  INT,
  IN p_id_solicitud_empresa INT,
  IN p_id_reserva           INT,
  IN p_id_tipo_documento    INT,
  IN p_archivo              LONGBLOB
)
BEGIN
  DECLARE v_id INT DEFAULT NULL;

  IF p_id_solicitud_alumno IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_alumno = p_id_solicitud_alumno
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1
     FOR UPDATE;
  ELSEIF p_id_solicitud_empresa IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_empresa = p_id_solicitud_empresa
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1
     FOR UPDATE;
  ELSEIF p_id_reserva IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_reserva = p_id_reserva
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    INSERT INTO dual_documento_versiones
      (id_documento, archivo, id_estado_validacion, motivo, estado_workflow, id_usuario_origen, origen_documento, id_plantilla)
    SELECT id_documento, archivo, id_estado_validacion, motivo, estado_workflow, id_usuario_origen, origen_documento, id_plantilla
      FROM dual_documentos
     WHERE id_documento = v_id;

    UPDATE dual_documentos
       SET archivo = p_archivo,
           id_estado_validacion = (
             SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1
           ),
           motivo = NULL,
           estado_workflow = 'SUBIDO',
           es_actual = 1
     WHERE id_documento = v_id;
    SELECT v_id AS id_documento;
  ELSE
    INSERT INTO dual_documentos
      (id_solicitud_alumno, id_solicitud_empresa, id_reserva, id_tipo_documento, archivo, id_estado_validacion, estado_workflow, es_actual, origen_documento)
    VALUES (
      p_id_solicitud_alumno, p_id_solicitud_empresa, p_id_reserva,
      p_id_tipo_documento, p_archivo,
      (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1),
      'SUBIDO',
      1,
      'LEGACY'
    );
    SELECT LAST_INSERT_ID() AS id_documento;
  END IF;
END$$
DELIMITER ;

-- ─── 3. DB-10: quota floor ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS `trg_dsee_bu_cupo`;
DELIMITER $$
CREATE TRIGGER `trg_dsee_bu_cupo` BEFORE UPDATE ON `dual_solicitud_empresa_especialidades` FOR EACH ROW BEGIN
  -- Raising places, or lowering them to a value still >= the active reservations,
  -- is allowed. The backend cancels the chosen pending reservations first.
  IF NEW.cantidad_alumnos < OLD.cantidad_alumnos
     AND NEW.cantidad_alumnos < fn_reservas_activas(OLD.id_solicitud_empresa_especialidad) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se pueden reducir las plazas por debajo de las reservas activas.';
  END IF;
END$$
DELIMITER ;

-- ─── audit queries for the guards (run by hand if 017 stops) ───────────────
--   SELECT id_alumno, COUNT(*) FROM dual_solicitudes_alumno GROUP BY id_alumno HAVING COUNT(*) > 1;
--   SELECT sa.id_solicitud_alumno FROM dual_solicitudes_alumno sa
--     JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno WHERE a.id_especialidad_dual IS NULL;
--   SELECT r.id_reserva FROM dual_reservas r
--     JOIN dual_solicitudes_alumno sa ON sa.id_solicitud_alumno = r.id_solicitud_alumno
--     JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
--     JOIN dual_solicitud_empresa_especialidades ee ON ee.id_solicitud_empresa_especialidad = r.id_solicitud_empresa_especialidad
--    WHERE ee.id_especialidad <> a.id_especialidad_dual;
--   SELECT COALESCE(id_solicitud_alumno,0), COALESCE(id_solicitud_empresa,0), COALESCE(id_reserva,0),
--          id_tipo_documento, COUNT(*) FROM dual_documentos WHERE es_actual = 1
--    GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1;
--   SELECT id_solicitud_empresa_especialidad FROM dual_solicitud_empresa_especialidades
--    WHERE fn_reservas_activas(id_solicitud_empresa_especialidad) > cantidad_alumnos;
