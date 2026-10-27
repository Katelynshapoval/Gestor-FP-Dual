-- Rollback of 015_dni_unico.sql — restores the original non-unique index.
-- The backend's `dni = ?` lookups keep working without the unique key.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '015';

ALTER TABLE `gf_alumnosfct`
  ADD KEY `ix_gf_alumnosfct_dni` (`dni`),
  DROP INDEX `uq_gf_alumnosfct_dni`;
