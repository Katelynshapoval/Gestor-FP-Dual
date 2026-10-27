-- 011 · Student preference tables (Phase 1, finding V-2)
--
-- STATUS: DRAFT — NOT APPLIED. Run only after confirming with
--   SHOW TABLES LIKE 'dual_%preferencias';
-- that the tables are missing, and after the project owner approves.
--
-- Why: GET /preferencias reads dual_preferencias and POST /solicitudes/alumno
-- writes dual_solicitud_preferencias inside the application transaction.
-- Both tables were only ever created by db/after_schema_patch.sql, which must
-- not be re-run over migration 003 (it seeds old reservation state names).
-- This file copies section 1 of that patch verbatim.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, no data changes, no drops.
-- Note: dual_preferencias starts empty. Until rows are added per speciality,
-- the form simply shows no preference selectors (current behaviour).

CREATE TABLE IF NOT EXISTS `dual_preferencias` (
  `id_preferencia` int NOT NULL AUTO_INCREMENT,
  `id_especialidad` int NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  PRIMARY KEY (`id_preferencia`),
  KEY `ix_dp_especialidad` (`id_especialidad`),
  CONSTRAINT `fk_dp_especialidad`
    FOREIGN KEY (`id_especialidad`) REFERENCES `dual_especialidades` (`id_especialidad`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_solicitud_preferencias` (
  `id_solicitud_alumno` int NOT NULL,
  `orden` tinyint unsigned NOT NULL COMMENT '1, 2 o 3',
  `id_preferencia` int NOT NULL,
  PRIMARY KEY (`id_solicitud_alumno`, `orden`),
  KEY `ix_dsp_preferencia` (`id_preferencia`),
  CONSTRAINT `fk_dsp_solicitud`
    FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dsp_preferencia`
    FOREIGN KEY (`id_preferencia`) REFERENCES `dual_preferencias` (`id_preferencia`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dsp_orden` CHECK (`orden` BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
