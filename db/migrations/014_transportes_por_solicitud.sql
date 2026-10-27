-- 014_transportes_por_solicitud.sql
-- Phase 2 · WF-11 / D4: transport options belong to each company application.
--
-- Until now dual_empresa_transportes held one set per company, replaced on
-- every re-application or edit, so past applications showed today's values.
--
-- Backfill without inventing history:
--   * The company's MOST RECENT application gets the current company-wide set:
--     those are the values last entered, and the last write always came from
--     that company's latest data.
--   * Every EARLIER application gets no rows and transportes_conocidos = 0,
--     shown as "No registrado" — its original values were overwritten and
--     cannot be recovered.
--   * New applications are created with transportes_conocidos = 1.
-- dual_empresa_transportes is kept untouched (read by nothing after this
-- release) so the rollback can restore it; remove it in a later migration.
--
-- Rollback: db/rollback/014_transportes_por_solicitud.down.sql

CREATE TABLE IF NOT EXISTS `dual_solicitud_empresa_transportes` (
  `id_solicitud_empresa` int NOT NULL,
  `id_transporte` tinyint unsigned NOT NULL,
  PRIMARY KEY (`id_solicitud_empresa`, `id_transporte`),
  KEY `ix_dset_transporte` (`id_transporte`),
  CONSTRAINT `fk_dset_solicitud` FOREIGN KEY (`id_solicitud_empresa`)
    REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dset_transporte` FOREIGN KEY (`id_transporte`)
    REFERENCES `dual_transportes` (`id_transporte`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `dual_solicitudes_empresa`
  ADD COLUMN `transportes_conocidos` tinyint(1) NOT NULL DEFAULT '1' AFTER `motivo`,
  ADD CONSTRAINT `chk_dse_transportes_conocidos` CHECK (`transportes_conocidos` IN (0, 1));

DROP TEMPORARY TABLE IF EXISTS `tmp_014_ultima`;
CREATE TEMPORARY TABLE `tmp_014_ultima` (
  `id_empresa` int NOT NULL PRIMARY KEY,
  `id_solicitud_empresa` int NOT NULL
);

-- Latest application per company: newest fecha_solicitud, then highest id
-- (the same order reapply uses to pick the previous application).
INSERT INTO `tmp_014_ultima` (`id_empresa`, `id_solicitud_empresa`)
SELECT x.id_empresa, x.id_solicitud_empresa
  FROM (
    SELECT se.id_empresa, se.id_solicitud_empresa,
           ROW_NUMBER() OVER (PARTITION BY se.id_empresa
                              ORDER BY se.fecha_solicitud DESC, se.id_solicitud_empresa DESC) AS rn
      FROM dual_solicitudes_empresa se
  ) x
 WHERE x.rn = 1;

INSERT IGNORE INTO `dual_solicitud_empresa_transportes` (`id_solicitud_empresa`, `id_transporte`)
SELECT u.id_solicitud_empresa, det.id_transporte
  FROM tmp_014_ultima u
  JOIN dual_empresa_transportes det ON det.id_empresa = u.id_empresa;

UPDATE dual_solicitudes_empresa se
  LEFT JOIN tmp_014_ultima u ON u.id_solicitud_empresa = se.id_solicitud_empresa
   SET se.transportes_conocidos = 0
 WHERE u.id_solicitud_empresa IS NULL;

DROP TEMPORARY TABLE IF EXISTS `tmp_014_ultima`;
