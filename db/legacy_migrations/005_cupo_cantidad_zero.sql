-- 005_cupo_cantidad_zero.sql
-- Allow a company to request zero students for a specialty
-- ("we no longer need students for this specialty").

USE `proyecto_dual`;

ALTER TABLE `dual_solicitud_empresa_especialidades`
  DROP CHECK `chk_dsee_cantidad_alumnos`;

ALTER TABLE `dual_solicitud_empresa_especialidades`
  ADD CONSTRAINT `chk_dsee_cantidad_alumnos` CHECK (`cantidad_alumnos` >= 0);
