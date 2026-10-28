-- Rollback of 018_reservas_por_intento_y_transacciones.sql
--
-- READ BEFORE RUNNING. This rollback is only possible while the data still fits
-- the pre-018 model. It STOPS, changing nothing, when:
--   * a student/offer pair has more than one reservation row (a booking after a
--     cancellation under 018): the old unique key (alumno, oferta) cannot be
--     restored without deleting or merging valid historical attempts;
--   * dual_eventos has OFERTA or TUTOR events: the audit trail is append-only
--     (its triggers refuse UPDATE and DELETE), so the narrower CHECK cannot be
--     re-added;
--   * an audit state is longer than 30 characters.
-- In those cases the only way back is restoring the backup taken before 018
-- (losing every change made since) — there is no safe partial rollback.
--
-- Data that is LOST by a successful rollback:
--   * dual_reservas.id_reserva_origen (reassignment links). The audit trail keeps
--     them (REASIGNAR events, detalle.id_reserva_destino). Export first:
--     SELECT id_reserva, id_reserva_origen FROM dual_reservas WHERE id_reserva_origen IS NOT NULL;
-- Data that STAYS but the old rules would not have produced: cancelled rows with
-- a contract type (D5). The old procedures only clear it when a row is reactivated.
--
-- Order: deploy the previous backend FIRST (the Stage 2 backend runs the
-- procedures with autocommit = 0 and would commit nothing with the old
-- procedures' own transactions mixed in), then run this file, then
-- DELETE FROM schema_migrations WHERE version = '018';
--
-- Restores the reservation procedures and trg_dr_bu_reglas as migration 012
-- created them, trg_dr_bi_reglas and trg_dsee_bu_cupo as in 017.

DROP PROCEDURE IF EXISTS `sp_018_comprobar_rollback`;
DELIMITER $$
CREATE PROCEDURE `sp_018_comprobar_rollback`()
BEGIN
  DECLARE v_n INT DEFAULT 0;

  SELECT COUNT(*) INTO v_n
    FROM (SELECT 1 FROM dual_reservas
           GROUP BY id_solicitud_alumno, id_solicitud_empresa_especialidad
          HAVING COUNT(*) > 1) x;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '018 rollback: hay varios intentos de reserva por alumno/oferta. Restaura la copia de seguridad. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n FROM dual_eventos WHERE entidad IN ('OFERTA', 'TUTOR');
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '018 rollback: hay eventos OFERTA/TUTOR (no se pueden borrar). Restaura la copia de seguridad. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n FROM dual_eventos
   WHERE CHAR_LENGTH(estado_anterior) > 30 OR CHAR_LENGTH(estado_nuevo) > 30;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '018 rollback: hay estados de auditoría de más de 30 caracteres. Restaura la copia de seguridad. No se ha cambiado nada.';
  END IF;
END$$
DELIMITER ;

CALL `sp_018_comprobar_rollback`();
DROP PROCEDURE IF EXISTS `sp_018_comprobar_rollback`;

-- Indexes are rebuilt in their original order (013) so the table definition is
-- identical to the pre-018 one; the FK needs its index, so it is re-created too.
-- No row of the append-only audit trail is touched.
ALTER TABLE `dual_eventos`
  DROP FOREIGN KEY `fk_de_usuario`,
  DROP CHECK `chk_de_entidad`;
ALTER TABLE `dual_eventos`
  DROP INDEX `ix_de_usuario`,
  DROP INDEX `ix_de_creado`,
  DROP INDEX `ix_de_entidad_fecha`,
  MODIFY COLUMN `estado_anterior` varchar(30) DEFAULT NULL,
  MODIFY COLUMN `estado_nuevo` varchar(30) DEFAULT NULL;
ALTER TABLE `dual_eventos`
  ADD KEY `ix_de_entidad` (`entidad`, `id_entidad`),
  ADD KEY `ix_de_usuario` (`id_usuario`),
  ADD KEY `ix_de_creado` (`creado_en`),
  ADD CONSTRAINT `fk_de_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO'));

-- Old procedures (migration 012), with their own transactions.
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


-- trg_dr_bu_reglas as in 012.
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


-- trg_dr_bi_reglas and trg_dsee_bu_cupo as in 017.
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


ALTER TABLE `dual_reservas`
  ADD UNIQUE KEY `uq_dual_reservas_alumno_oferta` (`id_solicitud_alumno`, `id_solicitud_empresa_especialidad`),
  DROP INDEX `uq_dr_par_activo`,
  DROP COLUMN `id_alumno_activo`,
  DROP FOREIGN KEY `fk_dr_reserva_origen`;
ALTER TABLE `dual_reservas`
  DROP INDEX `uq_dr_reserva_origen`,
  DROP COLUMN `id_reserva_origen`,
  DROP INDEX `ix_dr_solicitud_alumno`;
