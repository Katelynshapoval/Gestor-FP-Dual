-- 020_alumno_cambios.sql
-- Students ask Administración to correct their data; nothing changes until a
-- member of Administración approves the request (same model as
-- dual_empresa_cambios, legacy migration 004).
--
-- * One pending request per application (generated column + unique key); the
--   student edits it in place while it is pending.
-- * `payload` holds only the fields the student wants changed (never the DNI,
--   which the backend refuses). `snapshot` holds the values those fields had
--   when the request was sent, so approval can detect that staff changed them
--   meanwhile and stop instead of overwriting the correction.
-- * A rejected request needs a reason (CHECK).
-- * Rows are kept after resolution as the request history. Like the rest of
--   the student data they are not deleted or anonymised automatically (D7).
--
-- Only a new table is created. The protected tables (gf_alumnosfct and the
-- ge_* tables) are not altered (D1); no trigger, procedure or row changes.
-- Idempotent: CREATE TABLE IF NOT EXISTS.
--
-- Rollback: db/rollback/020_alumno_cambios.down.sql

CREATE TABLE IF NOT EXISTS `dual_alumno_cambios` (
  `id_cambio` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_alumno` int NOT NULL,
  `id_usuario_solicitante` int NOT NULL,
  `payload` json NOT NULL,
  `snapshot` json NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `fecha_resolucion` datetime DEFAULT NULL,
  `id_usuario_resolutor` int DEFAULT NULL,
  `motivo` text,
  `id_solicitud_pendiente` int GENERATED ALWAYS AS (
    (CASE WHEN (`estado` = 'PENDIENTE') THEN `id_solicitud_alumno` ELSE NULL END)
  ) STORED,
  PRIMARY KEY (`id_cambio`),
  UNIQUE KEY `uq_dac_solicitud_pendiente` (`id_solicitud_pendiente`),
  KEY `ix_dac_solicitud` (`id_solicitud_alumno`),
  KEY `ix_dac_estado` (`estado`),
  KEY `ix_dac_solicitante` (`id_usuario_solicitante`),
  KEY `ix_dac_resolutor` (`id_usuario_resolutor`),
  CONSTRAINT `fk_dac_solicitud`
    FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dac_solicitante`
    FOREIGN KEY (`id_usuario_solicitante`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dac_resolutor`
    FOREIGN KEY (`id_usuario_resolutor`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dac_estado`
    CHECK (`estado` IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  CONSTRAINT `chk_dac_motivo`
    CHECK (`estado` <> 'RECHAZADO' OR (`motivo` IS NOT NULL AND CHAR_LENGTH(TRIM(`motivo`)) > 0)),
  CONSTRAINT `chk_dac_resolucion`
    CHECK ((`estado` = 'PENDIENTE') = (`fecha_resolucion` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
