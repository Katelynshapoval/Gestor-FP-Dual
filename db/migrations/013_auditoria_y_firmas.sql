-- 013_auditoria_y_firmas.sql
-- Phase 2 · PM-5 (D5), D1, D7.
--
-- 1. dual_eventos: append-only audit trail. One row per state transition or
--    signature: entity, id, action, previous/new state, acting user and role,
--    reason and a small JSON detail. It stores ids, never names, DNIs, emails,
--    passwords or file contents. UPDATE and DELETE are refused by triggers.
-- 2. dual_documento_firmas: who recorded each signature (firmado_por) and how
--    (metodo): CONFIRMACION_APP = the user pressed "Firmar" in the app;
--    SUBIDA_FIRMADA = the signer uploaded the file and thereby attests that it
--    carries their signature. Neither is a cryptographic verification; staff
--    still review the file before validating it (D1).
-- 3. dual_documentos.firmas_exentas_legacy: explicit, per-row exemption from the
--    signature requirement. Set ONLY for documents that, when this migration
--    runs, were already VALIDADO, came from the legacy flow (origen LEGACY), have
--    a type that now requires signatures and have no signature rows at all.
--    Each exemption is recorded in dual_eventos (EXENCION_FIRMA_LEGACY). Every
--    other document, including pending legacy ones, must collect its signatures.
--
-- Rollback: db/rollback/013_auditoria_y_firmas.down.sql (export dual_eventos first).

CREATE TABLE IF NOT EXISTS `dual_eventos` (
  `id_evento` bigint unsigned NOT NULL AUTO_INCREMENT,
  `entidad` varchar(30) NOT NULL,
  `id_entidad` int NOT NULL,
  `accion` varchar(40) NOT NULL,
  `estado_anterior` varchar(30) DEFAULT NULL,
  `estado_nuevo` varchar(30) DEFAULT NULL,
  `id_usuario` int DEFAULT NULL,
  `rol_usuario` varchar(20) DEFAULT NULL,
  `motivo` text,
  `detalle` json DEFAULT NULL,
  `creado_en` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id_evento`),
  KEY `ix_de_entidad` (`entidad`, `id_entidad`),
  KEY `ix_de_usuario` (`id_usuario`),
  KEY `ix_de_creado` (`creado_en`),
  CONSTRAINT `fk_de_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS `trg_de_bu_inmutable`;
DELIMITER $$
CREATE TRIGGER `trg_de_bu_inmutable` BEFORE UPDATE ON `dual_eventos` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de auditoría no se puede modificar.';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_de_bd_inmutable`;
DELIMITER $$
CREATE TRIGGER `trg_de_bd_inmutable` BEFORE DELETE ON `dual_eventos` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El registro de auditoría no se puede borrar.';
END$$
DELIMITER ;

ALTER TABLE `dual_documento_firmas`
  ADD COLUMN `firmado_por` int DEFAULT NULL AFTER `firmado_en`,
  ADD COLUMN `metodo` varchar(20) DEFAULT NULL AFTER `firmado_por`,
  ADD KEY `ix_ddf_firmado_por` (`firmado_por`),
  ADD CONSTRAINT `fk_ddf_firmado_por` FOREIGN KEY (`firmado_por`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `chk_ddf_metodo` CHECK (`metodo` IS NULL OR `metodo` IN ('CONFIRMACION_APP', 'SUBIDA_FIRMADA'));

ALTER TABLE `dual_documentos`
  ADD COLUMN `firmas_exentas_legacy` tinyint(1) NOT NULL DEFAULT '0' AFTER `registrado_en`,
  ADD CONSTRAINT `chk_dd_firmas_exentas` CHECK (`firmas_exentas_legacy` IN (0, 1));

-- Types whose catalogue entry has signers (documentCatalogue: CONVENIO,
-- ANEXO_II, ANEXO_III, CALENDARIO). Identify the rows once, record why.
DROP TEMPORARY TABLE IF EXISTS `tmp_013_exentos`;
CREATE TEMPORARY TABLE `tmp_013_exentos` (`id_documento` int NOT NULL PRIMARY KEY);

INSERT INTO `tmp_013_exentos` (`id_documento`)
SELECT d.id_documento
  FROM dual_documentos d
  JOIN dual_tipos_documento td ON td.id_tipo_documento = d.id_tipo_documento
  JOIN dual_estados_validacion ev ON ev.id_estado_validacion = d.id_estado_validacion
 WHERE td.nombre IN ('CONVENIO', 'ANEXO_II', 'ANEXO_III', 'CALENDARIO')
   AND d.origen_documento = 'LEGACY'
   AND ev.nombre = 'VALIDADO'
   AND NOT EXISTS (SELECT 1 FROM dual_documento_firmas f WHERE f.id_documento = d.id_documento);

UPDATE dual_documentos d
  JOIN tmp_013_exentos t ON t.id_documento = d.id_documento
   SET d.firmas_exentas_legacy = 1;

INSERT INTO dual_eventos (entidad, id_entidad, accion, estado_anterior, estado_nuevo, motivo, detalle)
SELECT 'DOCUMENTO', t.id_documento, 'EXENCION_FIRMA_LEGACY', 'VALIDADO', 'VALIDADO',
       'Documento validado antes del registro de firmas (migración 013).',
       JSON_OBJECT('migracion', '013')
  FROM tmp_013_exentos t;

DROP TEMPORARY TABLE IF EXISTS `tmp_013_exentos`;
