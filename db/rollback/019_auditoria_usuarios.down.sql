-- 019_auditoria_usuarios.down.sql — undoes 019_auditoria_usuarios.sql
--
-- WARNING: deploy the previous backend first (this backend writes entidad
-- 'USUARIO'). The rollback STOPS, changing nothing, while any staff-account
-- event exists. Those rows are part of the append-only audit trail and are
-- not deleted here. Check them with:
--
--   SELECT id_evento, id_entidad, accion, creado_en
--     FROM dual_eventos WHERE entidad = 'USUARIO';
--
-- If 018_reservas_por_intento_y_transacciones is recorded, OFERTA and TUTOR
-- stay in the check. Otherwise the check returns to the four entities from 013,
-- and the rollback stops when an OFERTA or TUTOR event already exists.
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '019';

DROP PROCEDURE IF EXISTS `sp_019_down`;
DELIMITER $$
CREATE PROCEDURE `sp_019_down`()
BEGIN
  DECLARE v_usuario INT DEFAULT 0;
  DECLARE v_extra INT DEFAULT 0;
  DECLARE v_018 INT DEFAULT 0;

  SELECT COUNT(*) INTO v_usuario FROM dual_eventos WHERE entidad = 'USUARIO';
  IF v_usuario > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay eventos USUARIO: no se puede deshacer la migración 019.';
  END IF;

  SELECT COUNT(*) INTO v_018 FROM schema_migrations WHERE version = '018';

  IF v_018 = 0 THEN
    SELECT COUNT(*) INTO v_extra FROM dual_eventos WHERE entidad IN ('OFERTA', 'TUTOR');
    IF v_extra > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hay eventos OFERTA o TUTOR: no se puede deshacer la migración 019.';
    END IF;

    ALTER TABLE dual_eventos DROP CHECK chk_de_entidad;
    ALTER TABLE dual_eventos
      ADD CONSTRAINT chk_de_entidad CHECK (entidad IN
        ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO'));
  ELSE
    ALTER TABLE dual_eventos DROP CHECK chk_de_entidad;
    ALTER TABLE dual_eventos
      ADD CONSTRAINT chk_de_entidad CHECK (entidad IN
        ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR'));
  END IF;
END$$
DELIMITER ;

CALL `sp_019_down`();
DROP PROCEDURE IF EXISTS `sp_019_down`;
