-- 016_estado_baja.sql
-- Phase 5 · «Dar de baja»: a new application state BAJA (withdrawn from the
-- programme by Administración) for student and company applications.
--
-- Only one lookup row is added; no table, column, trigger or procedure changes.
-- States are resolved by name everywhere (fn_id_estado_validacion, PM-4), so the
-- new id is not hard-coded anywhere.
--
-- The baja reason is NOT stored on the application row: the existing triggers
-- (trg_dsa_bu_reglas, trg_dse_bu_reglas) only allow `motivo` on RECHAZADO rows.
-- It is kept in the audit trail (dual_eventos, accion = 'BAJA'), together with
-- the previous state, which «Reactivar» restores.
--
-- Idempotent: running it twice adds nothing.
-- Rollback: db/rollback/016_estado_baja.down.sql

INSERT INTO `dual_estados_validacion` (`nombre`)
SELECT 'BAJA'
 WHERE NOT EXISTS (SELECT 1 FROM `dual_estados_validacion` WHERE `nombre` = 'BAJA');
