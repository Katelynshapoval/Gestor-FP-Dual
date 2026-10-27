-- Rollback of 014_transportes_por_solicitud.sql
-- Deploy the previous backend first (it reads dual_empresa_transportes).
-- Changes made after 014 exist only in dual_solicitud_empresa_transportes, so
-- the company-wide table is refreshed from each company's latest application
-- that has known transports before the new table is dropped.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '014';

DROP TEMPORARY TABLE IF EXISTS `tmp_014_ultima`;
CREATE TEMPORARY TABLE `tmp_014_ultima` (
  `id_empresa` int NOT NULL PRIMARY KEY,
  `id_solicitud_empresa` int NOT NULL
);
INSERT INTO `tmp_014_ultima` (`id_empresa`, `id_solicitud_empresa`)
SELECT x.id_empresa, x.id_solicitud_empresa
  FROM (
    SELECT se.id_empresa, se.id_solicitud_empresa,
           ROW_NUMBER() OVER (PARTITION BY se.id_empresa
                              ORDER BY se.fecha_solicitud DESC, se.id_solicitud_empresa DESC) AS rn
      FROM dual_solicitudes_empresa se
     WHERE se.transportes_conocidos = 1
  ) x
 WHERE x.rn = 1;

DELETE det FROM dual_empresa_transportes det
  JOIN tmp_014_ultima u ON u.id_empresa = det.id_empresa;

INSERT IGNORE INTO dual_empresa_transportes (id_empresa, id_transporte)
SELECT u.id_empresa, t.id_transporte
  FROM tmp_014_ultima u
  JOIN dual_solicitud_empresa_transportes t ON t.id_solicitud_empresa = u.id_solicitud_empresa;

DROP TEMPORARY TABLE IF EXISTS `tmp_014_ultima`;

DROP TABLE IF EXISTS `dual_solicitud_empresa_transportes`;

ALTER TABLE `dual_solicitudes_empresa`
  DROP CHECK `chk_dse_transportes_conocidos`;
ALTER TABLE `dual_solicitudes_empresa`
  DROP COLUMN `transportes_conocidos`;
