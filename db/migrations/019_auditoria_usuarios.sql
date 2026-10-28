-- 019_auditoria_usuarios.sql
-- Staff accounts (ADMINISTRADOR / COORDINADOR) are created and withdrawn in
-- the application. dual_eventos must accept entidad = 'USUARIO' so those
-- changes are audited in the same transaction. The event stores ids, role
-- and activo only: never the email, the name or the password.
--
-- Numbered 019 because 018 is already
-- 018_reservas_por_intento_y_transacciones, which widened this CHECK to
-- OFERTA and TUTOR. Those two values are kept here: dropping them would
-- reject rows that 018 already allows, and would fail if any such row exists.
-- A database that has not applied 018 still accepts them; nothing on this
-- branch writes those entities.
--
-- Rollback: db/rollback/019_auditoria_usuarios.down.sql
-- It stops, changing nothing, while any USUARIO event exists.

ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;

ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO'));
