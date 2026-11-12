-- 025_tipos_documento_dinamicos.down.sql — undoes 025_tipos_documento_dinamicos.sql
--
-- Guard: stops, changing nothing, while a document type added by the centre
-- exists (es_sistema = 0) or any TIPO_DOCUMENTO audit event exists: the
-- previous backend knows neither, and the documents of those types would lose
-- their rules. Undo them by restoring the backup taken before 025.
--
-- Deploy the backend without dynamic document types first.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '025';

DROP PROCEDURE IF EXISTS `sp_025_down_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_025_down_comprobar`()
BEGIN
  IF EXISTS (SELECT 1 FROM dual_tipos_documento WHERE es_sistema = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay tipos de documento creados por el centro: 025 no se puede deshacer (restaura la copia previa).';
  END IF;
  IF EXISTS (SELECT 1 FROM dual_eventos WHERE entidad = 'TIPO_DOCUMENTO') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay eventos TIPO_DOCUMENTO: 025 no se puede deshacer (restaura la copia previa).';
  END IF;
END$$
DELIMITER ;

CALL `sp_025_down_comprobar`();
DROP PROCEDURE IF EXISTS `sp_025_down_comprobar`;

ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;
ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO', 'CORREO'));

-- The triggers of 012, with the type names by hand.
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

ALTER TABLE `dual_tipos_documento`
  DROP CHECK `chk_tipos_documento_ambito`,
  DROP CHECK `chk_tipos_documento_familia`,
  DROP CHECK `chk_tipos_documento_generado`,
  DROP CHECK `chk_tipos_documento_firmas`,
  DROP INDEX `uq_dual_tipos_documento_nombre_mostrar`,
  DROP COLUMN `nombre_mostrar`,
  DROP COLUMN `ambito`,
  DROP COLUMN `generado`,
  DROP COLUMN `firma_empresa`,
  DROP COLUMN `firma_centro`,
  DROP COLUMN `firma_alumno`,
  DROP COLUMN `requerido`,
  DROP COLUMN `familia_contrato`,
  DROP COLUMN `activo`,
  DROP COLUMN `es_sistema`,
  DROP COLUMN `orden`,
  DROP COLUMN `creado_en`;

-- Check afterwards (expected: the 2 columns id_tipo_documento, nombre):
--   SHOW COLUMNS FROM dual_tipos_documento;
