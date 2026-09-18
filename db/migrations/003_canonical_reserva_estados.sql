-- 003_canonical_reserva_estados.sql
-- Canonical reservation states (names only; numeric IDs/FKs preserved):
--   1 PENDIENTE   (was RESERVADA in production)
--   2 CONFIRMADA
--   3 CANCELADA
-- Recreates reservation procedures/triggers so:
--   - sp_reservar_alumno returns id_reserva
--   - companies cancel PENDIENTE only
--   - staff can cancel CONFIRMED placements
--   - reassignment is a single transaction
-- Does not drop dual_reservas rows.

USE `proyecto_dual`;

UPDATE `dual_estados_reserva`
   SET `nombre` = 'PENDIENTE'
 WHERE `nombre` = 'RESERVADA';

UPDATE `dual_estados_reserva`
   SET `nombre` = 'CONFIRMADA'
 WHERE `nombre` = 'CONFIRMADO';

UPDATE `dual_estados_reserva`
   SET `nombre` = 'CANCELADA'
 WHERE `nombre` = 'CANCELADO';

-- ─────────────────────────────────────────────────────────────────────────────
-- Occupancy helpers (1 = PENDIENTE, 2 = CONFIRMADA)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS `fn_reservas_activas`;
DELIMITER $$
CREATE FUNCTION `fn_reservas_activas`(
  p_id_solicitud_empresa_especialidad INT
) RETURNS int
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_total INT DEFAULT 0;

  SELECT COUNT(*)
    INTO v_total
    FROM dual_reservas r
    JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
   WHERE r.id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
     AND er.nombre IN ('PENDIENTE', 'CONFIRMADA');

  RETURN v_total;
END$$
DELIMITER ;

DROP FUNCTION IF EXISTS `fn_cupos_disponibles`;
DELIMITER $$
CREATE FUNCTION `fn_cupos_disponibles`(
  p_id_solicitud_empresa_especialidad INT
) RETURNS int
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_cantidad INT DEFAULT 0;

  SELECT e.cantidad_alumnos
    INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades e
   WHERE e.id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad;

  RETURN GREATEST(IFNULL(v_cantidad, 0) - fn_reservas_activas(p_id_solicitud_empresa_especialidad), 0);
END$$
DELIMITER ;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers: allow administrative CONFIRMADA → CANCELADA (clears generated unique)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS `trg_dr_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bi_reglas` BEFORE INSERT ON `dual_reservas` FOR EACH ROW
BEGIN
  DECLARE v_estado_alumno TINYINT DEFAULT NULL;
  DECLARE v_estado_empresa TINYINT DEFAULT NULL;
  DECLARE v_convocatoria_alumno INT DEFAULT NULL;
  DECLARE v_convocatoria_empresa INT DEFAULT NULL;
  DECLARE v_especialidad_alumno INT DEFAULT NULL;
  DECLARE v_especialidad_empresa INT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

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

  IF v_estado_alumno <> 2 OR v_estado_empresa <> 2 THEN
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

  IF NEW.id_estado_reserva IN (1, 2) THEN
    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (1, 2);

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad de empresa.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = 2;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;

  IF NEW.id_estado_reserva = 2 AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva <> 2 AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato solo se indica en una reserva confirmada.';
  END IF;

  IF NEW.id_estado_reserva = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dr_bu_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bu_reglas` BEFORE UPDATE ON `dual_reservas` FOR EACH ROW
BEGIN
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

  IF NEW.id_solicitud_alumno <> OLD.id_solicitud_alumno
     OR NEW.id_solicitud_empresa_especialidad <> OLD.id_solicitud_empresa_especialidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cambiar el alumno ni la especialidad de una reserva existente.';
  END IF;

  -- Confirmed placements may only stay confirmed or be cancelled by staff.
  IF OLD.id_estado_reserva = 2 AND NEW.id_estado_reserva NOT IN (2, 3) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada solo puede cancelarse de forma administrativa.';
  END IF;

  IF NEW.id_estado_reserva = 2 AND OLD.id_estado_reserva <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede pasar a CONFIRMADA.';
  END IF;

  IF NEW.id_estado_reserva = 2 AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva <> 2 AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato solo se indica en una reserva confirmada.';
  END IF;

  IF NEW.id_estado_reserva = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;

  IF NEW.id_estado_reserva <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando una reserva es cancelada.';
  END IF;

  IF NEW.id_estado_reserva IN (1, 2) AND OLD.id_estado_reserva = 3 THEN
    SELECT cantidad_alumnos INTO v_cantidad
      FROM dual_solicitud_empresa_especialidades
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad;

    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (1, 2)
       AND id_reserva <> OLD.id_reserva;

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para reactivar la reserva.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = 2
       AND id_reserva <> OLD.id_reserva;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;
END$$
DELIMITER ;

-- ─────────────────────────────────────────────────────────────────────────────
-- Procedures
-- ─────────────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_reservar_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_reservar_alumno`(
  IN p_id_solicitud_alumno INT,
  IN p_id_solicitud_empresa_especialidad INT
)
BEGIN
  DECLARE v_id_reserva INT DEFAULT NULL;
  DECLARE v_estado TINYINT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE v_lock_alumno INT DEFAULT NULL;
  DECLARE v_lock_count INT DEFAULT 0;
  DECLARE v_ya_confirmado INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  START TRANSACTION;

  SET v_no_data = 0;
  SELECT cantidad_alumnos INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   FOR UPDATE;

  IF v_no_data = 1 OR v_cantidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La especialidad solicitada por la empresa no existe.';
  END IF;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   FOR UPDATE;

  SET v_no_data = 0;
  SELECT id_solicitud_alumno INTO v_lock_alumno
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
   FOR UPDATE;

  IF v_no_data = 1 OR v_lock_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud del alumno no existe.';
  END IF;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_ocupadas
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
     AND id_estado_reserva IN (1, 2);

  SELECT COUNT(*) INTO v_ya_confirmado
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_estado_reserva = 2;

  SET v_no_data = 0;
  SET v_id_reserva = NULL;
  SET v_estado = NULL;
  SELECT id_reserva, id_estado_reserva
    INTO v_id_reserva, v_estado
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   LIMIT 1
   FOR UPDATE;

  IF v_no_data = 1 THEN
    SET v_id_reserva = NULL;
    SET v_estado = NULL;
  END IF;

  IF v_id_reserva IS NULL THEN
    IF v_ya_confirmado > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad.';
    END IF;

    INSERT INTO dual_reservas (
      id_solicitud_alumno,
      id_solicitud_empresa_especialidad,
      id_estado_reserva,
      id_tipo_contrato,
      motivo
    ) VALUES (
      p_id_solicitud_alumno,
      p_id_solicitud_empresa_especialidad,
      1,
      NULL,
      NULL
    );
    SET v_id_reserva = LAST_INSERT_ID();
  ELSE
    IF v_estado = 1 THEN
      SET v_id_reserva = v_id_reserva;
    ELSEIF v_estado = 2 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada con esta oferta.';
    ELSE
      IF v_ya_confirmado > 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
      END IF;
      IF v_ocupadas >= v_cantidad THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad.';
      END IF;

      UPDATE dual_reservas
         SET id_estado_reserva = 1,
             id_tipo_contrato = NULL,
             motivo = NULL
       WHERE id_reserva = v_id_reserva;
    END IF;
  END IF;

  COMMIT;
  SELECT v_id_reserva AS id_reserva;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cancelar_reserva`;
DELIMITER $$
CREATE PROCEDURE `sp_cancelar_reserva`(
  IN p_id_reserva INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelacion.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva
     AND id_estado_reserva = 1;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE existente puede cancelarse.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cancelar_reserva_admin`;
DELIMITER $$
CREATE PROCEDURE `sp_cancelar_reserva_admin`(
  IN p_id_reserva INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_estado TINYINT DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelacion.';
  END IF;

  START TRANSACTION;

  SET v_no_data = 0;
  SELECT id_estado_reserva INTO v_estado
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_no_data = 1 OR v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  IF v_estado = 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva ya esta cancelada.';
  END IF;

  IF v_estado NOT IN (1, 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estado de la reserva no permite cancelacion administrativa.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva;

  COMMIT;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_confirmar_reserva`;
DELIMITER $$
CREATE PROCEDURE `sp_confirmar_reserva`(
  IN p_id_reserva INT,
  IN p_id_tipo_contrato TINYINT UNSIGNED
)
BEGIN
  DECLARE v_solicitud_alumno INT DEFAULT NULL;
  DECLARE v_estado_reserva TINYINT DEFAULT NULL;
  DECLARE v_bloqueo_solicitud INT DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id_solicitud_alumno, id_estado_reserva
    INTO v_solicitud_alumno, v_estado_reserva
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_solicitud_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  IF v_estado_reserva <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede confirmarse.';
  END IF;

  SELECT id_solicitud_alumno INTO v_bloqueo_solicitud
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_solicitud_alumno
   FOR UPDATE;

  UPDATE dual_reservas
     SET id_estado_reserva = 2,
         id_tipo_contrato = p_id_tipo_contrato,
         motivo = NULL
   WHERE id_reserva = p_id_reserva;

  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = 'Alumno asignado a otra empresa.'
   WHERE id_solicitud_alumno = v_solicitud_alumno
     AND id_reserva <> p_id_reserva
     AND id_estado_reserva = 1;

  COMMIT;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_reasignar_reserva`;
DELIMITER $$
CREATE PROCEDURE `sp_reasignar_reserva`(
  IN p_id_reserva_origen INT,
  IN p_id_oferta_destino INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_id_alumno INT DEFAULT NULL;
  DECLARE v_oferta_origen INT DEFAULT NULL;
  DECLARE v_estado_origen TINYINT DEFAULT NULL;
  DECLARE v_id_nueva INT DEFAULT NULL;
  DECLARE v_estado_dest TINYINT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE v_lock_count INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la reasignacion.';
  END IF;

  START TRANSACTION;

  SET v_no_data = 0;
  SELECT id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva
    INTO v_id_alumno, v_oferta_origen, v_estado_origen
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva_origen
   FOR UPDATE;

  IF v_no_data = 1 OR v_id_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva de origen no existe.';
  END IF;

  IF v_estado_origen = 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede reasignar una reserva cancelada.';
  END IF;

  IF v_oferta_origen = p_id_oferta_destino THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La oferta de destino debe ser distinta a la actual.';
  END IF;

  SET v_no_data = 0;
  SELECT cantidad_alumnos INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
   FOR UPDATE;

  IF v_no_data = 1 OR v_cantidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La oferta de destino no existe.';
  END IF;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_id_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_alumno = v_id_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
   FOR UPDATE;

  SELECT COUNT(*) INTO v_ocupadas
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
     AND id_estado_reserva IN (1, 2);

  SET v_no_data = 0;
  SET v_id_nueva = NULL;
  SET v_estado_dest = NULL;
  SELECT id_reserva, id_estado_reserva
    INTO v_id_nueva, v_estado_dest
    FROM dual_reservas
   WHERE id_solicitud_alumno = v_id_alumno
     AND id_solicitud_empresa_especialidad = p_id_oferta_destino
   LIMIT 1
   FOR UPDATE;

  IF v_no_data = 1 THEN
    SET v_id_nueva = NULL;
    SET v_estado_dest = NULL;
  END IF;

  IF v_id_nueva IS NOT NULL AND v_estado_dest IN (1, 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva activa con esa oferta.';
  END IF;

  IF v_id_nueva IS NULL AND v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles en la oferta de destino.';
  END IF;

  IF v_id_nueva IS NOT NULL AND v_estado_dest = 3 AND v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles en la oferta de destino.';
  END IF;

  -- Cancel the current placement first so confirmed uniqueness is released
  -- inside this same transaction before the new pending row is created.
  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva_origen;

  IF v_id_nueva IS NULL THEN
    INSERT INTO dual_reservas (
      id_solicitud_alumno,
      id_solicitud_empresa_especialidad,
      id_estado_reserva,
      id_tipo_contrato,
      motivo
    ) VALUES (
      v_id_alumno,
      p_id_oferta_destino,
      1,
      NULL,
      NULL
    );
    SET v_id_nueva = LAST_INSERT_ID();
  ELSE
    UPDATE dual_reservas
       SET id_estado_reserva = 1,
           id_tipo_contrato = NULL,
           motivo = NULL
     WHERE id_reserva = v_id_nueva;
  END IF;

  COMMIT;
  SELECT v_id_nueva AS id_reserva, p_id_reserva_origen AS id_reserva_origen;
END$$
DELIMITER ;
