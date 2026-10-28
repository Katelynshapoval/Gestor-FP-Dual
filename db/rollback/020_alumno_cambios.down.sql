-- 020_alumno_cambios.down.sql — undoes 020_alumno_cambios.sql
--
-- WARNING: deploy a backend without student change requests first (it writes
-- dual_alumno_cambios). The rollback STOPS, changing nothing, while the table
-- has any row: requests and their history are student data and are not
-- deleted here. Check them with:
--
--   SELECT id_cambio, id_solicitud_alumno, estado, fecha_solicitud
--     FROM dual_alumno_cambios;
--
-- To roll back anyway, export those rows first (npm run db:backup) and delete
-- them deliberately; then run this file again.
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '020';

DROP PROCEDURE IF EXISTS `sp_020_down`;
DELIMITER $$
CREATE PROCEDURE `sp_020_down`()
BEGIN
  DECLARE v_tabla INT DEFAULT 0;
  DECLARE v_filas INT DEFAULT 0;

  SELECT COUNT(*) INTO v_tabla
    FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_alumno_cambios';

  IF v_tabla > 0 THEN
    SELECT COUNT(*) INTO v_filas FROM dual_alumno_cambios;
    IF v_filas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'dual_alumno_cambios tiene filas: no se puede deshacer la migración 020.';
    END IF;
    DROP TABLE dual_alumno_cambios;
  END IF;
END$$
DELIMITER ;

CALL `sp_020_down`();
DROP PROCEDURE IF EXISTS `sp_020_down`;
