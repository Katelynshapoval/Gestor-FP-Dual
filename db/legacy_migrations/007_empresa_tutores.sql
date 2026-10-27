-- 007_empresa_tutores.sql
-- N company tutors per empresa; assignment lives on dual_reservas.
-- id_coordinador_empresa remains the principal coordinator / account contact.
-- Existing coordinators are backfilled as tutors; existing reservations inherit
-- the tutor matching that solicitud's coordinator when possible.

USE `proyecto_dual`;

CREATE TABLE IF NOT EXISTS `dual_empresa_tutores` (
  `id_empresa_tutor` int NOT NULL AUTO_INCREMENT,
  `id_empresa` int NOT NULL,
  `id_contacto` int NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_empresa_tutor`),
  UNIQUE KEY `uq_dual_empresa_tutores_empresa_contacto` (`id_empresa`, `id_contacto`),
  KEY `ix_dual_empresa_tutores_empresa` (`id_empresa`),
  KEY `ix_dual_empresa_tutores_contacto` (`id_contacto`),
  KEY `ix_dual_empresa_tutores_activo` (`activo`),
  CONSTRAINT `fk_dual_empresa_tutores_empresa`
    FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dual_empresa_tutores_contacto`
    FOREIGN KEY (`id_contacto`) REFERENCES `ge_contactos` (`idcontacto`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dual_empresa_tutores_activo` CHECK (`activo` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Nullable FK: a reservation may temporarily have no company tutor.
ALTER TABLE `dual_reservas`
  ADD COLUMN `id_empresa_tutor` int DEFAULT NULL AFTER `id_tipo_contrato`,
  ADD KEY `ix_dr_empresa_tutor` (`id_empresa_tutor`),
  ADD CONSTRAINT `fk_dr_empresa_tutor`
    FOREIGN KEY (`id_empresa_tutor`) REFERENCES `dual_empresa_tutores` (`id_empresa_tutor`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Backfill: register distinct coordinator contacts as company tutors.
INSERT INTO `dual_empresa_tutores` (`id_empresa`, `id_contacto`, `activo`)
SELECT DISTINCT se.`id_empresa`, se.`id_coordinador_empresa`, 1
  FROM `dual_solicitudes_empresa` se
 WHERE se.`id_empresa` IS NOT NULL
   AND se.`id_coordinador_empresa` IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM `dual_empresa_tutores` t
      WHERE t.`id_empresa` = se.`id_empresa`
        AND t.`id_contacto` = se.`id_coordinador_empresa`
   );

-- Allow non-state updates on CONFIRMADA rows (e.g. assign id_empresa_tutor).
-- Previous rule treated 2→2 as an illegal transition to CONFIRMADA.
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

  -- Only block transitions INTO confirmada from a non-pendiente state.
  -- Staying confirmada (2→2) must be allowed for column updates like tutor.
  IF NEW.id_estado_reserva = 2 AND OLD.id_estado_reserva NOT IN (1, 2) THEN
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

-- Backfill reservations with the tutor matching that solicitud's coordinator.
UPDATE `dual_reservas` r
  JOIN `dual_solicitud_empresa_especialidades` ee
    ON ee.`id_solicitud_empresa_especialidad` = r.`id_solicitud_empresa_especialidad`
  JOIN `dual_solicitudes_empresa` se
    ON se.`id_solicitud_empresa` = ee.`id_solicitud_empresa`
  JOIN `dual_empresa_tutores` t
    ON t.`id_empresa` = se.`id_empresa`
   AND t.`id_contacto` = se.`id_coordinador_empresa`
   SET r.`id_empresa_tutor` = t.`id_empresa_tutor`
 WHERE r.`id_empresa_tutor` IS NULL;

-- Reassignment must not carry the previous company's tutor to the new offer.
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
  -- Historical tutor on the cancelled origin row is preserved.
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
      id_empresa_tutor,
      motivo
    ) VALUES (
      v_id_alumno,
      p_id_oferta_destino,
      1,
      NULL,
      NULL,
      NULL
    );
    SET v_id_nueva = LAST_INSERT_ID();
  ELSE
    -- Reactivated destination must not keep a previous tutor assignment.
    UPDATE dual_reservas
       SET id_estado_reserva = 1,
           id_tipo_contrato = NULL,
           id_empresa_tutor = NULL,
           motivo = NULL
     WHERE id_reserva = v_id_nueva;
  END IF;

  COMMIT;
  SELECT v_id_nueva AS id_reserva, p_id_reserva_origen AS id_reserva_origen;
END$$
DELIMITER ;
