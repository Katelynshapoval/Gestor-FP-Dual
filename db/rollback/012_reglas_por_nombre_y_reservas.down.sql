-- Rollback of 012_reglas_por_nombre_y_reservas.sql
-- Restores the exact procedure and trigger bodies recorded in db/000_baseline.sql
-- (state before 012) and drops the three lookup functions. No rows are changed.
-- Documents already retired by a reactivation (es_actual = 0) stay retired.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '012';

DROP PROCEDURE IF EXISTS `sp_validar_solicitud_alumno`;
-- PROCEDURE sp_validar_solicitud_alumno
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT
)
BEGIN
  DECLARE v_cv_validado INT DEFAULT 0;
  DECLARE v_anexo_validado INT DEFAULT 0;

  SELECT COUNT(*) INTO v_cv_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = 1
     AND id_estado_validacion = 2;

  SELECT COUNT(*) INTO v_anexo_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = 2
     AND id_estado_validacion = 2;

  IF v_cv_validado = 0 OR v_anexo_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para validar al alumno deben estar validados CV y ANEXO_2.';
  END IF;

  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = 2,
         motivo = NULL
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_rechazar_solicitud_alumno`;
-- PROCEDURE sp_rechazar_solicitud_alumno
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo del rechazo de la solicitud de alumno.';
  END IF;

  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = 3,
         motivo = p_motivo
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_validar_solicitud_empresa`;
-- PROCEDURE sp_validar_solicitud_empresa
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT
)
BEGIN
  DECLARE v_convenio_validado INT DEFAULT 0;
  DECLARE v_especialidades INT DEFAULT 0;

  SELECT COUNT(*) INTO v_convenio_validado
    FROM dual_documentos
   WHERE id_solicitud_empresa = p_id_solicitud_empresa
     AND id_tipo_documento = 3
     AND id_estado_validacion = 2;

  SELECT COUNT(*) INTO v_especialidades
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF v_convenio_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para validar la empresa debe estar validado el CONVENIO.';
  END IF;

  IF v_especialidades = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La empresa debe solicitar al menos una especialidad.';
  END IF;

  UPDATE dual_solicitudes_empresa
     SET id_estado_validacion = 2,
         motivo = NULL
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_rechazar_solicitud_empresa`;
-- PROCEDURE sp_rechazar_solicitud_empresa
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo del rechazo de la solicitud de empresa.';
  END IF;

  UPDATE dual_solicitudes_empresa
     SET id_estado_validacion = 3,
         motivo = p_motivo
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_validar_documento`;
-- PROCEDURE sp_validar_documento
DELIMITER $$
CREATE PROCEDURE `sp_validar_documento`(
  IN p_id_documento INT
)
BEGIN
  UPDATE dual_documentos
     SET id_estado_validacion = 2,
         motivo = NULL
   WHERE id_documento = p_id_documento;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento indicado no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_rechazar_documento`;
-- PROCEDURE sp_rechazar_documento
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_documento`(
  IN p_id_documento INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo del rechazo del documento.';
  END IF;

  UPDATE dual_documentos
     SET id_estado_validacion = 3,
         motivo = p_motivo
   WHERE id_documento = p_id_documento;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento indicado no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_reservar_alumno`;
-- PROCEDURE sp_reservar_alumno
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
-- PROCEDURE sp_cancelar_reserva
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
-- PROCEDURE sp_cancelar_reserva_admin
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
-- PROCEDURE sp_confirmar_reserva
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
-- PROCEDURE sp_reasignar_reserva
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

DROP TRIGGER IF EXISTS `trg_dr_bi_reglas`;
-- TRIGGER trg_dr_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dr_bi_reglas` BEFORE INSERT ON `dual_reservas` FOR EACH ROW BEGIN
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
-- TRIGGER trg_dr_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dr_bu_reglas` BEFORE UPDATE ON `dual_reservas` FOR EACH ROW BEGIN
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

  IF NEW.id_solicitud_alumno <> OLD.id_solicitud_alumno
     OR NEW.id_solicitud_empresa_especialidad <> OLD.id_solicitud_empresa_especialidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cambiar el alumno ni la especialidad de una reserva existente.';
  END IF;

  IF OLD.id_estado_reserva = 2 AND NEW.id_estado_reserva NOT IN (2, 3) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada solo puede cancelarse de forma administrativa.';
  END IF;

  IF NEW.id_estado_reserva = 2 AND OLD.id_estado_reserva NOT IN (1, 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede pasar a CONFIRMADA.';
  END IF;

  IF NEW.id_estado_reserva = 2 AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva = 3 AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada no puede tener tipo de contrato.';
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

DROP TRIGGER IF EXISTS `trg_dd_bi_reglas`;
-- TRIGGER trg_dd_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dd_bi_reglas` BEFORE INSERT ON `dual_documentos` FOR EACH ROW BEGIN
  DECLARE v_tipo VARCHAR(40) DEFAULT NULL;

  SELECT nombre INTO v_tipo
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_tipo IN ('CV', 'ANEXO_2') AND NEW.id_solicitud_alumno IS NULL)
     OR (v_tipo = 'CONVENIO' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_tipo = 'ANEXO_H' AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dd_bu_reglas`;
-- TRIGGER trg_dd_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dd_bu_reglas` BEFORE UPDATE ON `dual_documentos` FOR EACH ROW BEGIN
  DECLARE v_tipo VARCHAR(40) DEFAULT NULL;

  SELECT nombre INTO v_tipo
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_tipo IN ('CV', 'ANEXO_2') AND NEW.id_solicitud_alumno IS NULL)
     OR (v_tipo = 'CONVENIO' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_tipo = 'ANEXO_H' AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando un documento es rechazado.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dsa_bi_reglas`;
-- TRIGGER trg_dsa_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dsa_bi_reglas` BEFORE INSERT ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
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

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dsa_bu_reglas`;
-- TRIGGER trg_dsa_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dsa_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de alumno es rechazada.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dse_bi_reglas`;
-- TRIGGER trg_dse_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dse_bi_reglas` BEFORE INSERT ON `dual_solicitudes_empresa` FOR EACH ROW BEGIN
  DECLARE v_empresa_representante INT DEFAULT NULL;
  DECLARE v_empresa_coordinador INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_legal INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_trabajo INT DEFAULT NULL;
  DECLARE v_activa TINYINT DEFAULT 0;

  SELECT d.idempresa INTO v_empresa_representante
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_representante_legal;

  SELECT d.idempresa INTO v_empresa_coordinador
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_coordinador_empresa;

  SELECT idempresa INTO v_empresa_domicilio_legal
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_legal;

  SELECT idempresa INTO v_empresa_domicilio_trabajo
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_trabajo;

  SELECT activa INTO v_activa
    FROM dual_convocatorias
   WHERE id_convocatoria = NEW.id_convocatoria;

  IF v_empresa_representante <> NEW.id_empresa
     OR v_empresa_coordinador <> NEW.id_empresa
     OR v_empresa_domicilio_legal <> NEW.id_empresa
     OR v_empresa_domicilio_trabajo <> NEW.id_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Contactos y domicilios deben pertenecer a la misma empresa de la solicitud.';
  END IF;

  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dse_bu_reglas`;
-- TRIGGER trg_dse_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dse_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_empresa` FOR EACH ROW BEGIN
  DECLARE v_empresa_representante INT DEFAULT NULL;
  DECLARE v_empresa_coordinador INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_legal INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_trabajo INT DEFAULT NULL;

  SELECT d.idempresa INTO v_empresa_representante
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_representante_legal;

  SELECT d.idempresa INTO v_empresa_coordinador
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_coordinador_empresa;

  SELECT idempresa INTO v_empresa_domicilio_legal
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_legal;

  SELECT idempresa INTO v_empresa_domicilio_trabajo
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_trabajo;

  IF v_empresa_representante <> NEW.id_empresa
     OR v_empresa_coordinador <> NEW.id_empresa
     OR v_empresa_domicilio_legal <> NEW.id_empresa
     OR v_empresa_domicilio_trabajo <> NEW.id_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Contactos y domicilios deben pertenecer a la misma empresa de la solicitud.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de empresa es rechazada.';
  END IF;
END$$
DELIMITER ;

DROP FUNCTION IF EXISTS `fn_id_estado_reserva`;
DROP FUNCTION IF EXISTS `fn_id_estado_validacion`;
DROP FUNCTION IF EXISTS `fn_id_tipo_documento`;
