-- 027_firmas_imagen.sql
-- Real signatures on documents (docs/PLAN_FIRMAS.md).
--
-- Until now "Firmar" only recorded that a role had signed (CONFIRMACION_APP):
-- the PDF never changed. From this migration each person keeps ONE signature
-- image and signing stamps it into the PDF.
--
-- 1. dual_firmas: saved signature images.
--      USUARIO  a student's or a company's own signature (id_usuario = owner)
--      TUTOR    the legal guardian's signature of an under-18 student, kept on
--               the student's account (id_usuario = the student's user)
--      CENTRO   the centre's image, signature and seal together (no owner);
--               every ADMINISTRADOR and COORDINADOR signs with it
--    At most one active row per (titular, owner): a generated column that is
--    NULL when the row is not active, plus a unique index (the pattern of
--    uq_dd_actual). Changing a signature deactivates the row and adds a new
--    one; rows are kept because signed documents refer to them. Deleting a
--    signature empties `imagen` (retirada_en says when).
-- 2. dual_firma_sesiones: phone hand-off. The computer opens a session and
--    shows a QR; the phone uploads one drawing with the token; the computer
--    reads it with its own key. Only the SHA-256 of both secrets is stored.
--    A session is a relay: it belongs to no account and signs nothing.
-- 3. dual_documentos.firma_posiciones: page and rectangle of each signature
--    mark of the CURRENT file (JSON), read from the PDF when it is generated;
--    `_hoja` records the "Hoja de firmas" page added for signers without a
--    mark. NULL = the file has no marks (uploaded PDFs, older documents).
-- 4. dual_documento_firmas: which saved image was stamped (id_firma_imagen,
--    id_firma_tutor) and the new method FIRMA_IMAGEN.
-- 5. dual_eventos accepts the entity FIRMA (create, change, delete a saved
--    signature; never the image).
-- 6. The convenio is also signed by the centre (firma_centro = 1). Convenios
--    already validated stay valid: a validated document only lists the
--    signatures it was asked for (documentCatalogue.firmaListFor).
--
-- Additive: no existing document or signature changes.
-- Rollback: db/rollback/027_firmas_imagen.down.sql (refuses once a document
-- has been signed with an image).

-- ── 1. Saved signatures ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `dual_firmas` (
  `id_firma` int NOT NULL AUTO_INCREMENT,
  `titular` varchar(10) NOT NULL,
  `id_usuario` int DEFAULT NULL,
  `imagen` mediumblob,
  `ancho` smallint unsigned NOT NULL,
  `alto` smallint unsigned NOT NULL,
  `origen` varchar(10) NOT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `creado_por` int DEFAULT NULL,
  `retirada_en` datetime DEFAULT NULL,
  `activa_clave` varchar(30) GENERATED ALWAYS AS
    (if(`activa` = 1, concat(`titular`, ':', ifnull(`id_usuario`, 0)), NULL)) STORED,
  PRIMARY KEY (`id_firma`),
  UNIQUE KEY `uq_firmas_activa` (`activa_clave`),
  KEY `ix_firmas_usuario` (`id_usuario`),
  KEY `ix_firmas_creado_por` (`creado_por`),
  CONSTRAINT `fk_firmas_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_firmas_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_firmas_titular` CHECK (`titular` IN ('USUARIO', 'TUTOR', 'CENTRO')),
  CONSTRAINT `chk_firmas_propietario` CHECK ((`titular` = 'CENTRO') = (`id_usuario` IS NULL)),
  CONSTRAINT `chk_firmas_origen` CHECK (`origen` IN ('PANTALLA', 'MOVIL', 'FICHERO')),
  CONSTRAINT `chk_firmas_activa` CHECK (`activa` IN (0, 1)),
  CONSTRAINT `chk_firmas_imagen_activa` CHECK (`activa` = 0 OR `imagen` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 2. Phone hand-off ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `dual_firma_sesiones` (
  `id_sesion` int NOT NULL AUTO_INCREMENT,
  `token_hash` char(64) NOT NULL,
  `lectura_hash` char(64) NOT NULL,
  `estado` varchar(10) NOT NULL DEFAULT 'ABIERTA',
  `imagen` mediumblob,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expira_en` datetime NOT NULL,
  PRIMARY KEY (`id_sesion`),
  UNIQUE KEY `uq_firma_sesiones_token` (`token_hash`),
  KEY `ix_firma_sesiones_expira` (`expira_en`),
  CONSTRAINT `chk_firma_sesiones_estado` CHECK (`estado` IN ('ABIERTA', 'RECIBIDA', 'CERRADA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 3. Where each signature goes in the current file ────────────────────────

ALTER TABLE `dual_documentos`
  ADD COLUMN `firma_posiciones` json DEFAULT NULL AFTER `firmas_exentas_legacy`;

-- ── 4. Which image signed ───────────────────────────────────────────────────

ALTER TABLE `dual_documento_firmas`
  ADD COLUMN `id_firma_imagen` int DEFAULT NULL AFTER `metodo`,
  ADD COLUMN `id_firma_tutor` int DEFAULT NULL AFTER `id_firma_imagen`,
  ADD KEY `ix_ddf_firma_imagen` (`id_firma_imagen`),
  ADD KEY `ix_ddf_firma_tutor` (`id_firma_tutor`),
  ADD CONSTRAINT `fk_ddf_firma_imagen` FOREIGN KEY (`id_firma_imagen`) REFERENCES `dual_firmas` (`id_firma`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_ddf_firma_tutor` FOREIGN KEY (`id_firma_tutor`) REFERENCES `dual_firmas` (`id_firma`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `dual_documento_firmas` DROP CHECK `chk_ddf_metodo`;
ALTER TABLE `dual_documento_firmas`
  ADD CONSTRAINT `chk_ddf_metodo` CHECK (`metodo` IS NULL OR `metodo` IN ('CONFIRMACION_APP', 'SUBIDA_FIRMADA', 'FIRMA_IMAGEN'));

-- ── 5. Audit ────────────────────────────────────────────────────────────────

ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;
ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO', 'CORREO',
     'TIPO_DOCUMENTO', 'FIRMA'));

-- ── 6. The centre also signs the convenio ───────────────────────────────────

UPDATE `dual_tipos_documento` SET `firma_centro` = 1 WHERE `nombre` = 'CONVENIO' AND `es_sistema` = 1;

-- Check after applying (expected: 0, 0, 1):
--   SELECT COUNT(*) FROM dual_firmas;
--   SELECT COUNT(*) FROM dual_firma_sesiones;
--   SELECT firma_centro FROM dual_tipos_documento WHERE nombre = 'CONVENIO';
