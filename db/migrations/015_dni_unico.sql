-- 015_dni_unico.sql
-- Phase 2 · V-6: one student row per DNI, and DNI lookups that use the index.
--
-- The backend already stores DNIs trimmed and upper-case and now queries
-- `dni = ?` (no UPPER(TRIM()) around the column, which disabled the index and
-- made the public form scan and lock every student row).
--
-- Safety: the migration STOPS, changing nothing, if any DNI is duplicated
-- (under the column collation, i.e. ignoring case and accents) or is stored
-- with spaces or lower-case letters. No student row is ever merged, edited or
-- deleted here. Run the audit queries below, fix the rows by hand with the
-- centre, and run the migration again.
--
--   -- duplicates
--   SELECT UPPER(TRIM(dni)) AS dni_norm, COUNT(*) AS n, GROUP_CONCAT(idalumno) AS ids
--     FROM gf_alumnosfct GROUP BY dni_norm HAVING n > 1;
--   -- not normalised (binary comparison: case and spaces matter)
--   SELECT idalumno, CONCAT('[', dni, ']') AS dni FROM gf_alumnosfct
--    WHERE CAST(dni AS BINARY) <> CAST(UPPER(TRIM(dni)) AS BINARY);
--
-- Rollback: db/rollback/015_dni_unico.down.sql

DROP PROCEDURE IF EXISTS `sp_015_comprobar_dni`;
DELIMITER $$
CREATE PROCEDURE `sp_015_comprobar_dni`()
BEGIN
  DECLARE v_duplicados INT DEFAULT 0;
  DECLARE v_sin_normalizar INT DEFAULT 0;

  SELECT COUNT(*) INTO v_duplicados
    FROM (SELECT UPPER(TRIM(dni)) AS d FROM gf_alumnosfct GROUP BY d HAVING COUNT(*) > 1) x;

  SELECT COUNT(*) INTO v_sin_normalizar
    FROM gf_alumnosfct
   WHERE CAST(dni AS BINARY) <> CAST(UPPER(TRIM(dni)) AS BINARY);

  IF v_duplicados > 0 OR v_sin_normalizar > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '015: hay DNI duplicados o sin normalizar en gf_alumnosfct. Ejecuta las consultas de auditoría del fichero; no se ha cambiado nada.';
  END IF;
END$$
DELIMITER ;

CALL `sp_015_comprobar_dni`();
DROP PROCEDURE IF EXISTS `sp_015_comprobar_dni`;

ALTER TABLE `gf_alumnosfct`
  ADD UNIQUE KEY `uq_gf_alumnosfct_dni` (`dni`),
  DROP INDEX `ix_gf_alumnosfct_dni`;
