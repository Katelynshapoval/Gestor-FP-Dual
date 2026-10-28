-- 021_quitar_preferencias.down.sql — undoes 021_quitar_preferencias.sql
--
-- Recreates both tables empty, exactly as in 000_baseline.sql. The guard of 021
-- only let it run while they were empty, so no rows are lost. The backend no
-- longer uses them: restoring them only makes sense together with the previous
-- backend.
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '021';

CREATE TABLE IF NOT EXISTS `dual_preferencias` (
  `id_preferencia` int NOT NULL AUTO_INCREMENT,
  `id_especialidad` int NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  PRIMARY KEY (`id_preferencia`),
  KEY `ix_dp_especialidad` (`id_especialidad`),
  CONSTRAINT `fk_dp_especialidad` FOREIGN KEY (`id_especialidad`) REFERENCES `dual_especialidades` (`id_especialidad`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_solicitud_preferencias` (
  `id_solicitud_alumno` int NOT NULL,
  `orden` tinyint unsigned NOT NULL COMMENT '1, 2 o 3',
  `id_preferencia` int NOT NULL,
  PRIMARY KEY (`id_solicitud_alumno`,`orden`),
  KEY `ix_dsp_preferencia` (`id_preferencia`),
  CONSTRAINT `fk_dsp_preferencia` FOREIGN KEY (`id_preferencia`) REFERENCES `dual_preferencias` (`id_preferencia`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dsp_solicitud` FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dsp_orden` CHECK ((`orden` between 1 and 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
