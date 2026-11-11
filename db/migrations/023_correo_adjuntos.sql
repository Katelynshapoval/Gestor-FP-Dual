-- 023_correo_adjuntos.sql
-- Email attachments move from the code into the database, next to the texts
-- of 022, so administrators decide whether each email carries attachments and
-- which ones.
--
-- 1. dual_correo_plantillas.lleva_adjuntos: the administrator's switch. 0 = the
--    email goes without attachments even if some are configured.
-- 2. dual_correo_adjuntos: the attachments of each email. Two kinds:
--      DOCUMENTO  a document the application generates for that request
--                 (today only CONVENIO). The row says WHICH document; the PDF
--                 is produced when the email is sent. Which documents each
--                 email can carry is fixed by the code (the request must have
--                 one), as with the variables.
--      ARCHIVO    a fixed PDF uploaded by an administrator (for example an
--                 information leaflet), stored here and sent as it is.
-- 3. dual_correo_plantillas_historial.lleva_adjuntos / adjuntos: each version
--    also records the switch and the list of attachments (names, for display).
--    Adding or removing an attachment is a new version, like a text edit.
-- 4. The two pairs of emails that only existed because the attachment was
--    decided in the code become one email each:
--      solicitud_empresa_recibida_convenio  → solicitud_empresa_recibida
--      convenio_disponible_adjunto          → convenio_disponible
--    The kept email gets the variables `convenio_adjunto` («sí» when the PDF
--    really went attached) and, for the application, `convenio_generado`, and
--    carries CONVENIO as its attachment, so the company receives exactly what
--    it received before 023.
--    Texts: when neither email of a pair was edited (version 1), version 1 of
--    the kept email becomes the merged text below (it is still the original).
--    When either was edited, both edited texts are kept, joined in
--    {{#convenio_adjunto}} / {{^convenio_adjunto}} blocks, as a new version.
--    The kept email keeps its own `activa`. The removed emails and their
--    history are deleted (their text lives on inside the merged one).
--
-- Idempotent: every step checks whether it already ran.
-- Deploy together with the backend that reads lleva_adjuntos and
-- dual_correo_adjuntos; the backend of 022 would no longer find the removed
-- emails and would send the convenio emails without the PDF.

-- ── 1–3. Schema ──────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS `sp_023_columnas`;
DELIMITER $$
CREATE PROCEDURE `sp_023_columnas`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_correo_plantillas'
                    AND COLUMN_NAME = 'lleva_adjuntos') THEN
    ALTER TABLE `dual_correo_plantillas`
      ADD COLUMN `lleva_adjuntos` tinyint(1) NOT NULL DEFAULT '0' AFTER `activa`,
      ADD CONSTRAINT `chk_dcp_lleva_adjuntos` CHECK (`lleva_adjuntos` IN (0, 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_correo_plantillas_historial'
                    AND COLUMN_NAME = 'lleva_adjuntos') THEN
    ALTER TABLE `dual_correo_plantillas_historial`
      ADD COLUMN `lleva_adjuntos` tinyint(1) NOT NULL DEFAULT '0' AFTER `activa`,
      ADD COLUMN `adjuntos` varchar(1000) DEFAULT NULL AFTER `lleva_adjuntos`;
  END IF;
END$$
DELIMITER ;

CALL `sp_023_columnas`();
DROP PROCEDURE IF EXISTS `sp_023_columnas`;

CREATE TABLE IF NOT EXISTS `dual_correo_adjuntos` (
  `id_adjunto` int NOT NULL AUTO_INCREMENT,
  `clave_plantilla` varchar(60) NOT NULL,
  `tipo` varchar(10) NOT NULL,
  `id_tipo_documento` tinyint unsigned DEFAULT NULL,
  `nombre_archivo` varchar(200) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `tamano` int unsigned DEFAULT NULL,
  `archivo` mediumblob,
  `orden` smallint unsigned NOT NULL DEFAULT '0',
  `id_usuario_subida` int DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_adjunto`),
  UNIQUE KEY `uq_dca_documento` (`clave_plantilla`, `id_tipo_documento`),
  KEY `ix_dca_tipo_documento` (`id_tipo_documento`),
  KEY `ix_dca_usuario` (`id_usuario_subida`),
  CONSTRAINT `fk_dca_plantilla` FOREIGN KEY (`clave_plantilla`) REFERENCES `dual_correo_plantillas` (`clave`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dca_tipo_documento` FOREIGN KEY (`id_tipo_documento`) REFERENCES `dual_tipos_documento` (`id_tipo_documento`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dca_usuario` FOREIGN KEY (`id_usuario_subida`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dca_tipo` CHECK (`tipo` IN ('DOCUMENTO', 'ARCHIVO')),
  CONSTRAINT `chk_dca_forma` CHECK (
    (`tipo` = 'DOCUMENTO' AND `id_tipo_documento` IS NOT NULL AND `archivo` IS NULL AND `nombre_archivo` IS NULL)
    OR (`tipo` = 'ARCHIVO' AND `id_tipo_documento` IS NULL AND `archivo` IS NOT NULL
        AND `nombre_archivo` IS NOT NULL AND `mime_type` IS NOT NULL AND `tamano` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 4. One email per event ───────────────────────────────────────────────────

-- Merged texts (used when neither email of the pair was edited) and the
-- document each kept email carries. Work table, dropped at the end.
DROP TABLE IF EXISTS `_m023_fusion`;
CREATE TABLE `_m023_fusion` (
  `clave` varchar(60) NOT NULL,
  `sale` varchar(60) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `cuando` varchar(255) NOT NULL,
  `asunto` varchar(200) NOT NULL,
  `cuerpo` text NOT NULL,
  `documento` varchar(40) NOT NULL,
  `nombre_adjunto` varchar(120) NOT NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `_m023_fusion`
  (`clave`, `sale`, `nombre`, `cuando`, `asunto`, `cuerpo`, `documento`, `nombre_adjunto`)
VALUES
  ('solicitud_empresa_recibida', 'solicitud_empresa_recibida_convenio', 'Solicitud recibida', 'Al enviar o volver a presentar la solicitud de empresa. Si el convenio se ha podido generar y el correo lleva adjuntos, el PDF va adjunto.', 'Solicitud Dual Empresa recibida', 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\n{{#convenio_adjunto}}Adjuntamos el convenio generado. La firma y la validación se registran en el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}{{#convenio_generado}}El convenio ya está disponible en el portal para descargarlo y firmarlo.{{/convenio_generado}}{{^convenio_generado}}El convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.{{/convenio_generado}}{{/convenio_adjunto}}\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 'CONVENIO', 'Convenio'),
  ('convenio_disponible', 'convenio_disponible_adjunto', 'Convenio disponible', 'Cuando el centro genera o regenera el convenio. Si el correo lleva adjuntos, el PDF va adjunto.', 'Tu convenio está disponible', 'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\n{{#convenio_adjunto}}Lo adjuntamos a este correo. Descargadlo, firmadlo y subidlo firmado desde el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}Descargadlo desde el portal, firmadlo y subidlo firmado.{{/convenio_adjunto}}\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 'CONVENIO', 'Convenio');

INSERT INTO `dual_correo_variables`
  (`clave_plantilla`, `variable`, `tipo`, `etiqueta`, `descripcion`, `ejemplo`, `fragmento`, `opcional`, `obligatoria`, `orden`)
VALUES
  ('solicitud_empresa_recibida', 'convenio_adjunto', 'TEXTO', 'Convenio adjunto', '«sí» cuando el PDF del convenio va adjunto a este correo; vacía si no (aún no generado, o el correo no lleva adjuntos). Úsala en bloques.', 'sí', '{{#convenio_adjunto}}Adjuntamos el convenio.{{/convenio_adjunto}}{{^convenio_adjunto}}El convenio no va adjunto.{{/convenio_adjunto}}', 1, 0, 5),
  ('solicitud_empresa_recibida', 'convenio_generado', 'TEXTO', 'Convenio generado', '«sí» cuando el convenio ya se ha generado, vaya adjunto o no; vacía si el centro aún tiene que generarlo. Úsala en bloques.', 'sí', '{{#convenio_generado}}El convenio ya está en el portal.{{/convenio_generado}}{{^convenio_generado}}El convenio aún no está generado.{{/convenio_generado}}', 1, 0, 6),
  ('convenio_disponible', 'convenio_adjunto', 'TEXTO', 'Convenio adjunto', '«sí» cuando el PDF del convenio va adjunto a este correo; vacía si no (no se pudo adjuntar, o el correo no lleva adjuntos). Úsala en bloques.', 'sí', '{{#convenio_adjunto}}Lo adjuntamos a este correo.{{/convenio_adjunto}}{{^convenio_adjunto}}Descargadlo desde el portal.{{/convenio_adjunto}}', 1, 0, 5)
AS nueva ON DUPLICATE KEY UPDATE `variable` = nueva.`variable`;

DROP PROCEDURE IF EXISTS `sp_023_fusionar`;
DELIMITER $$
CREATE PROCEDURE `sp_023_fusionar`(IN p_clave varchar(60))
BEGIN
  DECLARE v_sale varchar(60);
  DECLARE v_nombre varchar(120);
  DECLARE v_cuando varchar(255);
  DECLARE v_asunto varchar(200);
  DECLARE v_cuerpo text;
  DECLARE v_documento varchar(40);
  DECLARE v_nombre_adjunto varchar(120);
  DECLARE v_version_k int unsigned;
  DECLARE v_version_s int unsigned;
  DECLARE v_activa tinyint;
  DECLARE v_asunto_k varchar(200);
  DECLARE v_asunto_s varchar(200);
  DECLARE v_cuerpo_k text;
  DECLARE v_cuerpo_s text;
  DECLARE v_unido varchar(500);

  SELECT `sale`, `nombre`, `cuando`, `asunto`, `cuerpo`, `documento`, `nombre_adjunto`
    INTO v_sale, v_nombre, v_cuando, v_asunto, v_cuerpo, v_documento, v_nombre_adjunto
    FROM `_m023_fusion` WHERE `clave` = p_clave;

  -- Not merged yet (a re-run skips this and only makes sure the attachment is there).
  IF EXISTS (SELECT 1 FROM `dual_correo_plantillas` WHERE `clave` = v_sale) THEN
    SELECT `version`, `activa`, `asunto`, `cuerpo` INTO v_version_k, v_activa, v_asunto_k, v_cuerpo_k
      FROM `dual_correo_plantillas` WHERE `clave` = p_clave;
    SELECT `version`, `asunto`, `cuerpo` INTO v_version_s, v_asunto_s, v_cuerpo_s
      FROM `dual_correo_plantillas` WHERE `clave` = v_sale;

    IF v_version_k = 1 AND v_version_s = 1 THEN
      -- Neither was edited: the merged text is the original (version 1).
      UPDATE `dual_correo_plantillas`
         SET `nombre` = v_nombre, `cuando` = v_cuando, `asunto` = v_asunto, `cuerpo` = v_cuerpo,
             `lleva_adjuntos` = 1
       WHERE `clave` = p_clave;
      UPDATE `dual_correo_plantillas_historial`
         SET `asunto` = v_asunto, `cuerpo` = v_cuerpo, `lleva_adjuntos` = 1, `adjuntos` = v_nombre_adjunto
       WHERE `clave_plantilla` = p_clave AND `version` = 1;
    ELSE
      -- Edited: keep both texts. Attached version first, then the other.
      SET v_unido = CONCAT('{{#convenio_adjunto}}', v_asunto_s, '{{/convenio_adjunto}}{{^convenio_adjunto}}',
                           v_asunto_k, '{{/convenio_adjunto}}');
      SET v_asunto_k = IF(v_asunto_k = v_asunto_s OR CHAR_LENGTH(v_unido) > 200, v_asunto_k, v_unido);
      SET v_cuerpo_k = CONCAT('{{#convenio_adjunto}}', v_cuerpo_s, '\n\n{{/convenio_adjunto}}{{^convenio_adjunto}}',
                              v_cuerpo_k, '\n\n{{/convenio_adjunto}}');
      INSERT INTO `dual_correo_plantillas_historial`
        (`clave_plantilla`, `version`, `asunto`, `cuerpo`, `activa`, `lleva_adjuntos`, `adjuntos`, `id_usuario`)
      VALUES (p_clave, v_version_k + 1, v_asunto_k, v_cuerpo_k, v_activa, 1, v_nombre_adjunto, NULL);
      UPDATE `dual_correo_plantillas`
         SET `nombre` = v_nombre, `cuando` = v_cuando, `asunto` = v_asunto_k, `cuerpo` = v_cuerpo_k,
             `lleva_adjuntos` = 1, `version` = v_version_k + 1, `id_usuario_actualiza` = NULL,
             `actualizado_en` = NOW()
       WHERE `clave` = p_clave;
    END IF;

    DELETE FROM `dual_correo_plantillas_historial` WHERE `clave_plantilla` = v_sale;
    DELETE FROM `dual_correo_plantillas` WHERE `clave` = v_sale;
  END IF;

  INSERT IGNORE INTO `dual_correo_adjuntos` (`clave_plantilla`, `tipo`, `id_tipo_documento`, `orden`)
  SELECT p_clave, 'DOCUMENTO', td.`id_tipo_documento`, 1
    FROM `dual_tipos_documento` td
   WHERE td.`nombre` = v_documento;
END$$
DELIMITER ;

CALL `sp_023_fusionar`('solicitud_empresa_recibida');
CALL `sp_023_fusionar`('convenio_disponible');
DROP PROCEDURE IF EXISTS `sp_023_fusionar`;
DROP TABLE IF EXISTS `_m023_fusion`;

-- Check after applying (expected: 22, 105, 2 and 0):
--   SELECT COUNT(*) FROM dual_correo_plantillas;
--   SELECT COUNT(*) FROM dual_correo_variables;
--   SELECT COUNT(*) FROM dual_correo_adjuntos;
--   SELECT COUNT(*) FROM dual_correo_plantillas WHERE clave IN
--     ('solicitud_empresa_recibida_convenio', 'convenio_disponible_adjunto');
