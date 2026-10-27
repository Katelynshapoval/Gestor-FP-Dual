-- 012_reglas_por_nombre_y_reservas.sql
-- Phase 2 · PM-4, V-1, WF-4, WF-5 (database side).
--
-- 1. Three lookup functions: procedures and triggers resolve states and document
--    types by name instead of the numeric ids 1/2/3.
-- 2. V-1: sp_validar_solicitud_alumno requires the current CV and ANEXO_DGA
--    (it required ids 1 and 2 = CV and the legacy ANEXO_2, so every new
--    application failed). Same rule Node already applies (missingStudentValidation).
-- 3. WF-4: when a CANCELADA reservation row is reactivated (sp_reservar_alumno,
--    sp_reasignar_reserva destination), its documents stop being current
--    (es_actual = 0, they stay in history) and the tutor is cleared. Completes
--    migration 007, whose sp_reasignar_reserva never reached this database.
-- 4. WF-5: sp_confirmar_reserva confirms with the STORED contract type (a different
--    type in the call is refused) and requires the current annex of that family
--    (Anexo III for "beca", Anexo II otherwise) to be VALIDADO. Signatures are
--    checked by the backend before validation (D1), so a validated annex is signed.
-- 5. Document triggers know the current catalogue (ANEXO_DGA, ANEXO_II/III, …).
--
-- Rules, messages and locking order are otherwise unchanged. No table or row is
-- changed by this file except through the procedures when they are later called.
-- Rollback: db/rollback/012_reglas_por_nombre_y_reservas.down.sql

-- ─── lookup functions ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS `fn_id_estado_reserva`;
DELIMITER $$
CREATE FUNCTION `fn_id_estado_reserva`(p_nombre VARCHAR(30)) RETURNS TINYINT UNSIGNED
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_id TINYINT UNSIGNED DEFAULT NULL;
  SELECT id_estado_reserva INTO v_id FROM dual_estados_reserva WHERE nombre = p_nombre LIMIT 1;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estado de reserva no configurado.';
  END IF;
  RETURN v_id;
END$$
DELIMITER ;

DROP FUNCTION IF EXISTS `fn_id_estado_validacion`;
DELIMITER $$
CREATE FUNCTION `fn_id_estado_validacion`(p_nombre VARCHAR(30)) RETURNS TINYINT UNSIGNED
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_id TINYINT UNSIGNED DEFAULT NULL;
  SELECT id_estado_validacion INTO v_id FROM dual_estados_validacion WHERE nombre = p_nombre LIMIT 1;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estado de validación no configurado.';
  END IF;
  RETURN v_id;
END$$
DELIMITER ;

DROP FUNCTION IF EXISTS `fn_id_tipo_documento`;
DELIMITER $$
CREATE FUNCTION `fn_id_tipo_documento`(p_nombre VARCHAR(40)) RETURNS TINYINT UNSIGNED
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_id TINYINT UNSIGNED DEFAULT NULL;
  SELECT id_tipo_documento INTO v_id FROM dual_tipos_documento WHERE nombre = p_nombre LIMIT 1;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tipo de documento no configurado.';
  END IF;
  RETURN v_id;
END$$
DELIMITER ;

-- ─── validation procedures ─────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT
)
BEGIN
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_cv_validado INT DEFAULT 0;
  DECLARE v_anexo_validado INT DEFAULT 0;

  SET v_validado = fn_id_estado_validacion('VALIDADO');

  SELECT COUNT(*) INTO v_cv_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = fn_id_tipo_documento('CV')
     AND es_actual = 1
     AND id_estado_validacion = v_validado;

  SELECT COUNT(*) INTO v_anexo_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = fn_id_tipo_documento('ANEXO_DGA')
     AND es_actual = 1
     AND id_estado_validacion = v_validado;

  IF v_cv_validado = 0 OR v_anexo_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para validar al alumno deben estar validados el CV y el Anexo DGA.';
  END IF;

  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = v_validado,
         motivo = NULL
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_rechazar_solicitud_alumno`;
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
     SET id_estado_validacion = fn_id_estado_validacion('RECHAZADO'),
         motivo = p_motivo
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_validar_solicitud_empresa`;
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT
)
BEGIN
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_convenio_validado INT DEFAULT 0;
  DECLARE v_especialidades INT DEFAULT 0;

  SET v_validado = fn_id_estado_validacion('VALIDADO');

  SELECT COUNT(*) INTO v_convenio_validado
    FROM dual_documentos
   WHERE id_solicitud_empresa = p_id_solicitud_empresa
     AND id_tipo_documento = fn_id_tipo_documento('CONVENIO')
     AND es_actual = 1
     AND id_estado_validacion = v_validado;

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
     SET id_estado_validacion = v_validado,
         motivo = NULL
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_rechazar_solicitud_empresa`;
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
     SET id_estado_validacion = fn_id_estado_validacion('RECHAZADO'),
         motivo = p_motivo
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_validar_documento`;
DELIMITER $$
CREATE PROCEDURE `sp_validar_documento`(
  IN p_id_documento INT
)
BEGIN
  UPDATE dual_documentos
     SET id_estado_validacion = fn_id_estado_validacion('VALIDADO'),
         motivo = NULL
   WHERE id_documento = p_id_documento;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento indicado no existe.';
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_rechazar_documento`;
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
     SET id_estado_validacion = fn_id_estado_validacion('RECHAZADO'),
         motivo = p_motivo
   WHERE id_documento = p_id_documento;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento indicado no existe.';
  END IF;
END$$
DELIMITER ;

-- ─── reservation procedures ────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_reservar_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_reservar_alumno`(
  IN p_id_solicitud_alumno INT,
  IN p_id_solicitud_empresa_especialidad INT
)
BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
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

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');

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
     AND id_estado_reserva IN (v_pendiente, v_confirmada);

  SELECT COUNT(*) INTO v_ya_confirmado
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_estado_reserva = v_confirmada;

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
      v_pendiente,
      NULL,
      NULL
    );
    SET v_id_reserva = LAST_INSERT_ID();
  ELSE
    IF v_estado = v_pendiente THEN
      SET v_id_reserva = v_id_reserva;
    ELSEIF v_estado = v_confirmada THEN
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

      -- WF-4: the reactivated row starts clean. Old documents stay as history.
      UPDATE dual_reservas
         SET id_estado_reserva = v_pendiente,
             id_tipo_contrato = NULL,
             id_empresa_tutor = NULL,
             motivo = NULL
       WHERE id_reserva = v_id_reserva;

      UPDATE dual_documentos
         SET es_actual = 0
       WHERE id_reserva = v_id_reserva
         AND es_actual = 1;
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

  -- The tutor and the documents are kept: they describe what the cancelled placement had.
  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva
     AND id_estado_reserva = fn_id_estado_reserva('PENDIENTE');

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

  IF v_estado = fn_id_estado_reserva('CANCELADA') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva ya esta cancelada.';
  END IF;

  IF v_estado NOT IN (fn_id_estado_reserva('PENDIENTE'), fn_id_estado_reserva('CONFIRMADA')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estado de la reserva no permite cancelacion administrativa.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
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
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_solicitud_alumno INT DEFAULT NULL;
  DECLARE v_estado_reserva TINYINT DEFAULT NULL;
  DECLARE v_tipo_contrato TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_nombre_contrato VARCHAR(100) DEFAULT NULL;
  DECLARE v_anexo VARCHAR(40) DEFAULT NULL;
  DECLARE v_anexo_validado INT DEFAULT 0;
  DECLARE v_bloqueo_solicitud INT DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');

  START TRANSACTION;

  SELECT r.id_solicitud_alumno, r.id_estado_reserva, r.id_tipo_contrato, tc.nombre
    INTO v_solicitud_alumno, v_estado_reserva, v_tipo_contrato, v_nombre_contrato
    FROM dual_reservas r
    LEFT JOIN dual_tipos_contrato tc ON tc.id_tipo_contrato = r.id_tipo_contrato
   WHERE r.id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_solicitud_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  IF v_estado_reserva <> v_pendiente THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede confirmarse.';
  END IF;

  IF v_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Indica el tipo de contrato de la reserva antes de confirmarla.';
  END IF;

  IF p_id_tipo_contrato IS NOT NULL AND p_id_tipo_contrato <> v_tipo_contrato THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato no coincide con el registrado en la reserva.';
  END IF;

  -- Same family rule as documentCatalogue.anexoClaveForContrato.
  SET v_anexo = IF(LOWER(v_nombre_contrato) LIKE '%beca%', 'ANEXO_III', 'ANEXO_II');

  SELECT COUNT(*) INTO v_anexo_validado
    FROM dual_documentos
   WHERE id_reserva = p_id_reserva
     AND id_tipo_documento = fn_id_tipo_documento(v_anexo)
     AND es_actual = 1
     AND archivo IS NOT NULL
     AND id_estado_validacion = fn_id_estado_validacion('VALIDADO');

  IF v_anexo_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para confirmar la reserva el anexo del tipo de contrato debe estar firmado y validado.';
  END IF;

  SELECT id_solicitud_alumno INTO v_bloqueo_solicitud
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_solicitud_alumno
   FOR UPDATE;

  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CONFIRMADA'),
         motivo = NULL
   WHERE id_reserva = p_id_reserva;

  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
         id_tipo_contrato = NULL,
         motivo = 'Alumno asignado a otra empresa.'
   WHERE id_solicitud_alumno = v_solicitud_alumno
     AND id_reserva <> p_id_reserva
     AND id_estado_reserva = v_pendiente;

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
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_cancelada TINYINT UNSIGNED;
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

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');
  SET v_cancelada = fn_id_estado_reserva('CANCELADA');

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

  IF v_estado_origen = v_cancelada THEN
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
     AND id_estado_reserva IN (v_pendiente, v_confirmada);

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

  IF v_id_nueva IS NOT NULL AND v_estado_dest IN (v_pendiente, v_confirmada) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva activa con esa oferta.';
  END IF;

  IF v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles en la oferta de destino.';
  END IF;

  -- The cancelled origin keeps its tutor and documents as history.
  UPDATE dual_reservas
     SET id_estado_reserva = v_cancelada,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva_origen;

  IF v_id_nueva IS NULL THEN
    INSERT INTO dual_reservas (
      id_solicitud_alumno,
      id_solicitud_empresa_especialidad,
      id_estado_reserva,
      id_tipo_contrato,
      id_empresa_tutor,
      motivo
    ) VALUES (
      v_id_alumno,
      p_id_oferta_destino,
      v_pendiente,
      NULL,
      NULL,
      NULL
    );
    SET v_id_nueva = LAST_INSERT_ID();
  ELSE
    -- WF-4: a reactivated destination must not keep an earlier tutor or annex.
    UPDATE dual_reservas
       SET id_estado_reserva = v_pendiente,
           id_tipo_contrato = NULL,
           id_empresa_tutor = NULL,
           motivo = NULL
     WHERE id_reserva = v_id_nueva;

    UPDATE dual_documentos
       SET es_actual = 0
     WHERE id_reserva = v_id_nueva
       AND es_actual = 1;
  END IF;

  COMMIT;
  SELECT v_id_nueva AS id_reserva, p_id_reserva_origen AS id_reserva_origen;
END$$
DELIMITER ;

-- ─── triggers ──────────────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS `trg_dr_bu_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bu_reglas` BEFORE UPDATE ON `dual_reservas` FOR EACH ROW
BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_cancelada TINYINT UNSIGNED;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');
  SET v_cancelada = fn_id_estado_reserva('CANCELADA');

  IF NEW.id_solicitud_alumno <> OLD.id_solicitud_alumno
     OR NEW.id_solicitud_empresa_especialidad <> OLD.id_solicitud_empresa_especialidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cambiar el alumno ni la especialidad de una reserva existente.';
  END IF;

  IF OLD.id_estado_reserva = v_confirmada AND NEW.id_estado_reserva NOT IN (v_confirmada, v_cancelada) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada solo puede cancelarse de forma administrativa.';
  END IF;

  -- Staying CONFIRMADA (2→2) is allowed for column updates such as the tutor.
  IF NEW.id_estado_reserva = v_confirmada AND OLD.id_estado_reserva NOT IN (v_pendiente, v_confirmada) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede pasar a CONFIRMADA.';
  END IF;

  IF NEW.id_estado_reserva = v_confirmada AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva = v_cancelada AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada no puede tener tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva = v_cancelada AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;

  IF NEW.id_estado_reserva <> v_cancelada AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando una reserva es cancelada.';
  END IF;

  IF NEW.id_estado_reserva IN (v_pendiente, v_confirmada) AND OLD.id_estado_reserva = v_cancelada THEN
    SELECT cantidad_alumnos INTO v_cantidad
      FROM dual_solicitud_empresa_especialidades
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad;

    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (v_pendiente, v_confirmada)
       AND id_reserva <> OLD.id_reserva;

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para reactivar la reserva.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = v_confirmada
       AND id_reserva <> OLD.id_reserva;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dd_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dd_bi_reglas` BEFORE INSERT ON `dual_documentos` FOR EACH ROW
BEGIN
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

  -- Parent per type, as in documentCatalogue (ambito). OTRO may go anywhere.
  IF (v_tipo IN ('CV', 'ANEXO_DGA', 'ANEXO_2', 'FORMULARIO') AND NEW.id_solicitud_alumno IS NULL)
     OR (v_tipo IN ('CONVENIO', 'ANEXO_XIV', 'ANEXO_G', 'EXCEL') AND NEW.id_solicitud_empresa IS NULL)
     OR (v_tipo IN ('ANEXO_II', 'ANEXO_III', 'CALENDARIO', 'ANEXO_H') AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dd_bu_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dd_bu_reglas` BEFORE UPDATE ON `dual_documentos` FOR EACH ROW
BEGIN
  DECLARE v_tipo VARCHAR(40) DEFAULT NULL;
  DECLARE v_rechazado TINYINT UNSIGNED;

  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  SELECT nombre INTO v_tipo
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_tipo IN ('CV', 'ANEXO_DGA', 'ANEXO_2', 'FORMULARIO') AND NEW.id_solicitud_alumno IS NULL)
     OR (v_tipo IN ('CONVENIO', 'ANEXO_XIV', 'ANEXO_G', 'EXCEL') AND NEW.id_solicitud_empresa IS NULL)
     OR (v_tipo IN ('ANEXO_II', 'ANEXO_III', 'CALENDARIO', 'ANEXO_H') AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando un documento es rechazado.';
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

DROP TRIGGER IF EXISTS `trg_dse_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dse_bi_reglas` BEFORE INSERT ON `dual_solicitudes_empresa` FOR EACH ROW
BEGIN
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

  IF NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dse_bu_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dse_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_empresa` FOR EACH ROW
BEGIN
  DECLARE v_rechazado TINYINT UNSIGNED;
  DECLARE v_empresa_representante INT DEFAULT NULL;
  DECLARE v_empresa_coordinador INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_legal INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_trabajo INT DEFAULT NULL;

  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

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

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de empresa es rechazada.';
  END IF;
END$$
DELIMITER ;
