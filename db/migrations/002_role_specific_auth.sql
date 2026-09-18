-- 002_role_specific_auth.sql
-- Versioned additive migration (follows db/after_schema_patch.sql).
-- Role-specific authentication:
--   ADMINISTRADOR / COORDINADOR → dual_usuarios.email
--   EMPRESA                      → ge_empresas.cif (via contacto)
--   ALUMNO                       → gf_alumnosfct.dni (via id_alumno)
-- Does not drop or recreate existing tables.
--
-- If the unique CIF step fails, resolve duplicates with this audit query
-- and re-run the migration. Do NOT merge or delete companies silently.
--
--   SELECT UPPER(TRIM(cif)) AS cif_norm,
--          COUNT(*) AS n,
--          GROUP_CONCAT(idempresa ORDER BY idempresa) AS ids,
--          GROUP_CONCAT(cif ORDER BY idempresa) AS cifs,
--          GROUP_CONCAT(empresa ORDER BY idempresa SEPARATOR ' | ') AS empresas
--     FROM ge_empresas
--    GROUP BY UPPER(TRIM(cif))
--   HAVING n > 1;

USE `proyecto_dual`;

-- Visible audit result set for operators (empty when there are no duplicates).
SELECT UPPER(TRIM(cif)) AS cif_norm,
       COUNT(*) AS n,
       GROUP_CONCAT(idempresa ORDER BY idempresa) AS ids,
       GROUP_CONCAT(cif ORDER BY idempresa) AS cifs,
       GROUP_CONCAT(empresa ORDER BY idempresa SEPARATOR ' | ') AS empresas
  FROM ge_empresas
 GROUP BY UPPER(TRIM(cif))
HAVING n > 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ALUMNO role
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `dual_roles` (`nombre`) VALUES ('ALUMNO');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dual_usuarios: nullable login email + optional student link
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `dual_usuarios`
  MODIFY COLUMN `email` varchar(100) NULL;

SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'dual_usuarios'
     AND COLUMN_NAME = 'id_alumno'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `dual_usuarios` ADD COLUMN `id_alumno` int DEFAULT NULL AFTER `id_contacto`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'dual_usuarios'
     AND CONSTRAINT_NAME = 'fk_dual_usuarios_alumno'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `dual_usuarios` ADD CONSTRAINT `fk_dual_usuarios_alumno` FOREIGN KEY (`id_alumno`) REFERENCES `gf_alumnosfct` (`idalumno`) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @uq_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'dual_usuarios'
     AND INDEX_NAME = 'uq_dual_usuarios_alumno'
);
SET @sql := IF(
  @uq_exists = 0,
  'ALTER TABLE `dual_usuarios` ADD UNIQUE KEY `uq_dual_usuarios_alumno` (`id_alumno`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Existing EMPRESA accounts must not keep a login email.
-- Contact emails remain in ge_contactos / ge_empresas.
UPDATE `dual_usuarios` u
  JOIN `dual_roles` r ON r.id_rol = u.id_rol
   SET u.email = NULL
 WHERE r.nombre = 'EMPRESA'
   AND u.email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Integrity triggers on dual_usuarios
-- EMPRESA  → id_contacto required, id_alumno forbidden
-- ALUMNO   → id_alumno required, id_contacto forbidden
-- Staff    → non-null email (existing admin/coordinator accounts keep working)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bi_empresa_contacto`;
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bu_empresa_contacto`;
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bi_role_links`;
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bu_role_links`;

DELIMITER $$

CREATE TRIGGER `trg_dual_usuarios_bi_role_links`
BEFORE INSERT ON `dual_usuarios`
FOR EACH ROW
BEGIN
  DECLARE v_rol VARCHAR(40) DEFAULT NULL;
  SELECT nombre INTO v_rol FROM dual_roles WHERE id_rol = NEW.id_rol;

  IF v_rol = 'EMPRESA' THEN
    IF NEW.id_contacto IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario EMPRESA debe estar vinculado a un contacto de empresa.';
    END IF;
    IF NEW.id_alumno IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario EMPRESA no puede estar vinculado a un alumno.';
    END IF;
  ELSEIF v_rol = 'ALUMNO' THEN
    IF NEW.id_alumno IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ALUMNO debe estar vinculado a un alumno.';
    END IF;
    IF NEW.id_contacto IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ALUMNO no puede estar vinculado a un contacto de empresa.';
    END IF;
  ELSEIF v_rol IN ('ADMINISTRADOR', 'COORDINADOR') THEN
    IF NEW.email IS NULL OR TRIM(NEW.email) = '' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ADMINISTRADOR/COORDINADOR requiere un email de acceso.';
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_dual_usuarios_bu_role_links`
BEFORE UPDATE ON `dual_usuarios`
FOR EACH ROW
BEGIN
  DECLARE v_rol VARCHAR(40) DEFAULT NULL;
  SELECT nombre INTO v_rol FROM dual_roles WHERE id_rol = NEW.id_rol;

  IF v_rol = 'EMPRESA' THEN
    IF NEW.id_contacto IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario EMPRESA debe estar vinculado a un contacto de empresa.';
    END IF;
    IF NEW.id_alumno IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario EMPRESA no puede estar vinculado a un alumno.';
    END IF;
  ELSEIF v_rol = 'ALUMNO' THEN
    IF NEW.id_alumno IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ALUMNO debe estar vinculado a un alumno.';
    END IF;
    IF NEW.id_contacto IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ALUMNO no puede estar vinculado a un contacto de empresa.';
    END IF;
  ELSEIF v_rol IN ('ADMINISTRADOR', 'COORDINADOR') THEN
    IF NEW.email IS NULL OR TRIM(NEW.email) = '' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ADMINISTRADOR/COORDINADOR requiere un email de acceso.';
    END IF;
  END IF;
END$$

DELIMITER ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CIF as a genuine unique company identifier
-- Guard: abort if duplicate normalized CIFs exist. Do not merge/delete.
-- ─────────────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_002_ensure_unique_cif`;
DELIMITER $$
CREATE PROCEDURE `sp_002_ensure_unique_cif`()
BEGIN
  DECLARE v_dups INT DEFAULT 0;

  SELECT COUNT(*) INTO v_dups
    FROM (
      SELECT 1
        FROM ge_empresas
       GROUP BY UPPER(TRIM(cif))
      HAVING COUNT(*) > 1
    ) d;

  IF v_dups > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'CIFs duplicados en ge_empresas. Ejecute la consulta de auditoria de 002_role_specific_auth.sql.';
  END IF;

  UPDATE ge_empresas
     SET cif = UPPER(TRIM(cif))
   WHERE cif <> UPPER(TRIM(cif));
END$$
DELIMITER ;

CALL `sp_002_ensure_unique_cif`();
DROP PROCEDURE IF EXISTS `sp_002_ensure_unique_cif`;

SET @idx_old := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ge_empresas'
     AND INDEX_NAME = 'ix_ge_empresas_cif'
);
SET @sql := IF(
  @idx_old > 0,
  'ALTER TABLE `ge_empresas` DROP INDEX `ix_ge_empresas_cif`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_uq := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ge_empresas'
     AND INDEX_NAME = 'uq_ge_empresas_cif'
);
SET @sql := IF(
  @idx_uq = 0,
  'ALTER TABLE `ge_empresas` ADD UNIQUE KEY `uq_ge_empresas_cif` (`cif`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
