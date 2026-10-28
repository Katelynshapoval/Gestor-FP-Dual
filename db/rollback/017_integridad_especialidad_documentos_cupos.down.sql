-- Rollback of 017_integridad_especialidad_documentos_cupos.sql
--
-- WARNING · data loss: dual_solicitudes_alumno.id_especialidad is dropped. Any
-- application whose ciclo differs from its student's current
-- gf_alumnosfct.id_especialidad_dual (a returning student who changed ciclo after
-- 017) will again show the student's latest ciclo. Export first:
--   SELECT id_solicitud_alumno, id_especialidad FROM dual_solicitudes_alumno;
-- Deploy the previous backend BEFORE running this file: the Stage 1 backend
-- inserts id_especialidad, which no longer exists afterwards.
--
-- Restores trg_dsa_bi_reglas, trg_dsa_bu_reglas and trg_dr_bi_reglas exactly as
-- migration 012 created them and vw_alumnos_disponibles as in 000_baseline.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '017';

DROP PROCEDURE IF EXISTS `sp_017_comprobar`;
DROP TRIGGER IF EXISTS `trg_dsee_bu_cupo`;

ALTER TABLE `dual_documentos`
  DROP INDEX `uq_dd_actual`,
  DROP COLUMN `padre_actual`;

DROP TRIGGER IF EXISTS `trg_dr_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bi_reglas` BEFORE INSERT ON `dual_reservas` FOR EACH ROW
BEGIN
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

  SELECT sa.id_estado_validacion, sa.id_convocatoria, a.id_especialidad_dual
    INTO v_estado_alumno, v_convocatoria_alumno, v_especialidad_alumno
    FROM dual_solicitudes_alumno sa
    JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
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

DROP TRIGGER IF EXISTS `trg_dsa_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dsa_bi_reglas` BEFORE INSERT ON `dual_solicitudes_alumno` FOR EACH ROW
BEGIN
  DECLARE v_especialidad INT DEFAULT NULL;
  DECLARE v_activa TINYINT DEFAULT 0;

  SELECT id_especialidad_dual INTO v_especialidad
    FROM gf_alumnosfct
   WHERE idalumno = NEW.id_alumno;

  SELECT activa INTO v_activa
    FROM dual_convocatorias
   WHERE id_convocatoria = NEW.id_convocatoria;

  IF v_especialidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno debe tener id_especialidad_dual antes de solicitar Dual.';
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
CREATE TRIGGER `trg_dsa_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_alumno` FOR EACH ROW
BEGIN
  DECLARE v_rechazado TINYINT UNSIGNED;
  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de alumno es rechazada.';
  END IF;
END$$
DELIMITER ;

CREATE OR REPLACE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_alumnos_disponibles` AS select `sa`.`id_solicitud_alumno` AS `id_solicitud_alumno`,`a`.`idalumno` AS `idalumno`,`a`.`nombre` AS `nombre`,`a`.`dni` AS `dni`,`a`.`email` AS `email`,`a`.`telalumno` AS `telalumno`,`e`.`codigo` AS `codigo_especialidad`,`e`.`nombre` AS `especialidad`,(case `e`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`c`.`nombre` AS `convocatoria` from ((((`dual_solicitudes_alumno` `sa` join `gf_alumnosfct` `a` on((`a`.`idalumno` = `sa`.`id_alumno`))) join `dual_especialidades` `e` on((`e`.`id_especialidad` = `a`.`id_especialidad_dual`))) join `dual_convocatorias` `c` on((`c`.`id_convocatoria` = `sa`.`id_convocatoria`))) left join `dual_reservas` `r_confirmada` on(((`r_confirmada`.`id_solicitud_alumno` = `sa`.`id_solicitud_alumno`) and (`r_confirmada`.`id_estado_reserva` = 2)))) where ((`c`.`activa` = 1) and (`sa`.`id_estado_validacion` = 2) and (`r_confirmada`.`id_reserva` is null));

-- sp_guardar_documento as in 000_baseline (lookups without FOR UPDATE).
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
     LIMIT 1;
  ELSEIF p_id_solicitud_empresa IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_empresa = p_id_solicitud_empresa
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1;
  ELSEIF p_id_reserva IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_reserva = p_id_reserva
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1;
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

ALTER TABLE `dual_solicitudes_alumno`
  DROP FOREIGN KEY `fk_dsa_especialidad`,
  DROP INDEX `ix_dsa_especialidad`,
  DROP COLUMN `id_especialidad`;
