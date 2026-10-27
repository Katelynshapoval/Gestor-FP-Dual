-- 016_estado_baja.down.sql — undoes 016_estado_baja.sql
--
-- WARNING: deploy the previous backend first (the Phase 5 backend reads BAJA).
-- The rollback STOPS, changing nothing, while any application or document still
-- uses the BAJA state. Reactivate those applications first («Reactivar» in
-- Alumnos / Empresas), or check them with:
--
--   SELECT 'alumno' AS tipo, id_solicitud_alumno AS id FROM dual_solicitudes_alumno
--    WHERE id_estado_validacion = fn_id_estado_validacion('BAJA')
--   UNION ALL
--   SELECT 'empresa', id_solicitud_empresa FROM dual_solicitudes_empresa
--    WHERE id_estado_validacion = fn_id_estado_validacion('BAJA');
--
-- The BAJA / REACTIVAR rows in dual_eventos are kept (the audit trail is
-- append-only).
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '016';

DROP PROCEDURE IF EXISTS `sp_016_down`;
DELIMITER $$
CREATE PROCEDURE `sp_016_down`()
BEGIN
  DECLARE v_id TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_en_uso INT DEFAULT 0;

  SELECT id_estado_validacion INTO v_id
    FROM dual_estados_validacion WHERE nombre = 'BAJA';

  IF v_id IS NOT NULL THEN
    SELECT (SELECT COUNT(*) FROM dual_solicitudes_alumno WHERE id_estado_validacion = v_id)
         + (SELECT COUNT(*) FROM dual_solicitudes_empresa WHERE id_estado_validacion = v_id)
         + (SELECT COUNT(*) FROM dual_documentos WHERE id_estado_validacion = v_id)
      INTO v_en_uso;

    IF v_en_uso > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hay filas en estado BAJA: reactívalas antes de deshacer la migración 016.';
    END IF;

    DELETE FROM dual_estados_validacion WHERE id_estado_validacion = v_id;
  END IF;
END$$
DELIMITER ;

CALL `sp_016_down`();
DROP PROCEDURE IF EXISTS `sp_016_down`;
