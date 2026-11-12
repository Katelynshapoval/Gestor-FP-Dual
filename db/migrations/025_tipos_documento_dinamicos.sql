-- 025_tipos_documento_dinamicos.sql
-- Document types the centre can add (docs/PLAN_DOCUMENTOS_DINAMICOS.md, part A).
--
-- dual_tipos_documento gets the rules the code kept in documentCatalogue.js:
--   nombre_mostrar   name shown in the app
--   ambito           solicitud_alumno | solicitud_empresa | reserva (NULL: OTRO, anywhere)
--   generado         made from the active .docx template of the type
--   firma_empresa / firma_centro / firma_alumno   who signs
--   requerido        blocks validating the student / the company, or confirming the reservation
--   familia_contrato reservation only: NULL = every reservation, 'beca' or 'contrato'
--   activo           offered on new requests (types are never deleted: old documents keep them)
--   es_sistema       the 13 existing types: their rules stay in the code, only the template changes
--   orden            order in the lists
--
-- The 13 existing rows get exactly what documentCatalogue says today, so
-- nothing changes for them. A type added by the centre must be generated from
-- a template (chk_tipos_documento_generado).
--
-- The parent triggers of dual_documentos (012) listed type names by hand; they
-- now read `ambito`, so a new type is accepted only on its own parent.
--
-- dual_eventos accepts TIPO_DOCUMENTO (creating, editing and switching a type
-- off are audited).
--
-- Additive: no existing row or document is changed. Rollback:
-- db/rollback/025_tipos_documento_dinamicos.down.sql.

ALTER TABLE `dual_tipos_documento`
  ADD COLUMN `nombre_mostrar` VARCHAR(80) NULL AFTER `nombre`,
  ADD COLUMN `ambito` VARCHAR(20) NULL AFTER `nombre_mostrar`,
  ADD COLUMN `generado` TINYINT(1) NOT NULL DEFAULT 0 AFTER `ambito`,
  ADD COLUMN `firma_empresa` TINYINT(1) NOT NULL DEFAULT 0 AFTER `generado`,
  ADD COLUMN `firma_centro` TINYINT(1) NOT NULL DEFAULT 0 AFTER `firma_empresa`,
  ADD COLUMN `firma_alumno` TINYINT(1) NOT NULL DEFAULT 0 AFTER `firma_centro`,
  ADD COLUMN `requerido` TINYINT(1) NOT NULL DEFAULT 0 AFTER `firma_alumno`,
  ADD COLUMN `familia_contrato` VARCHAR(10) NULL AFTER `requerido`,
  ADD COLUMN `activo` TINYINT(1) NOT NULL DEFAULT 1 AFTER `familia_contrato`,
  ADD COLUMN `es_sistema` TINYINT(1) NOT NULL DEFAULT 0 AFTER `activo`,
  ADD COLUMN `orden` SMALLINT NOT NULL DEFAULT 100 AFTER `es_sistema`,
  ADD COLUMN `creado_en` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `orden`;

-- The existing types, as documentCatalogue.js describes them.
UPDATE `dual_tipos_documento` td
  JOIN (
    SELECT 'CV' AS nombre, 'CV' AS nm, 'solicitud_alumno' AS amb, 0 AS gen, 0 AS fe, 0 AS fc, 0 AS fa, 1 AS req, NULL AS fam, 1 AS act, 10 AS ord
    UNION ALL SELECT 'ANEXO_DGA',  'Anexo DGA',           'solicitud_alumno',  0, 0, 0, 0, 1, NULL,       1, 20
    UNION ALL SELECT 'FORMULARIO', 'Formulario',          'solicitud_alumno',  0, 0, 0, 0, 0, NULL,       0, 900
    UNION ALL SELECT 'ANEXO_2',    'Anexo 2 (histórico)', 'solicitud_alumno',  0, 0, 0, 0, 0, NULL,       0, 910
    UNION ALL SELECT 'CONVENIO',   'Convenio',            'solicitud_empresa', 1, 1, 0, 0, 1, NULL,       1, 30
    UNION ALL SELECT 'ANEXO_XIV',  'Anexo XIV',           'solicitud_empresa', 0, 0, 0, 0, 0, NULL,       1, 40
    UNION ALL SELECT 'ANEXO_G',    'Anexo G',             'solicitud_empresa', 0, 0, 0, 0, 0, NULL,       1, 50
    UNION ALL SELECT 'EXCEL',      'Excel',               'solicitud_empresa', 0, 0, 0, 0, 0, NULL,       1, 60
    UNION ALL SELECT 'ANEXO_II',   'Anexo II',            'reserva',           1, 1, 1, 1, 1, 'contrato', 1, 70
    UNION ALL SELECT 'ANEXO_III',  'Anexo III',           'reserva',           1, 1, 1, 1, 1, 'beca',     1, 80
    UNION ALL SELECT 'CALENDARIO', 'Calendario',          'reserva',           0, 1, 1, 1, 0, NULL,       1, 90
    UNION ALL SELECT 'ANEXO_H',    'Anexo H (histórico)', 'reserva',           0, 0, 0, 0, 0, NULL,       0, 920
    UNION ALL SELECT 'OTRO',       'Otro',                NULL,                0, 0, 0, 0, 0, NULL,       0, 930
  ) s ON s.nombre = td.nombre
   SET td.nombre_mostrar = s.nm,
       td.ambito = s.amb,
       td.generado = s.gen,
       td.firma_empresa = s.fe,
       td.firma_centro = s.fc,
       td.firma_alumno = s.fa,
       td.requerido = s.req,
       td.familia_contrato = s.fam,
       td.activo = s.act,
       td.es_sistema = 1,
       td.orden = s.ord;

-- A row the list above did not know (none on a clean install) keeps its own
-- name as the visible one and stays a system type with no parent rule.
UPDATE `dual_tipos_documento`
   SET `nombre_mostrar` = `nombre`, `es_sistema` = 1, `activo` = 0
 WHERE `nombre_mostrar` IS NULL;

ALTER TABLE `dual_tipos_documento`
  MODIFY COLUMN `nombre_mostrar` VARCHAR(80) NOT NULL,
  ADD UNIQUE KEY `uq_dual_tipos_documento_nombre_mostrar` (`nombre_mostrar`),
  ADD CONSTRAINT `chk_tipos_documento_ambito`
    CHECK (`ambito` IS NULL OR `ambito` IN ('solicitud_alumno', 'solicitud_empresa', 'reserva')),
  ADD CONSTRAINT `chk_tipos_documento_familia`
    CHECK (`familia_contrato` IS NULL OR (`familia_contrato` IN ('beca', 'contrato') AND `ambito` = 'reserva')),
  ADD CONSTRAINT `chk_tipos_documento_generado`
    CHECK (`es_sistema` = 1 OR (`generado` = 1 AND `ambito` IS NOT NULL)),
  ADD CONSTRAINT `chk_tipos_documento_firmas`
    CHECK ((`firma_alumno` = 0 OR `ambito` IN ('solicitud_alumno', 'reserva'))
       AND (`firma_empresa` = 0 OR `ambito` IN ('solicitud_empresa', 'reserva')));

-- Parent per type, read from `ambito` (OTRO, ambito NULL, may go anywhere).
DROP TRIGGER IF EXISTS `trg_dd_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dd_bi_reglas` BEFORE INSERT ON `dual_documentos` FOR EACH ROW
BEGIN
  DECLARE v_ambito VARCHAR(20) DEFAULT NULL;

  SELECT ambito INTO v_ambito
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_ambito = 'solicitud_alumno' AND NEW.id_solicitud_alumno IS NULL)
     OR (v_ambito = 'solicitud_empresa' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_ambito = 'reserva' AND NEW.id_reserva IS NULL) THEN
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
  DECLARE v_ambito VARCHAR(20) DEFAULT NULL;
  DECLARE v_rechazado TINYINT UNSIGNED;

  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  SELECT ambito INTO v_ambito
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_ambito = 'solicitud_alumno' AND NEW.id_solicitud_alumno IS NULL)
     OR (v_ambito = 'solicitud_empresa' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_ambito = 'reserva' AND NEW.id_reserva IS NULL) THEN
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

-- Audit: creating, editing and switching off document types.
ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;

ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO', 'CORREO',
     'TIPO_DOCUMENTO'));

-- Check after applying (expected: 13 rows, 13 system types, 9 active, 3 generated):
--   SELECT COUNT(*), SUM(es_sistema), SUM(activo), SUM(generado) FROM dual_tipos_documento;
