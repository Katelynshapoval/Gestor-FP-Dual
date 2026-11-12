-- 026_convenio_por_empresa.sql
-- One convenio per company (docs/PLAN_DOCUMENTOS_DINAMICOS.md, part B).
--
-- A company signs its convenio once. When it applies again in a new
-- convocatoria asking for the SAME ciclos, the new application gets a copy of
-- its validated convenio (origen HEREDADO, pointing to the original) and nobody
-- signs again. The convenio changes only when:
--   CICLOS  the company asks for different ciclos (a new application with
--           other ciclos, or a ciclo added during the year), or
--   MANUAL  the centre replaces it («Sustituir convenio», with a reason).
-- Either way a renewal is opened: the current convenio goes to history, a new
-- one is generated, the company signs it and the centre validates it. The
-- company stays validated meanwhile (its reservations carry on).
--
-- 1. dual_documentos.id_documento_origen: the document an inherited copy comes
--    from; origen_documento accepts HEREDADO.
-- 2. dual_convenio_renovaciones: each renewal, with its reason in words, the
--    ciclos before and after, the retired and the new convenio, who opened it
--    and when it was resolved (the new convenio validated). At most one open
--    per company application. The Panel and the company card list the open ones.
-- 3. Emails (editable in Configuración › Correos):
--      convenio_renovar_empresa  to the company: it has to sign a new convenio
--                                 and why (the new convenio attached when it exists)
--      convenio_renovar_centro   to every active administrator: which company,
--                                 why, ciclos before/after and the steps to follow
--    and solicitud_empresa_recibida gets `convenio_vigente` («sí» when the new
--    application kept its validated convenio). Its text is updated only if
--    nobody has edited it (version 1 and the original text), as 023 did.
--
-- Additive: no existing document changes. Convenios companies already have
-- count as theirs: they are compared with the ciclos of their application.
-- Rollback: db/rollback/026_convenio_por_empresa.down.sql (refuses once a
-- renewal or an inherited convenio exists).

-- ── 1. Inherited copies ─────────────────────────────────────────────────────

ALTER TABLE `dual_documentos`
  ADD COLUMN `id_documento_origen` int DEFAULT NULL AFTER `id_plantilla`,
  ADD KEY `ix_documentos_origen` (`id_documento_origen`),
  ADD CONSTRAINT `fk_documentos_origen` FOREIGN KEY (`id_documento_origen`)
    REFERENCES `dual_documentos` (`id_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `dual_documentos` DROP CHECK `chk_documentos_origen`;
ALTER TABLE `dual_documentos`
  ADD CONSTRAINT `chk_documentos_origen` CHECK (`origen_documento` IN ('SUBIDA', 'GENERADO', 'LEGACY', 'HEREDADO')),
  ADD CONSTRAINT `chk_documentos_heredado` CHECK ((`origen_documento` = 'HEREDADO') = (`id_documento_origen` IS NOT NULL));

-- ── 2. Renewals ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `dual_convenio_renovaciones` (
  `id_renovacion` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_empresa` int NOT NULL,
  `motivo` varchar(10) NOT NULL,
  `detalle` varchar(500) NOT NULL,
  `ciclos_antes` varchar(500) DEFAULT NULL,
  `ciclos_ahora` varchar(500) DEFAULT NULL,
  `id_documento_anterior` int DEFAULT NULL,
  `id_documento_nuevo` int DEFAULT NULL,
  `id_usuario` int DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resuelta_en` datetime DEFAULT NULL,
  `abierta_solicitud` int GENERATED ALWAYS AS (if(`resuelta_en` is null, `id_solicitud_empresa`, NULL)) STORED,
  PRIMARY KEY (`id_renovacion`),
  UNIQUE KEY `uq_dcr_una_abierta` (`abierta_solicitud`),
  KEY `ix_dcr_solicitud` (`id_solicitud_empresa`, `creado_en`),
  KEY `ix_dcr_anterior` (`id_documento_anterior`),
  KEY `ix_dcr_nuevo` (`id_documento_nuevo`),
  KEY `ix_dcr_usuario` (`id_usuario`),
  CONSTRAINT `fk_dcr_solicitud` FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dcr_anterior` FOREIGN KEY (`id_documento_anterior`) REFERENCES `dual_documentos` (`id_documento`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dcr_nuevo` FOREIGN KEY (`id_documento_nuevo`) REFERENCES `dual_documentos` (`id_documento`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dcr_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dcr_motivo` CHECK (`motivo` IN ('CICLOS', 'MANUAL')),
  CONSTRAINT `chk_dcr_detalle` CHECK (CHAR_LENGTH(TRIM(`detalle`)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 3. Emails ───────────────────────────────────────────────────────────────

INSERT INTO `dual_correo_plantillas`
  (`clave`, `grupo`, `nombre`, `destinatario`, `cuando`, `orden`, `asunto`, `cuerpo`, `activa`, `lleva_adjuntos`, `desactivable`)
VALUES
  ('convenio_renovar_empresa', 'SOLICITUD_EMPRESA', 'Hay que firmar un convenio nuevo', 'Empresa (coordinador)',
   'Cuando la empresa cambia los ciclos que solicita o el centro sustituye su convenio.', 105,
   'Hay que firmar un convenio nuevo',
   'Estimado/a {{coordinador}}:\n\nEl convenio de **{{empresa}}** tiene que renovarse: {{motivo}}.\n\n{{#convenio_adjunto}}Adjuntamos el convenio nuevo. Descargadlo, firmadlo y subidlo firmado desde el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}{{#convenio_generado}}El convenio nuevo ya está en el portal para descargarlo y firmarlo.{{/convenio_generado}}{{^convenio_generado}}El centro está preparando el convenio nuevo. Os avisaremos por correo cuando esté listo para firmar.{{/convenio_generado}}{{/convenio_adjunto}}\n\nMientras tanto vuestra solicitud sigue validada y las reservas de alumnos continúan con normalidad.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.',
   1, 1, 1),
  ('convenio_renovar_centro', 'SOLICITUD_EMPRESA', 'Convenio por renovar (aviso al centro)', 'Administración',
   'Cuando una empresa cambia los ciclos que solicita o alguien del centro sustituye un convenio. Llega a cada administrador activo.', 106,
   '{{empresa}} necesita un convenio nuevo',
   'Hola:\n\nEl convenio de **{{empresa}}** (convocatoria **{{convocatoria}}**) tiene que renovarse: {{motivo}}.\n\n{{#ciclos_anteriores}}Ciclos del convenio anterior: {{ciclos_anteriores}}\n\n{{/ciclos_anteriores}}{{#ciclos_nuevos}}Ciclos que solicita ahora: {{ciclos_nuevos}}\n\n{{/ciclos_nuevos}}Qué hay que hacer:\n\n{{pasos}}\n\nLa empresa sigue validada mientras tanto. Lo verás también en el Panel, en «Convenios por renovar»{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.',
   1, 0, 1)
AS nueva ON DUPLICATE KEY UPDATE `clave` = nueva.`clave`;

INSERT INTO `dual_correo_plantillas_historial`
  (`clave_plantilla`, `version`, `asunto`, `cuerpo`, `activa`, `lleva_adjuntos`, `adjuntos`)
SELECT p.`clave`, 1, p.`asunto`, p.`cuerpo`, p.`activa`, p.`lleva_adjuntos`,
       IF(p.`clave` = 'convenio_renovar_empresa', 'Convenio', NULL)
  FROM `dual_correo_plantillas` p
 WHERE p.`clave` IN ('convenio_renovar_empresa', 'convenio_renovar_centro')
   AND NOT EXISTS (SELECT 1 FROM `dual_correo_plantillas_historial` h
                    WHERE h.`clave_plantilla` = p.`clave` AND h.`version` = 1);

-- The company email carries the new convenio when it exists.
INSERT INTO `dual_correo_adjuntos` (`clave_plantilla`, `tipo`, `id_tipo_documento`, `orden`)
SELECT 'convenio_renovar_empresa', 'DOCUMENTO', td.`id_tipo_documento`, 1
  FROM `dual_tipos_documento` td
 WHERE td.`nombre` = 'CONVENIO'
   AND NOT EXISTS (SELECT 1 FROM `dual_correo_adjuntos` a
                    WHERE a.`clave_plantilla` = 'convenio_renovar_empresa' AND a.`id_tipo_documento` = td.`id_tipo_documento`);

INSERT INTO `dual_correo_variables`
  (`clave_plantilla`, `variable`, `tipo`, `etiqueta`, `descripcion`, `ejemplo`, `fragmento`, `opcional`, `obligatoria`, `orden`)
VALUES
  ('convenio_renovar_empresa', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('convenio_renovar_empresa', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('convenio_renovar_empresa', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('convenio_renovar_empresa', 'motivo', 'TEXTO', 'Motivo', 'Por qué cambia el convenio, en una frase: los ciclos cambiados o el motivo que escribió el centro.', 'habéis añadido el ciclo Desarrollo de Aplicaciones Web', NULL, 0, 0, 4),
  ('convenio_renovar_empresa', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 5),
  ('convenio_renovar_empresa', 'convenio_adjunto', 'TEXTO', 'Convenio adjunto', '«sí» cuando el PDF del convenio nuevo va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#convenio_adjunto}}Adjuntamos el convenio nuevo.{{/convenio_adjunto}}', 1, 0, 6),
  ('convenio_renovar_empresa', 'convenio_generado', 'TEXTO', 'Convenio generado', '«sí» cuando el convenio nuevo ya está generado; vacía mientras el centro lo prepara. Úsala en bloques.', 'sí', '{{#convenio_generado}}Ya está en el portal.{{/convenio_generado}}', 1, 0, 7),
  ('convenio_renovar_centro', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 1),
  ('convenio_renovar_centro', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria de la solicitud.', '2026/2027', NULL, 0, 0, 2),
  ('convenio_renovar_centro', 'motivo', 'TEXTO', 'Motivo', 'Por qué cambia el convenio, en una frase.', 'la empresa ha añadido el ciclo Desarrollo de Aplicaciones Web', NULL, 0, 0, 3),
  ('convenio_renovar_centro', 'ciclos_anteriores', 'TEXTO', 'Ciclos del convenio anterior', 'Ciclos que cubría el convenio anterior. Vacía cuando no cambian.', 'Mecatrónica Industrial', '{{#ciclos_anteriores}}Antes: {{ciclos_anteriores}}{{/ciclos_anteriores}}', 1, 0, 4),
  ('convenio_renovar_centro', 'ciclos_nuevos', 'TEXTO', 'Ciclos que solicita ahora', 'Ciclos que solicita ahora la empresa. Vacía cuando no cambian.', 'Mecatrónica Industrial, Desarrollo de Aplicaciones Web', '{{#ciclos_nuevos}}Ahora: {{ciclos_nuevos}}{{/ciclos_nuevos}}', 1, 0, 5),
  ('convenio_renovar_centro', 'pasos', 'LISTA', 'Pasos', 'Lo que hay que hacer, en orden: generar el convenio (si falta la plantilla, subirla antes), esperar la firma de la empresa y validarlo.', 'Generar el convenio nuevo en Documentos\nEsperar a que la empresa lo firme\nValidar el convenio firmado', NULL, 0, 0, 6),
  ('convenio_renovar_centro', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 7),
  ('solicitud_empresa_recibida', 'convenio_vigente', 'TEXTO', 'Convenio vigente', '«sí» cuando la empresa ya tiene un convenio validado con los mismos ciclos y no tiene que firmar otro; vacía si no. Úsala en bloques.', 'sí', '{{#convenio_vigente}}Vuestro convenio sigue vigente.{{/convenio_vigente}}', 1, 0, 7)
AS nueva ON DUPLICATE KEY UPDATE `variable` = nueva.`variable`;

-- solicitud_empresa_recibida: say that a kept convenio needs no new signature.
-- Only when nobody has edited the email (version 1 with the text of 023).
SET @recibida_023 = 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\n{{#convenio_adjunto}}Adjuntamos el convenio generado. La firma y la validación se registran en el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}{{#convenio_generado}}El convenio ya está disponible en el portal para descargarlo y firmarlo.{{/convenio_generado}}{{^convenio_generado}}El convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.{{/convenio_generado}}{{/convenio_adjunto}}\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.';
SET @recibida_026 = 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\n{{#convenio_vigente}}Vuestro convenio sigue vigente: cubre los mismos ciclos, así que no hace falta firmar uno nuevo.{{/convenio_vigente}}{{^convenio_vigente}}{{#convenio_adjunto}}Adjuntamos el convenio generado. La firma y la validación se registran en el portal.{{/convenio_adjunto}}{{^convenio_adjunto}}{{#convenio_generado}}El convenio ya está disponible en el portal para descargarlo y firmarlo.{{/convenio_generado}}{{^convenio_generado}}El convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.{{/convenio_generado}}{{/convenio_adjunto}}{{/convenio_vigente}}\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.';

UPDATE `dual_correo_plantillas`
   SET `cuerpo` = @recibida_026
 WHERE `clave` = 'solicitud_empresa_recibida' AND `version` = 1 AND `cuerpo` COLLATE utf8mb4_bin = @recibida_023 COLLATE utf8mb4_bin;
UPDATE `dual_correo_plantillas_historial`
   SET `cuerpo` = @recibida_026
 WHERE `clave_plantilla` = 'solicitud_empresa_recibida' AND `version` = 1 AND `cuerpo` COLLATE utf8mb4_bin = @recibida_023 COLLATE utf8mb4_bin;

-- Check after applying (expected: 24 templates, 132 variables, 0 renewals):
--   SELECT COUNT(*) FROM dual_correo_plantillas;
--   SELECT COUNT(*) FROM dual_correo_variables;
--   SELECT COUNT(*) FROM dual_convenio_renovaciones;
