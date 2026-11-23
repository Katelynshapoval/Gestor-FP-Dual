-- Puts the «Convenio» contract type back (id 3, as in the baseline).
INSERT IGNORE INTO `dual_tipos_contrato` (`id_tipo_contrato`, `nombre`, `nombre_mostrar`)
VALUES (3, 'CONVENIO', 'Convenio');
-- Reservations moved to Contrato de formación en alternancia stay there (demo data).
