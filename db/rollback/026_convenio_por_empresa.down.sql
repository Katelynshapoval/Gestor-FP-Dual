-- 026_convenio_por_empresa.down.sql — undoes 026_convenio_por_empresa.sql
--
-- Guard: stops, changing nothing, while any convenio renewal or inherited
-- convenio exists, or while one of the two new emails has been edited
-- (version > 1): the previous backend knows none of them. Restore the backup
-- taken before 026 instead.
--
-- Deploy the backend without one-convenio-per-company first.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '026';

DROP PROCEDURE IF EXISTS `sp_026_down_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_026_down_comprobar`()
BEGIN
  IF EXISTS (SELECT 1 FROM dual_convenio_renovaciones) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay renovaciones de convenio: 026 no se puede deshacer (restaura la copia previa).';
  END IF;
  IF EXISTS (SELECT 1 FROM dual_documentos WHERE origen_documento = 'HEREDADO' OR id_documento_origen IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay convenios heredados: 026 no se puede deshacer (restaura la copia previa).';
  END IF;
  IF EXISTS (SELECT 1 FROM dual_correo_plantillas
              WHERE clave IN ('convenio_renovar_empresa', 'convenio_renovar_centro') AND version > 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Los correos de renovación de convenio se han editado: 026 no se puede deshacer (restaura la copia previa).';
  END IF;
END$$
DELIMITER ;

CALL `sp_026_down_comprobar`();
DROP PROCEDURE IF EXISTS `sp_026_down_comprobar`;

-- solicitud_empresa_recibida back to the text of 023 if 026 changed it and
-- nobody edited it afterwards.
SET @recibida_023 = 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\n{{#convenio_adjunto}}Adjuntamos el convenio generado. La firma y la validación se registran en el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}{{#convenio_generado}}El convenio ya está disponible en el portal para descargarlo y firmarlo.{{/convenio_generado}}{{^convenio_generado}}El convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.{{/convenio_generado}}{{/convenio_adjunto}}\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.';
SET @recibida_026 = 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\n{{#convenio_vigente}}Vuestro convenio sigue vigente: cubre los mismos ciclos, así que no hace falta firmar uno nuevo.{{/convenio_vigente}}{{^convenio_vigente}}{{#convenio_adjunto}}Adjuntamos el convenio generado. La firma y la validación se registran en el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}{{#convenio_generado}}El convenio ya está disponible en el portal para descargarlo y firmarlo.{{/convenio_generado}}{{^convenio_generado}}El convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.{{/convenio_generado}}{{/convenio_adjunto}}{{/convenio_vigente}}\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.';

UPDATE `dual_correo_plantillas`
   SET `cuerpo` = @recibida_023
 WHERE `clave` = 'solicitud_empresa_recibida' AND `version` = 1 AND `cuerpo` COLLATE utf8mb4_bin = @recibida_026 COLLATE utf8mb4_bin;
UPDATE `dual_correo_plantillas_historial`
   SET `cuerpo` = @recibida_023
 WHERE `clave_plantilla` = 'solicitud_empresa_recibida' AND `version` = 1 AND `cuerpo` COLLATE utf8mb4_bin = @recibida_026 COLLATE utf8mb4_bin;

DELETE FROM `dual_correo_variables` WHERE `clave_plantilla` = 'solicitud_empresa_recibida' AND `variable` = 'convenio_vigente';
DELETE FROM `dual_correo_plantillas_historial` WHERE `clave_plantilla` IN ('convenio_renovar_empresa', 'convenio_renovar_centro');
-- Variables and attachments of the two emails go with them (ON DELETE CASCADE).
DELETE FROM `dual_correo_plantillas` WHERE `clave` IN ('convenio_renovar_empresa', 'convenio_renovar_centro');

DROP TABLE IF EXISTS `dual_convenio_renovaciones`;

ALTER TABLE `dual_documentos` DROP CHECK `chk_documentos_heredado`;
ALTER TABLE `dual_documentos` DROP CHECK `chk_documentos_origen`;
ALTER TABLE `dual_documentos`
  ADD CONSTRAINT `chk_documentos_origen` CHECK (`origen_documento` IN ('SUBIDA', 'GENERADO', 'LEGACY'));
ALTER TABLE `dual_documentos`
  DROP FOREIGN KEY `fk_documentos_origen`,
  DROP KEY `ix_documentos_origen`,
  DROP COLUMN `id_documento_origen`;

-- Check afterwards (expected: 22 templates, 117 variables):
--   SELECT COUNT(*) FROM dual_correo_plantillas;
--   SELECT COUNT(*) FROM dual_correo_variables;
