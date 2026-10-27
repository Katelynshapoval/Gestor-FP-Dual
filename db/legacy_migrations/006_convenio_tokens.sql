-- One-time public convenio upload tokens (defined in after_schema_patch.sql, may be missing).
CREATE TABLE IF NOT EXISTS `dual_convenio_tokens` (
  `id_token` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_empresa` int NOT NULL,
  `token` varchar(64) NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expira_en` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_token`),
  UNIQUE KEY `uq_dct_token` (`token`),
  KEY `ix_dct_solicitud` (`id_solicitud_empresa`),
  CONSTRAINT `fk_dct_solicitud`
    FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dct_usado` CHECK (`usado` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
