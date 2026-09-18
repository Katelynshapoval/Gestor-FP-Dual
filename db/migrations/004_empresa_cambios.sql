-- 004_empresa_cambios.sql
-- Auditable company data change requests.
-- Live tables are not modified until staff approve a request.
-- One pending request per solicitud (replace/edit in place).

USE `proyecto_dual`;

CREATE TABLE IF NOT EXISTS `dual_empresa_cambios` (
  `id_cambio` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_empresa` int NOT NULL,
  `id_empresa` int NOT NULL,
  `id_usuario_solicitante` int NOT NULL,
  `payload` json NOT NULL,
  `estado` varchar(20) NOT NULL,
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_resolucion` datetime DEFAULT NULL,
  `id_usuario_resolutor` int DEFAULT NULL,
  `motivo` text,
  `id_solicitud_pendiente` int GENERATED ALWAYS AS (
    (CASE WHEN (`estado` = 'PENDIENTE') THEN `id_solicitud_empresa` ELSE NULL END)
  ) STORED,
  PRIMARY KEY (`id_cambio`),
  UNIQUE KEY `uq_dec_solicitud_pendiente` (`id_solicitud_pendiente`),
  KEY `ix_dec_empresa` (`id_empresa`),
  KEY `ix_dec_solicitud` (`id_solicitud_empresa`),
  KEY `ix_dec_estado` (`estado`),
  CONSTRAINT `fk_dec_solicitud`
    FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dec_empresa`
    FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dec_solicitante`
    FOREIGN KEY (`id_usuario_solicitante`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dec_resolutor`
    FOREIGN KEY (`id_usuario_resolutor`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dec_estado`
    CHECK (`estado` IN ('PENDIENTE', 'APROBADO', 'RECHAZADO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
