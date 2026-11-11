-- 024_correo_adjuntos_documentos.down.sql — undoes 024_correo_adjuntos_documentos.sql
--
-- Guard: stops, changing nothing, while any of those emails still uses one of
-- the variables, or carries one of the new documents as an attachment: the
-- backend of 023 would find invalid templates or attachments it cannot send.
-- Remove them in «Correos» first.
--
-- Afterwards: DELETE FROM schema_migrations WHERE version = '024';

DROP PROCEDURE IF EXISTS `sp_024_down_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_024_down_comprobar`()
BEGIN
  IF EXISTS (SELECT 1 FROM dual_correo_plantillas
              WHERE clave IN ('solicitud_empresa_validada', 'documento_rechazado_empresa', 'reserva_creada_alumno',
                              'reserva_creada_empresa', 'reserva_confirmada_alumno', 'reserva_confirmada_empresa',
                              'documento_rechazado_reserva')
                AND (CONCAT(asunto, cuerpo) LIKE '%convenio_adjunto%' OR CONCAT(asunto, cuerpo) LIKE '%anexo_ii_adjunto%'
                     OR CONCAT(asunto, cuerpo) LIKE '%anexo_iii_adjunto%')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Algún correo usa las variables de la 024: quítalas en «Correos» antes de deshacerla.';
  END IF;
  IF EXISTS (SELECT 1 FROM dual_correo_adjuntos a
               JOIN dual_tipos_documento td ON td.id_tipo_documento = a.id_tipo_documento
              WHERE (td.nombre = 'CONVENIO' AND a.clave_plantilla IN ('solicitud_empresa_validada', 'documento_rechazado_empresa'))
                 OR td.nombre IN ('ANEXO_II', 'ANEXO_III')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Algún correo lleva como adjunto un documento que solo admite la 024: quítalo en «Correos» antes de deshacerla.';
  END IF;
END$$
DELIMITER ;

CALL `sp_024_down_comprobar`();
DROP PROCEDURE IF EXISTS `sp_024_down_comprobar`;

DELETE FROM `dual_correo_variables`
 WHERE (`clave_plantilla` IN ('solicitud_empresa_validada', 'documento_rechazado_empresa') AND `variable` = 'convenio_adjunto')
    OR (`clave_plantilla` IN ('reserva_creada_alumno', 'reserva_creada_empresa', 'reserva_confirmada_alumno',
                              'reserva_confirmada_empresa', 'documento_rechazado_reserva')
        AND `variable` IN ('anexo_ii_adjunto', 'anexo_iii_adjunto'));

-- Check afterwards (expected: 105):
--   SELECT COUNT(*) FROM dual_correo_variables;
