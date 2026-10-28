-- 021_quitar_preferencias.sql
-- Removes student preferences (dual_preferencias, dual_solicitud_preferencias,
-- legacy migration 011). The catalog was never filled, so the form never showed
-- them, and nothing read the chosen ones. Reverses decision D9.
--
-- Guard: stops before changing anything while either table has a row, so no
-- student data is dropped by accident. Nothing else references these tables
-- (no trigger, procedure or view); only their own foreign keys.
-- Idempotent: DROP TABLE IF EXISTS.
--
-- Deploy the backend without preferences first (the previous one reads and
-- writes these tables).
--
-- Rollback: db/rollback/021_quitar_preferencias.down.sql

DROP PROCEDURE IF EXISTS `sp_021_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_021_comprobar`()
BEGIN
  DECLARE v_filas INT DEFAULT 0;

  IF EXISTS (SELECT 1 FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_solicitud_preferencias') THEN
    SELECT COUNT(*) INTO v_filas FROM dual_solicitud_preferencias;
  END IF;
  IF v_filas = 0 AND EXISTS (SELECT 1 FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dual_preferencias') THEN
    SELECT COUNT(*) INTO v_filas FROM dual_preferencias;
  END IF;
  IF v_filas > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Las tablas de preferencias tienen filas: expórtalas antes de aplicar la migración 021.';
  END IF;
END$$
DELIMITER ;

CALL `sp_021_comprobar`();
DROP PROCEDURE IF EXISTS `sp_021_comprobar`;

DROP TABLE IF EXISTS `dual_solicitud_preferencias`;
DROP TABLE IF EXISTS `dual_preferencias`;
