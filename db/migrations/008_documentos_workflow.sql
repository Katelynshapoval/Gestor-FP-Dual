-- 008_documentos_workflow.sql
-- Workflow state is separate from administrative review.
-- Legacy CV / ANEXO_2 / CONVENIO / ANEXO_H rows are kept.
-- New catalogue types are added by name. Active code must not depend on ids.

USE `proyecto_dual`;

INSERT IGNORE INTO `dual_tipos_documento` (`nombre`) VALUES
  ('ANEXO_DGA'),
  ('FORMULARIO'),
  ('ANEXO_XIV'),
  ('ANEXO_G'),
  ('ANEXO_II'),
  ('ANEXO_III'),
  ('CALENDARIO'),
  ('EXCEL');

ALTER TABLE `dual_documentos`
  ADD COLUMN `estado_workflow` varchar(30) NULL,
  ADD COLUMN `es_actual` tinyint(1) NOT NULL DEFAULT 1;

ALTER TABLE `dual_documentos`
  MODIFY `archivo` LONGBLOB NULL;

UPDATE `dual_documentos` d
  JOIN `dual_tipos_documento` td ON td.id_tipo_documento = d.id_tipo_documento
   SET d.estado_workflow = 'SUBIDO'
 WHERE d.archivo IS NOT NULL
   AND d.estado_workflow IS NULL;

CREATE TABLE IF NOT EXISTS `dual_documento_versiones` (
  `id_version` int NOT NULL AUTO_INCREMENT,
  `id_documento` int NOT NULL,
  `archivo` longblob,
  `id_estado_validacion` int DEFAULT NULL,
  `motivo` text,
  `estado_workflow` varchar(30) DEFAULT NULL,
  `archivado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_version`),
  KEY `ix_ddv_documento` (`id_documento`),
  CONSTRAINT `fk_dual_documento_versiones_doc`
    FOREIGN KEY (`id_documento`) REFERENCES `dual_documentos` (`id_documento`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_documento_firmas` (
  `id_firma` int NOT NULL AUTO_INCREMENT,
  `id_documento` int NOT NULL,
  `rol` varchar(20) NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'SIN_FIRMAR',
  `firmado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id_firma`),
  UNIQUE KEY `uq_dual_documento_firmas_doc_rol` (`id_documento`, `rol`),
  CONSTRAINT `fk_dual_documento_firmas_doc`
    FOREIGN KEY (`id_documento`) REFERENCES `dual_documentos` (`id_documento`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dual_documento_firmas_rol`
    CHECK (`rol` IN ('EMPRESA', 'GESTOR', 'ALUMNO')),
  CONSTRAINT `chk_dual_documento_firmas_estado`
    CHECK (`estado` IN ('SIN_FIRMAR', 'FIRMADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Re-upload archives the previous blob, then replaces the active row.
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
      (id_documento, archivo, id_estado_validacion, motivo, estado_workflow)
    SELECT id_documento, archivo, id_estado_validacion, motivo, estado_workflow
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
      (id_solicitud_alumno, id_solicitud_empresa, id_reserva, id_tipo_documento, archivo, id_estado_validacion, estado_workflow, es_actual)
    VALUES (
      p_id_solicitud_alumno, p_id_solicitud_empresa, p_id_reserva,
      p_id_tipo_documento, p_archivo,
      (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1),
      'SUBIDO',
      1
    );
    SELECT LAST_INSERT_ID() AS id_documento;
  END IF;
END$$
DELIMITER ;

-- A pending reservation may already record the contract type so Anexo II or III can appear.
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
