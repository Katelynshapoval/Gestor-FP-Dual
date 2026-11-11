-- 024_correo_adjuntos_documentos.sql
-- More emails can carry a generated document (023 allowed only the convenio,
-- on two emails). Which document each email may carry is fixed by the code
-- (correoPlantillas.DOCUMENTOS), because the document must belong to the
-- request the email is about:
--   company application emails  → CONVENIO
--     solicitud_empresa_recibida, convenio_disponible (already in 023),
--     solicitud_empresa_validada, documento_rechazado_empresa
--   reservation emails          → ANEXO_II, ANEXO_III (the one the contract needs)
--     reserva_creada_alumno, reserva_creada_empresa, reserva_confirmada_alumno,
--     reserva_confirmada_empresa, documento_rechazado_reserva
-- The application attaches the request's current document, generated with the
-- active template of that type (or the signed copy that replaced it). It never
-- generates one just to send an email: without it, the email goes without it.
--
-- This migration only adds, for each new pair, the variable
-- `<documento>_adjunto` («sí» when that document really went attached), so the
-- text can mention it. No attachment is switched on: Administración decides.
-- Idempotent (keeps existing rows).

INSERT INTO `dual_correo_variables`
  (`clave_plantilla`, `variable`, `tipo`, `etiqueta`, `descripcion`, `ejemplo`, `fragmento`, `opcional`, `obligatoria`, `orden`)
VALUES
  ('solicitud_empresa_validada', 'convenio_adjunto', 'TEXTO', 'Convenio adjunto', '«sí» cuando el PDF del convenio va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#convenio_adjunto}}Adjuntamos el convenio.{{/convenio_adjunto}}', 1, 0, 20),
  ('documento_rechazado_empresa', 'convenio_adjunto', 'TEXTO', 'Convenio adjunto', '«sí» cuando el PDF del convenio va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#convenio_adjunto}}Adjuntamos el convenio.{{/convenio_adjunto}}', 1, 0, 20),
  ('reserva_creada_alumno', 'anexo_ii_adjunto', 'TEXTO', 'Anexo II adjunto', '«sí» cuando el Anexo II de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_ii_adjunto}}Adjuntamos el Anexo II.{{/anexo_ii_adjunto}}', 1, 0, 20),
  ('reserva_creada_alumno', 'anexo_iii_adjunto', 'TEXTO', 'Anexo III adjunto', '«sí» cuando el Anexo III de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_iii_adjunto}}Adjuntamos el Anexo III.{{/anexo_iii_adjunto}}', 1, 0, 21),
  ('reserva_creada_empresa', 'anexo_ii_adjunto', 'TEXTO', 'Anexo II adjunto', '«sí» cuando el Anexo II de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_ii_adjunto}}Adjuntamos el Anexo II.{{/anexo_ii_adjunto}}', 1, 0, 20),
  ('reserva_creada_empresa', 'anexo_iii_adjunto', 'TEXTO', 'Anexo III adjunto', '«sí» cuando el Anexo III de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_iii_adjunto}}Adjuntamos el Anexo III.{{/anexo_iii_adjunto}}', 1, 0, 21),
  ('reserva_confirmada_alumno', 'anexo_ii_adjunto', 'TEXTO', 'Anexo II adjunto', '«sí» cuando el Anexo II de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_ii_adjunto}}Adjuntamos el Anexo II.{{/anexo_ii_adjunto}}', 1, 0, 20),
  ('reserva_confirmada_alumno', 'anexo_iii_adjunto', 'TEXTO', 'Anexo III adjunto', '«sí» cuando el Anexo III de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_iii_adjunto}}Adjuntamos el Anexo III.{{/anexo_iii_adjunto}}', 1, 0, 21),
  ('reserva_confirmada_empresa', 'anexo_ii_adjunto', 'TEXTO', 'Anexo II adjunto', '«sí» cuando el Anexo II de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_ii_adjunto}}Adjuntamos el Anexo II.{{/anexo_ii_adjunto}}', 1, 0, 20),
  ('reserva_confirmada_empresa', 'anexo_iii_adjunto', 'TEXTO', 'Anexo III adjunto', '«sí» cuando el Anexo III de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_iii_adjunto}}Adjuntamos el Anexo III.{{/anexo_iii_adjunto}}', 1, 0, 21),
  ('documento_rechazado_reserva', 'anexo_ii_adjunto', 'TEXTO', 'Anexo II adjunto', '«sí» cuando el Anexo II de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_ii_adjunto}}Adjuntamos el Anexo II.{{/anexo_ii_adjunto}}', 1, 0, 20),
  ('documento_rechazado_reserva', 'anexo_iii_adjunto', 'TEXTO', 'Anexo III adjunto', '«sí» cuando el Anexo III de la reserva va adjunto a este correo; vacía si no. Úsala en bloques.', 'sí', '{{#anexo_iii_adjunto}}Adjuntamos el Anexo III.{{/anexo_iii_adjunto}}', 1, 0, 21)
AS nueva ON DUPLICATE KEY UPDATE `variable` = nueva.`variable`;

-- Check after applying (expected: 117):
--   SELECT COUNT(*) FROM dual_correo_variables;
