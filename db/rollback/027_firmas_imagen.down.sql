-- 027_firmas_imagen.down.sql — undoes 027_firmas_imagen.sql
--
-- Guard: stops, changing nothing, while any document has been signed with an
-- image (metodo FIRMA_IMAGEN): those PDFs carry the stamped signature and the
-- previous backend does not know the method. Restore the backup taken before
-- 027 instead.
--
-- Saved signatures that never signed anything and unfinished phone sessions
-- are deleted with their tables. FIRMA audit events are append-only: they stay
-- in dual_eventos only if none exists (otherwise the old CHECK cannot be put
-- back and the script stops).
--
-- Deploy the backend without image signatures first.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '027';

DROP PROCEDURE IF EXISTS `sp_027_down_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_027_down_comprobar`()
BEGIN
  IF EXISTS (SELECT 1 FROM dual_documento_firmas
              WHERE metodo = 'FIRMA_IMAGEN' OR id_firma_imagen IS NOT NULL OR id_firma_tutor IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay documentos firmados con imagen: 027 no se puede deshacer (restaura la copia previa).';
  END IF;
  IF EXISTS (SELECT 1 FROM dual_eventos WHERE entidad = 'FIRMA') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay eventos de firmas guardadas en la auditoría: 027 no se puede deshacer (restaura la copia previa).';
  END IF;
END$$
DELIMITER ;

CALL `sp_027_down_comprobar`();
DROP PROCEDURE IF EXISTS `sp_027_down_comprobar`;

UPDATE `dual_tipos_documento` SET `firma_centro` = 0 WHERE `nombre` = 'CONVENIO' AND `es_sistema` = 1;

ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;
ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO', 'CORREO',
     'TIPO_DOCUMENTO'));

ALTER TABLE `dual_documento_firmas` DROP CHECK `chk_ddf_metodo`;
ALTER TABLE `dual_documento_firmas`
  ADD CONSTRAINT `chk_ddf_metodo` CHECK (`metodo` IS NULL OR `metodo` IN ('CONFIRMACION_APP', 'SUBIDA_FIRMADA'));

ALTER TABLE `dual_documento_firmas`
  DROP FOREIGN KEY `fk_ddf_firma_imagen`,
  DROP FOREIGN KEY `fk_ddf_firma_tutor`,
  DROP KEY `ix_ddf_firma_imagen`,
  DROP KEY `ix_ddf_firma_tutor`,
  DROP COLUMN `id_firma_imagen`,
  DROP COLUMN `id_firma_tutor`;

ALTER TABLE `dual_documentos` DROP COLUMN `firma_posiciones`;

DROP TABLE IF EXISTS `dual_firma_sesiones`;
DROP TABLE IF EXISTS `dual_firmas`;

-- Check afterwards (expected: 0 rows each):
--   SHOW TABLES LIKE 'dual_firmas';
--   SHOW COLUMNS FROM dual_documentos LIKE 'firma_posiciones';
