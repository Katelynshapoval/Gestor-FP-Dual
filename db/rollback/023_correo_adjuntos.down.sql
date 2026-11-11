-- 023_correo_adjuntos.down.sql — undoes 023_correo_adjuntos.sql
--
-- Guard: stops, changing nothing, when going back would lose an
-- administrator's work:
--   * an uploaded PDF (dual_correo_adjuntos tipo ARCHIVO), or
--   * an edit of the merged emails (solicitud_empresa_recibida or
--     convenio_disponible above version 1): their text uses the variables
--     convenio_adjunto / convenio_generado, which 022 does not have.
-- Export first and decide with the team:
--   SELECT clave_plantilla, nombre_archivo FROM dual_correo_adjuntos WHERE tipo = 'ARCHIVO';
--   SELECT clave, version, asunto, cuerpo FROM dual_correo_plantillas
--    WHERE clave IN ('solicitud_empresa_recibida', 'convenio_disponible');
--
-- Restores the four emails of 022 with their original text (version 1) and
-- removes the attachment switch, its history columns and dual_correo_adjuntos.
-- Only with the backend of 022 (convenio attached by the code).
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '023';

DROP PROCEDURE IF EXISTS `sp_023_down_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_023_down_comprobar`()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_correo_adjuntos') THEN
    IF EXISTS (SELECT 1 FROM dual_correo_adjuntos WHERE tipo = 'ARCHIVO') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hay PDF subidos como adjuntos de correos: no se puede deshacer 023 sin perderlos.';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM dual_correo_plantillas
              WHERE clave IN ('solicitud_empresa_recibida', 'convenio_disponible') AND version > 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Los correos fusionados por 023 se han editado: no se puede deshacer 023 sin perder esos textos.';
  END IF;
END$$
DELIMITER ;

CALL `sp_023_down_comprobar`();
DROP PROCEDURE IF EXISTS `sp_023_down_comprobar`;

-- The two emails of 022 that 023 merged away (texts of 022, version 1).
INSERT INTO `dual_correo_plantillas`
  (`clave`, `grupo`, `nombre`, `destinatario`, `cuando`, `orden`, `asunto`, `cuerpo`, `activa`, `desactivable`)
VALUES
  ('solicitud_empresa_recibida_convenio', 'SOLICITUD_EMPRESA', 'Solicitud recibida (con convenio adjunto)', 'Empresa (coordinador)', 'Al enviar o volver a presentar la solicitud de empresa, cuando el convenio se ha generado: el PDF va adjunto.', 70, 'Solicitud Dual Empresa recibida', 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\nAdjuntamos el convenio generado. La firma y la validación se registran en el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('convenio_disponible_adjunto', 'SOLICITUD_EMPRESA', 'Convenio disponible (PDF adjunto)', 'Empresa (coordinador)', 'Cuando el centro genera o regenera el convenio y el PDF va adjunto.', 90, 'Tu convenio está disponible', 'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\nLo adjuntamos a este correo. Descargadlo, firmadlo y subidlo firmado desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1)
AS nueva ON DUPLICATE KEY UPDATE `clave` = nueva.`clave`;

INSERT IGNORE INTO `dual_correo_variables`
  (`clave_plantilla`, `variable`, `tipo`, `etiqueta`, `descripcion`, `ejemplo`, `fragmento`, `opcional`, `obligatoria`, `orden`)
SELECT n.`clave`, v.`variable`, v.`tipo`, v.`etiqueta`, v.`descripcion`, v.`ejemplo`, v.`fragmento`, v.`opcional`, v.`obligatoria`, v.`orden`
  FROM (SELECT 'solicitud_empresa_recibida_convenio' AS `clave`, 'solicitud_empresa_recibida' AS `origen`
        UNION ALL SELECT 'convenio_disponible_adjunto', 'convenio_disponible') n
  JOIN `dual_correo_variables` v
    ON v.`clave_plantilla` = n.`origen` AND v.`variable` NOT IN ('convenio_adjunto', 'convenio_generado');

INSERT IGNORE INTO `dual_correo_plantillas_historial` (`clave_plantilla`, `version`, `asunto`, `cuerpo`, `activa`)
SELECT p.`clave`, 1, p.`asunto`, p.`cuerpo`, 1
  FROM `dual_correo_plantillas` p
 WHERE p.`clave` IN ('solicitud_empresa_recibida_convenio', 'convenio_disponible_adjunto');

-- The kept emails back to their 022 name and text (they are at version 1).
UPDATE `dual_correo_plantillas` p
  JOIN (SELECT 'solicitud_empresa_recibida' AS `clave`,
               'Solicitud recibida (sin convenio)' AS `nombre`,
               'Al enviar o volver a presentar la solicitud de empresa, cuando el convenio aún no se ha podido generar.' AS `cuando`,
               'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\nEl convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.' AS `cuerpo`
        UNION ALL
        SELECT 'convenio_disponible',
               'Convenio disponible (sin adjunto)',
               'Cuando el centro genera el convenio pero el PDF no se puede adjuntar.',
               'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\nDescargadlo desde el portal, firmadlo y subidlo firmado.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.') o
    ON o.`clave` = p.`clave`
   SET p.`nombre` = o.`nombre`, p.`cuando` = o.`cuando`, p.`cuerpo` = o.`cuerpo`;

UPDATE `dual_correo_plantillas_historial` h
  JOIN `dual_correo_plantillas` p ON p.`clave` = h.`clave_plantilla` AND h.`version` = 1
   SET h.`cuerpo` = p.`cuerpo`
 WHERE h.`clave_plantilla` IN ('solicitud_empresa_recibida', 'convenio_disponible');

DELETE FROM `dual_correo_variables`
 WHERE `clave_plantilla` IN ('solicitud_empresa_recibida', 'convenio_disponible')
   AND `variable` IN ('convenio_adjunto', 'convenio_generado');

DROP TABLE IF EXISTS `dual_correo_adjuntos`;

DROP PROCEDURE IF EXISTS `sp_023_down_columnas`;
DELIMITER $$
CREATE PROCEDURE `sp_023_down_columnas`()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_correo_plantillas'
                AND COLUMN_NAME = 'lleva_adjuntos') THEN
    ALTER TABLE `dual_correo_plantillas`
      DROP CHECK `chk_dcp_lleva_adjuntos`,
      DROP COLUMN `lleva_adjuntos`;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_correo_plantillas_historial'
                AND COLUMN_NAME = 'lleva_adjuntos') THEN
    ALTER TABLE `dual_correo_plantillas_historial`
      DROP COLUMN `adjuntos`,
      DROP COLUMN `lleva_adjuntos`;
  END IF;
END$$
DELIMITER ;

CALL `sp_023_down_columnas`();
DROP PROCEDURE IF EXISTS `sp_023_down_columnas`;

-- Check afterwards (expected: 24 and 110):
--   SELECT COUNT(*) FROM dual_correo_plantillas;
--   SELECT COUNT(*) FROM dual_correo_variables;
