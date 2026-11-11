-- 022_correo_plantillas.down.sql — undoes 022_correo_plantillas.sql
--
-- Guard: stops, changing nothing, while any CORREO event exists. dual_eventos
-- is append-only (its triggers refuse DELETE), so those rows could not be
-- removed and would break the restored CHECK. A CORREO event means an
-- administrator edited an email: export the edited texts first
--   SELECT clave, version, asunto, cuerpo, activa FROM dual_correo_plantillas WHERE version > 1;
-- and decide with the team before going back.
--
-- Restoring the previous state only makes sense together with the previous
-- backend (texts in the code): the new backend sends no email without these
-- tables.
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '022';

DROP PROCEDURE IF EXISTS `sp_022_down_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_022_down_comprobar`()
BEGIN
  IF EXISTS (SELECT 1 FROM dual_eventos WHERE entidad = 'CORREO') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hay ediciones de correos auditadas (entidad CORREO): no se puede deshacer 022 sin perderlas.';
  END IF;
END$$
DELIMITER ;

CALL `sp_022_down_comprobar`();
DROP PROCEDURE IF EXISTS `sp_022_down_comprobar`;

ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;

ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO'));

DROP TABLE IF EXISTS `dual_correo_plantillas_historial`;
DROP TABLE IF EXISTS `dual_correo_variables`;
DROP TABLE IF EXISTS `dual_correo_plantillas`;
