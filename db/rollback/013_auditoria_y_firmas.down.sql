-- Rollback of 013_auditoria_y_firmas.sql
-- WARNING: dropping dual_eventos destroys the audit trail recorded since 013.
-- Export it first, for example:
--   SELECT * FROM dual_eventos INTO OUTFILE ...   (or MySQL Workbench › Export)
-- Signature rows themselves are kept; only who/how is lost.
-- The backend from Phase 2 writes to these columns and table: deploy the
-- previous backend before running this file.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '013';

DROP TRIGGER IF EXISTS `trg_de_bu_inmutable`;
DROP TRIGGER IF EXISTS `trg_de_bd_inmutable`;
DROP TABLE IF EXISTS `dual_eventos`;

ALTER TABLE `dual_documento_firmas`
  DROP FOREIGN KEY `fk_ddf_firmado_por`,
  DROP CHECK `chk_ddf_metodo`;
ALTER TABLE `dual_documento_firmas`
  DROP INDEX `ix_ddf_firmado_por`,
  DROP COLUMN `metodo`,
  DROP COLUMN `firmado_por`;

ALTER TABLE `dual_documentos`
  DROP CHECK `chk_dd_firmas_exentas`;
ALTER TABLE `dual_documentos`
  DROP COLUMN `firmas_exentas_legacy`;
