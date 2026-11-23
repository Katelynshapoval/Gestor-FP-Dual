-- 029_quitar_tipo_contrato_convenio.sql
-- "Convenio" is the agreement between the centre and a company, not a type of
-- contract for a student (those are Beca and Contrato de formación en
-- alternancia, plus Otro). Remove it from dual_tipos_contrato so it no longer
-- appears in the «Tipo de contrato» list.
--
-- The convenio is a document (a form the company signs), and for students it is
-- only a status and a file, never a choice. Reservations that still carry it
-- (old demo data) move to Contrato de formación en alternancia: the same annex
-- family (Anexo II) Convenio had, so no annex changes.
-- Rollback: db/rollback/029_quitar_tipo_contrato_convenio.down.sql.

DROP PROCEDURE IF EXISTS `sp_029_quitar_convenio`;
DELIMITER $$
CREATE PROCEDURE `sp_029_quitar_convenio`()
BEGIN
  DECLARE v_id TINYINT UNSIGNED;
  DECLARE v_contrato TINYINT UNSIGNED;

  SELECT id_tipo_contrato INTO v_id FROM `dual_tipos_contrato` WHERE nombre = 'CONVENIO' LIMIT 1;
  IF v_id IS NOT NULL THEN
    SELECT id_tipo_contrato INTO v_contrato FROM `dual_tipos_contrato`
     WHERE nombre = 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA' LIMIT 1;
    IF v_contrato IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '029: falta el tipo CONTRATO_DE_FORMACION_EN_ALTERNANCIA. No se ha cambiado nada.';
    END IF;
    UPDATE `dual_reservas` SET id_tipo_contrato = v_contrato WHERE id_tipo_contrato = v_id;
    DELETE FROM `dual_tipos_contrato` WHERE id_tipo_contrato = v_id;
  END IF;
END$$
DELIMITER ;
CALL `sp_029_quitar_convenio`();
DROP PROCEDURE `sp_029_quitar_convenio`;
