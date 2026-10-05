-- 010_documento_origen_plantillas.sql
-- Provenance for uploaded/generated documents and versioned DOCX templates.
-- Historical rows stay. Unknown uploaders remain NULL and are shown as "No registrado".
-- FORMULARIO stays in dual_tipos_documento as a legacy type; it is not an active requirement.

USE `proyecto_dual`;

CREATE TABLE IF NOT EXISTS `dual_documento_plantillas` (
  `id_plantilla` int NOT NULL AUTO_INCREMENT,
  `id_tipo_documento` tinyint unsigned NOT NULL,
  `archivo` longblob NOT NULL,
  `nombre_archivo` varchar(255) NOT NULL,
  `mime_type` varchar(150) NOT NULL,
  `version` int NOT NULL,
  `es_activa` tinyint(1) NOT NULL DEFAULT 0,
  `id_usuario_subida` int NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `activa_tipo` tinyint unsigned GENERATED ALWAYS AS (IF(`es_activa` = 1, `id_tipo_documento`, NULL)) STORED,
  PRIMARY KEY (`id_plantilla`),
  UNIQUE KEY `uq_plantilla_tipo_version` (`id_tipo_documento`, `version`),
  UNIQUE KEY `uq_plantilla_activa` (`activa_tipo`),
  KEY `ix_plantilla_tipo` (`id_tipo_documento`),
  CONSTRAINT `fk_plantilla_tipo`
    FOREIGN KEY (`id_tipo_documento`) REFERENCES `dual_tipos_documento` (`id_tipo_documento`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_plantilla_usuario`
    FOREIGN KEY (`id_usuario_subida`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `dual_documentos`
  ADD COLUMN `id_usuario_origen` int DEFAULT NULL,
  ADD COLUMN `origen_documento` varchar(20) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN `id_plantilla` int DEFAULT NULL,
  ADD COLUMN `registrado_en` datetime DEFAULT NULL;

ALTER TABLE `dual_documentos`
  ADD KEY `ix_documentos_usuario_origen` (`id_usuario_origen`),
  ADD KEY `ix_documentos_plantilla` (`id_plantilla`),
  ADD CONSTRAINT `fk_documentos_usuario_origen`
    FOREIGN KEY (`id_usuario_origen`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_documentos_plantilla`
    FOREIGN KEY (`id_plantilla`) REFERENCES `dual_documento_plantillas` (`id_plantilla`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `chk_documentos_origen`
    CHECK (`origen_documento` IN ('SUBIDA', 'GENERADO', 'LEGACY'));

ALTER TABLE `dual_documento_versiones`
  ADD COLUMN `id_usuario_origen` int DEFAULT NULL,
  ADD COLUMN `origen_documento` varchar(20) DEFAULT NULL,
  ADD COLUMN `id_plantilla` int DEFAULT NULL;

-- Archive the previous blob together with the provenance that created it.
-- The procedure signature stays the same so existing CALL sites keep working.
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
      (id_documento, archivo, id_estado_validacion, motivo, estado_workflow, id_usuario_origen, origen_documento, id_plantilla)
    SELECT id_documento, archivo, id_estado_validacion, motivo, estado_workflow, id_usuario_origen, origen_documento, id_plantilla
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
      (id_solicitud_alumno, id_solicitud_empresa, id_reserva, id_tipo_documento, archivo, id_estado_validacion, estado_workflow, es_actual, origen_documento)
    VALUES (
      p_id_solicitud_alumno, p_id_solicitud_empresa, p_id_reserva,
      p_id_tipo_documento, p_archivo,
      (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1),
      'SUBIDO',
      1,
      'LEGACY'
    );
    SELECT LAST_INSERT_ID() AS id_documento;
  END IF;
END$$
DELIMITER ;
