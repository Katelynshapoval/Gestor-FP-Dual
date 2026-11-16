-- 028_limpieza_bd.sql
-- Database review of 2026-11-16: remove what nothing uses, keep one copy of
-- each rule, and stop storing files nobody reads. Protected tables (ge_*,
-- gf_*) and `calendario` are not touched.
--
-- 1. Views. None of the three views was read by the application, and they ran
--    with their creator's rights over student data: dropped. One new view,
--    vw_plazas_oferta, replaces fn_reservas_activas / fn_cupos_disponibles
--    (three COUNT queries per offer row) with one index range read per offer;
--    the backend reads every place count from it. SQL SECURITY INVOKER: it
--    runs with the rights of whoever queries it.
-- 2. Unused objects dropped: sp_activar_convocatoria (it opened its own
--    transaction, committing the caller's), sp_asignar_transporte_empresa and
--    its table dual_empresa_transportes (transports belong to each application
--    since 014), and dual_documento_versiones: sp_guardar_documento copied the
--    previous file there on every upload and nothing ever read it.
--    The guard stops before changing anything if either table has rows
--    (decision D4: export first).
-- 3. One active convocatoria: a unique generated column, like the other
--    "at most one" rules, instead of two triggers that counted rows (two
--    simultaneous saves could both pass the count).
-- 4. Triggers: each insert/update pair shared its rules by copy. The rules now
--    live once, in sp_regla_* procedures that both triggers call. Inserts also
--    check now that `motivo` is only kept on a rejected row (updates already did).
-- 5. Required documents come from dual_tipos_documento (requerido, ambito,
--    familia_contrato, activo) in sp_validar_solicitud_alumno,
--    sp_validar_solicitud_empresa and sp_confirmar_reserva, instead of the
--    names CV / ANEXO_DGA / CONVENIO / ANEXO_II / ANEXO_III written in them.
--    For the 13 system types nothing changes (their `requerido` matches
--    documentCatalogue.js); a required type added by the centre is now also
--    enforced by the database.
-- 6. dual_documentos.estado_workflow only takes the values the backend writes.
-- 7. Redundant indexes dropped: two of dual_empresa_tutores (the unique key on
--    (id_empresa, id_contacto) serves the foreign key; `activo` has two values)
--    and ix_plantilla_tipo (uq_plantilla_tipo_version starts with the same column).
-- 8. Messages: accents fixed (cancelación, reasignación, está).
--
-- Requires the backend of this migration (it reads vw_plazas_oferta).
-- Rollback: db/rollback/028_limpieza_bd.down.sql.

-- ── 0. Guard: stops before any change ───────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_028_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_028_comprobar`()
BEGIN
  DECLARE v_n INT DEFAULT 0;

  -- vw_plazas_oferta and the generated keys use the fixed ids (018).
  IF fn_id_estado_reserva('PENDIENTE') <> 1 OR fn_id_estado_reserva('CONFIRMADA') <> 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '028: los ids de dual_estados_reserva no son PENDIENTE=1, CONFIRMADA=2. No se ha cambiado nada.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'dual_documento_versiones') THEN
    SELECT COUNT(*) INTO v_n FROM `dual_documento_versiones`;
    IF v_n > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '028: dual_documento_versiones tiene filas. Expórtalas antes (D4). No se ha cambiado nada.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'dual_empresa_transportes') THEN
    SELECT COUNT(*) INTO v_n FROM `dual_empresa_transportes`;
    IF v_n > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '028: dual_empresa_transportes tiene filas. Expórtalas antes (D4). No se ha cambiado nada.';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_n FROM `dual_convocatorias` WHERE `activa` = 1;
  IF v_n > 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '028: hay más de una convocatoria activa. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n FROM `dual_documentos`
   WHERE `estado_workflow` IS NOT NULL AND `estado_workflow` NOT IN ('SUBIDO', 'SUBIDO_FIRMADO');
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '028: hay documentos con un estado_workflow desconocido. No se ha cambiado nada.';
  END IF;
END$$
DELIMITER ;

CALL `sp_028_comprobar`();
DROP PROCEDURE IF EXISTS `sp_028_comprobar`;

-- ── 1. Views ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS `vw_alumnos_disponibles`;
DROP VIEW IF EXISTS `vw_cupos_empresa_disponibles`;
DROP VIEW IF EXISTS `vw_reservas_detalle`;

-- Places of each offer. A reservation takes a place while PENDIENTE (1) or
-- CONFIRMADA (2). The LATERAL table reads ix_dual_reservas_oferta_estado once
-- per offer; the view merges into the caller's query, so a filter on the offer
-- reaches the index.
CREATE OR REPLACE ALGORITHM=MERGE SQL SECURITY INVOKER VIEW `vw_plazas_oferta` AS
SELECT ee.`id_solicitud_empresa_especialidad`,
       ee.`cantidad_alumnos` AS `plazas_ofertadas`,
       r.`pendientes` AS `plazas_pendientes`,
       r.`confirmadas` AS `plazas_confirmadas`,
       r.`pendientes` + r.`confirmadas` AS `plazas_ocupadas`,
       GREATEST(CAST(ee.`cantidad_alumnos` AS SIGNED) - r.`pendientes` - r.`confirmadas`, 0) AS `plazas_disponibles`
  FROM `dual_solicitud_empresa_especialidades` ee
  CROSS JOIN LATERAL (
        SELECT COUNT(CASE WHEN x.`id_estado_reserva` = 1 THEN 1 END) AS `pendientes`,
               COUNT(CASE WHEN x.`id_estado_reserva` = 2 THEN 1 END) AS `confirmadas`
          FROM `dual_reservas` x
         WHERE x.`id_solicitud_empresa_especialidad` = ee.`id_solicitud_empresa_especialidad`
           AND x.`id_estado_reserva` IN (1, 2)) r;

DROP FUNCTION IF EXISTS `fn_cupos_disponibles`;
DROP FUNCTION IF EXISTS `fn_reservas_activas`;

-- ── 2. Unused objects ────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_activar_convocatoria`;
DROP PROCEDURE IF EXISTS `sp_asignar_transporte_empresa`;
DROP TABLE IF EXISTS `dual_empresa_transportes`;
DROP TABLE IF EXISTS `dual_documento_versiones`;

-- ── 3. One active convocatoria ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS `trg_convocatorias_bi_una_activa`;
DROP TRIGGER IF EXISTS `trg_convocatorias_bu_una_activa`;
ALTER TABLE `dual_convocatorias`
  ADD COLUMN `activa_unica` tinyint GENERATED ALWAYS AS (if(`activa` = 1, 1, NULL)) STORED,
  ADD UNIQUE KEY `uq_dual_convocatorias_una_activa` (`activa_unica`),
  DROP INDEX `ix_dual_convocatorias_activa`;

-- ── 6. estado_workflow ───────────────────────────────────────────────────────
ALTER TABLE `dual_documentos`
  ADD CONSTRAINT `chk_dd_estado_workflow`
    CHECK (`estado_workflow` IS NULL OR `estado_workflow` IN ('SUBIDO', 'SUBIDO_FIRMADO'));

-- ── 7. Indexes ───────────────────────────────────────────────────────────────
ALTER TABLE `dual_empresa_tutores`
  DROP INDEX `ix_dual_empresa_tutores_empresa`,
  DROP INDEX `ix_dual_empresa_tutores_activo`;
ALTER TABLE `dual_documento_plantillas`
  DROP INDEX `ix_plantilla_tipo`;

-- ── 4. Rules shared by each trigger pair ─────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_regla_motivo`;
DROP PROCEDURE IF EXISTS `sp_regla_documento`;
DROP PROCEDURE IF EXISTS `sp_regla_solicitud_empresa`;
DROP PROCEDURE IF EXISTS `sp_regla_usuario`;
DELIMITER $$

-- A reason is required on a rejected row and kept only there.
CREATE PROCEDURE `sp_regla_motivo`(
  IN p_rechazado TINYINT,
  IN p_motivo TEXT,
  IN p_msg_requiere VARCHAR(128),
  IN p_msg_solo VARCHAR(128)
)
BEGIN
  IF p_rechazado AND (p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = p_msg_requiere;
  END IF;
  IF NOT p_rechazado AND p_motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = p_msg_solo;
  END IF;
END$$

-- dual_documentos: exactly one parent (also chk_dd_un_padre, which MySQL
-- checks after the trigger: this one gives the readable message), the parent
-- its type belongs to, and the reason of a rejection.
CREATE PROCEDURE `sp_regla_documento`(
  IN p_id_solicitud_alumno INT,
  IN p_id_solicitud_empresa INT,
  IN p_id_reserva INT,
  IN p_id_tipo_documento TINYINT UNSIGNED,
  IN p_id_estado_validacion TINYINT UNSIGNED,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_ambito VARCHAR(20) DEFAULT NULL;

  IF (p_id_solicitud_alumno IS NOT NULL) + (p_id_solicitud_empresa IS NOT NULL) + (p_id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  SELECT `ambito` INTO v_ambito FROM `dual_tipos_documento` WHERE `id_tipo_documento` = p_id_tipo_documento;
  IF (v_ambito = 'solicitud_alumno' AND p_id_solicitud_alumno IS NULL)
     OR (v_ambito = 'solicitud_empresa' AND p_id_solicitud_empresa IS NULL)
     OR (v_ambito = 'reserva' AND p_id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  CALL `sp_regla_motivo`(p_id_estado_validacion = fn_id_estado_validacion('RECHAZADO'), p_motivo,
    'Un documento rechazado requiere motivo.',
    'El motivo solo se guarda cuando un documento es rechazado.');
END$$

-- dual_solicitudes_empresa: contacts and addresses of the same company, and
-- the reason of a rejection.
CREATE PROCEDURE `sp_regla_solicitud_empresa`(
  IN p_id_empresa INT,
  IN p_id_representante_legal INT,
  IN p_id_coordinador_empresa INT,
  IN p_id_domicilio_legal INT,
  IN p_id_domicilio_trabajo INT,
  IN p_id_estado_validacion TINYINT UNSIGNED,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_otras INT DEFAULT 0;

  SELECT (SELECT COUNT(*) FROM `ge_contactos` c JOIN `ge_domicilios` d ON d.`iddomicilio` = c.`iddomicilio`
           WHERE c.`idcontacto` IN (p_id_representante_legal, p_id_coordinador_empresa)
             AND d.`idempresa` <> p_id_empresa)
       + (SELECT COUNT(*) FROM `ge_domicilios`
           WHERE `iddomicilio` IN (p_id_domicilio_legal, p_id_domicilio_trabajo)
             AND `idempresa` <> p_id_empresa)
    INTO v_otras;
  IF v_otras > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Contactos y domicilios deben pertenecer a la misma empresa de la solicitud.';
  END IF;

  CALL `sp_regla_motivo`(p_id_estado_validacion = fn_id_estado_validacion('RECHAZADO'), p_motivo,
    'Una solicitud de empresa rechazada requiere motivo.',
    'El motivo solo se guarda cuando la solicitud de empresa es rechazada.');
END$$

-- dual_usuarios: each role is linked to what it needs and nothing else.
CREATE PROCEDURE `sp_regla_usuario`(
  IN p_id_rol TINYINT UNSIGNED,
  IN p_id_contacto INT,
  IN p_id_alumno INT,
  IN p_email VARCHAR(100)
)
BEGIN
  DECLARE v_rol VARCHAR(40) DEFAULT NULL;
  SELECT `nombre` INTO v_rol FROM `dual_roles` WHERE `id_rol` = p_id_rol;

  IF v_rol = 'EMPRESA' THEN
    IF p_id_contacto IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario EMPRESA debe estar vinculado a un contacto de empresa.';
    END IF;
    IF p_id_alumno IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario EMPRESA no puede estar vinculado a un alumno.';
    END IF;
  ELSEIF v_rol = 'ALUMNO' THEN
    IF p_id_alumno IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ALUMNO debe estar vinculado a un alumno.';
    END IF;
    IF p_id_contacto IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ALUMNO no puede estar vinculado a un contacto de empresa.';
    END IF;
  ELSEIF v_rol IN ('ADMINISTRADOR', 'COORDINADOR') THEN
    IF p_email IS NULL OR TRIM(p_email) = '' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un usuario ADMINISTRADOR o COORDINADOR necesita un email de acceso.';
    END IF;
  END IF;
END$$
DELIMITER ;

-- ── 4. Triggers ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS `trg_dd_bi_reglas`;
DROP TRIGGER IF EXISTS `trg_dd_bu_reglas`;
DROP TRIGGER IF EXISTS `trg_dsa_bi_reglas`;
DROP TRIGGER IF EXISTS `trg_dsa_bu_reglas`;
DROP TRIGGER IF EXISTS `trg_dse_bi_reglas`;
DROP TRIGGER IF EXISTS `trg_dse_bu_reglas`;
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bi_role_links`;
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bu_role_links`;
DELIMITER $$

CREATE TRIGGER `trg_dd_bi_reglas` BEFORE INSERT ON `dual_documentos` FOR EACH ROW
BEGIN
  CALL `sp_regla_documento`(NEW.id_solicitud_alumno, NEW.id_solicitud_empresa, NEW.id_reserva,
                            NEW.id_tipo_documento, NEW.id_estado_validacion, NEW.motivo);
END$$

CREATE TRIGGER `trg_dd_bu_reglas` BEFORE UPDATE ON `dual_documentos` FOR EACH ROW
BEGIN
  CALL `sp_regla_documento`(NEW.id_solicitud_alumno, NEW.id_solicitud_empresa, NEW.id_reserva,
                            NEW.id_tipo_documento, NEW.id_estado_validacion, NEW.motivo);
END$$

CREATE TRIGGER `trg_dsa_bi_reglas` BEFORE INSERT ON `dual_solicitudes_alumno` FOR EACH ROW
BEGIN
  DECLARE v_activa TINYINT DEFAULT 0;

  -- Checked here (before NOT NULL) so the caller gets a readable message.
  IF NEW.id_especialidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno debe indicar la especialidad.';
  END IF;

  SELECT `activa` INTO v_activa FROM `dual_convocatorias` WHERE `id_convocatoria` = NEW.id_convocatoria;
  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;

  CALL `sp_regla_motivo`(NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO'), NEW.motivo,
    'Una solicitud de alumno rechazada requiere motivo.',
    'El motivo solo se guarda cuando la solicitud de alumno es rechazada.');
END$$

CREATE TRIGGER `trg_dsa_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_alumno` FOR EACH ROW
BEGIN
  DECLARE v_activas INT DEFAULT 0;

  CALL `sp_regla_motivo`(NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO'), NEW.motivo,
    'Una solicitud de alumno rechazada requiere motivo.',
    'El motivo solo se guarda cuando la solicitud de alumno es rechazada.');

  -- Active reservations were checked against this ciclo (trg_dr_bi_reglas).
  IF NOT (NEW.id_especialidad <=> OLD.id_especialidad) THEN
    SELECT COUNT(*) INTO v_activas
      FROM `dual_reservas`
     WHERE `id_solicitud_alumno` = OLD.id_solicitud_alumno
       AND `id_estado_reserva` IN (1, 2);
    IF v_activas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No se puede cambiar la especialidad de una solicitud con reservas activas.';
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_dse_bi_reglas` BEFORE INSERT ON `dual_solicitudes_empresa` FOR EACH ROW
BEGIN
  DECLARE v_activa TINYINT DEFAULT 0;

  CALL `sp_regla_solicitud_empresa`(NEW.id_empresa, NEW.id_representante_legal, NEW.id_coordinador_empresa,
                                    NEW.id_domicilio_legal, NEW.id_domicilio_trabajo,
                                    NEW.id_estado_validacion, NEW.motivo);

  SELECT `activa` INTO v_activa FROM `dual_convocatorias` WHERE `id_convocatoria` = NEW.id_convocatoria;
  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;
END$$

CREATE TRIGGER `trg_dse_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_empresa` FOR EACH ROW
BEGIN
  CALL `sp_regla_solicitud_empresa`(NEW.id_empresa, NEW.id_representante_legal, NEW.id_coordinador_empresa,
                                    NEW.id_domicilio_legal, NEW.id_domicilio_trabajo,
                                    NEW.id_estado_validacion, NEW.motivo);
END$$

CREATE TRIGGER `trg_dual_usuarios_bi_role_links` BEFORE INSERT ON `dual_usuarios` FOR EACH ROW
BEGIN
  CALL `sp_regla_usuario`(NEW.id_rol, NEW.id_contacto, NEW.id_alumno, NEW.email);
END$$

CREATE TRIGGER `trg_dual_usuarios_bu_role_links` BEFORE UPDATE ON `dual_usuarios` FOR EACH ROW
BEGIN
  CALL `sp_regla_usuario`(NEW.id_rol, NEW.id_contacto, NEW.id_alumno, NEW.email);
END$$
DELIMITER ;

-- ── 2 + 5. Procedures ────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_guardar_documento`;
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_alumno`;
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_empresa`;
DROP PROCEDURE IF EXISTS `sp_confirmar_reserva`;
DELIMITER $$

-- Stores the file of a document: replaces the current one of that type and
-- parent (back to PENDIENTE) or inserts it. The previous file is not kept.
CREATE PROCEDURE `sp_guardar_documento`(
  IN p_id_solicitud_alumno  INT,
  IN p_id_solicitud_empresa INT,
  IN p_id_reserva           INT,
  IN p_id_tipo_documento    INT,
  IN p_archivo              LONGBLOB
)
BEGIN
  DECLARE v_id INT DEFAULT NULL;

  -- One branch per parent, so each lookup (and its lock) uses that parent's index.
  IF p_id_solicitud_alumno IS NOT NULL THEN
    SELECT `id_documento` INTO v_id FROM `dual_documentos`
     WHERE `id_solicitud_alumno` = p_id_solicitud_alumno
       AND `id_tipo_documento` = p_id_tipo_documento AND `es_actual` = 1
     ORDER BY `id_documento` DESC LIMIT 1
     FOR UPDATE;
  ELSEIF p_id_solicitud_empresa IS NOT NULL THEN
    SELECT `id_documento` INTO v_id FROM `dual_documentos`
     WHERE `id_solicitud_empresa` = p_id_solicitud_empresa
       AND `id_tipo_documento` = p_id_tipo_documento AND `es_actual` = 1
     ORDER BY `id_documento` DESC LIMIT 1
     FOR UPDATE;
  ELSEIF p_id_reserva IS NOT NULL THEN
    SELECT `id_documento` INTO v_id FROM `dual_documentos`
     WHERE `id_reserva` = p_id_reserva
       AND `id_tipo_documento` = p_id_tipo_documento AND `es_actual` = 1
     ORDER BY `id_documento` DESC LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE `dual_documentos`
       SET `archivo` = p_archivo,
           `id_estado_validacion` = fn_id_estado_validacion('PENDIENTE'),
           `motivo` = NULL,
           `estado_workflow` = 'SUBIDO'
     WHERE `id_documento` = v_id;
    SELECT v_id AS id_documento;
  ELSE
    INSERT INTO `dual_documentos`
      (`id_solicitud_alumno`, `id_solicitud_empresa`, `id_reserva`, `id_tipo_documento`, `archivo`,
       `id_estado_validacion`, `estado_workflow`, `es_actual`, `origen_documento`)
    VALUES (p_id_solicitud_alumno, p_id_solicitud_empresa, p_id_reserva, p_id_tipo_documento, p_archivo,
            fn_id_estado_validacion('PENDIENTE'), 'SUBIDO', 1, 'LEGACY');
    SELECT LAST_INSERT_ID() AS id_documento;
  END IF;
END$$

-- Every active required type of the student application must have a current,
-- validated document.
CREATE PROCEDURE `sp_validar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT
)
BEGIN
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_faltan VARCHAR(500) DEFAULT NULL;
  DECLARE v_msg VARCHAR(128);

  SET v_validado = fn_id_estado_validacion('VALIDADO');

  SELECT GROUP_CONCAT(td.`nombre_mostrar` ORDER BY td.`orden` SEPARATOR ', ') INTO v_faltan
    FROM `dual_tipos_documento` td
   WHERE td.`ambito` = 'solicitud_alumno' AND td.`requerido` = 1 AND td.`activo` = 1
     AND NOT EXISTS (SELECT 1 FROM `dual_documentos` d
                      WHERE d.`id_solicitud_alumno` = p_id_solicitud_alumno
                        AND d.`id_tipo_documento` = td.`id_tipo_documento`
                        AND d.`es_actual` = 1
                        AND d.`id_estado_validacion` = v_validado);
  IF v_faltan IS NOT NULL THEN
    SET v_msg = LEFT(CONCAT('Para validar al alumno faltan por validar: ', v_faltan, '.'), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  UPDATE `dual_solicitudes_alumno`
     SET `id_estado_validacion` = v_validado,
         `motivo` = NULL
   WHERE `id_solicitud_alumno` = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$

-- Every active required type of the company application must have a current,
-- validated document, and the company must ask for at least one ciclo.
CREATE PROCEDURE `sp_validar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT
)
BEGIN
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_faltan VARCHAR(500) DEFAULT NULL;
  DECLARE v_msg VARCHAR(128);
  DECLARE v_especialidades INT DEFAULT 0;

  SET v_validado = fn_id_estado_validacion('VALIDADO');

  SELECT GROUP_CONCAT(td.`nombre_mostrar` ORDER BY td.`orden` SEPARATOR ', ') INTO v_faltan
    FROM `dual_tipos_documento` td
   WHERE td.`ambito` = 'solicitud_empresa' AND td.`requerido` = 1 AND td.`activo` = 1
     AND NOT EXISTS (SELECT 1 FROM `dual_documentos` d
                      WHERE d.`id_solicitud_empresa` = p_id_solicitud_empresa
                        AND d.`id_tipo_documento` = td.`id_tipo_documento`
                        AND d.`es_actual` = 1
                        AND d.`id_estado_validacion` = v_validado);
  IF v_faltan IS NOT NULL THEN
    SET v_msg = LEFT(CONCAT('Para validar la empresa faltan por validar: ', v_faltan, '.'), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  SELECT COUNT(*) INTO v_especialidades
    FROM `dual_solicitud_empresa_especialidades`
   WHERE `id_solicitud_empresa` = p_id_solicitud_empresa;
  IF v_especialidades = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La empresa debe solicitar al menos una especialidad.';
  END IF;

  UPDATE `dual_solicitudes_empresa`
     SET `id_estado_validacion` = v_validado,
         `motivo` = NULL
   WHERE `id_solicitud_empresa` = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$

CREATE PROCEDURE `sp_confirmar_reserva`(
  IN p_id_reserva INT,
  IN p_id_tipo_contrato TINYINT UNSIGNED
)
BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_solicitud_alumno INT DEFAULT NULL;
  DECLARE v_estado_reserva TINYINT DEFAULT NULL;
  DECLARE v_tipo_contrato TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_nombre_contrato VARCHAR(100) DEFAULT NULL;
  DECLARE v_familia VARCHAR(10) DEFAULT NULL;
  DECLARE v_faltan VARCHAR(500) DEFAULT NULL;
  DECLARE v_msg VARCHAR(128);
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF @@autocommit = 1 THEN
    SIGNAL SQLSTATE '45001'
      SET MESSAGE_TEXT = 'sp_confirmar_reserva debe ejecutarse dentro de una transacción (autocommit = 0).';
  END IF;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_validado = fn_id_estado_validacion('VALIDADO');

  -- The application id never changes on a reservation (trigger), so a plain read finds it.
  SET v_no_data = 0;
  SELECT `id_solicitud_alumno` INTO v_solicitud_alumno
    FROM `dual_reservas`
   WHERE `id_reserva` = p_id_reserva;
  IF v_no_data = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  -- Lock order: student application → the offers of this reservation and of the
  -- pending siblings it will cancel (ascending) → the student's reservations.
  -- With the application locked, no reservation of the student can be created.
  SELECT `id_solicitud_alumno` INTO v_lock
    FROM `dual_solicitudes_alumno`
   WHERE `id_solicitud_alumno` = v_solicitud_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock
    FROM (SELECT ee.`id_solicitud_empresa_especialidad`
            FROM `dual_solicitud_empresa_especialidades` ee
           WHERE ee.`id_solicitud_empresa_especialidad` IN (
                   SELECT r.`id_solicitud_empresa_especialidad`
                     FROM `dual_reservas` r
                    WHERE r.`id_solicitud_alumno` = v_solicitud_alumno
                      AND (r.`id_reserva` = p_id_reserva OR r.`id_estado_reserva` = v_pendiente))
           ORDER BY ee.`id_solicitud_empresa_especialidad`
           FOR UPDATE) x;

  SELECT COUNT(*) INTO v_lock
    FROM `dual_reservas` FORCE INDEX (`ix_dr_solicitud_alumno`)
   WHERE `id_solicitud_alumno` = v_solicitud_alumno
   FOR UPDATE;

  SELECT `id_estado_reserva`, `id_tipo_contrato`
    INTO v_estado_reserva, v_tipo_contrato
    FROM `dual_reservas`
   WHERE `id_reserva` = p_id_reserva
   FOR UPDATE;

  IF v_estado_reserva <> v_pendiente THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede confirmarse.';
  END IF;

  IF v_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Indica el tipo de contrato de la reserva antes de confirmarla.';
  END IF;

  IF p_id_tipo_contrato IS NOT NULL AND p_id_tipo_contrato <> v_tipo_contrato THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato no coincide con el registrado en la reserva.';
  END IF;

  SELECT `nombre` INTO v_nombre_contrato
    FROM `dual_tipos_contrato`
   WHERE `id_tipo_contrato` = v_tipo_contrato;

  -- Same family rule as documentCatalogue.familiaContrato.
  SET v_familia = IF(LOWER(v_nombre_contrato) LIKE '%beca%', 'beca', 'contrato');

  -- Every active required type of the reservation that applies to its contract
  -- family (or to every family) needs a current, validated file.
  SELECT GROUP_CONCAT(td.`nombre_mostrar` ORDER BY td.`orden` SEPARATOR ', ') INTO v_faltan
    FROM `dual_tipos_documento` td
    LEFT JOIN `dual_documentos` d
      ON d.`id_reserva` = p_id_reserva
     AND d.`id_tipo_documento` = td.`id_tipo_documento`
     AND d.`es_actual` = 1
     AND d.`archivo` IS NOT NULL
     AND d.`id_estado_validacion` = v_validado
   WHERE td.`ambito` = 'reserva' AND td.`requerido` = 1 AND td.`activo` = 1
     AND (td.`familia_contrato` IS NULL OR td.`familia_contrato` = v_familia)
     AND d.`id_documento` IS NULL
   FOR SHARE OF d;

  IF v_faltan IS NOT NULL THEN
    SET v_msg = LEFT(CONCAT('Para confirmar la reserva faltan firmados y validados: ', v_faltan, '.'), 128);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  UPDATE `dual_reservas`
     SET `id_estado_reserva` = fn_id_estado_reserva('CONFIRMADA'),
         `motivo` = NULL
   WHERE `id_reserva` = p_id_reserva;

  -- D5: the other pending attempts are cancelled and keep their contract type.
  UPDATE `dual_reservas`
     SET `id_estado_reserva` = fn_id_estado_reserva('CANCELADA'),
         `motivo` = 'Alumno asignado a otra empresa.'
   WHERE `id_solicitud_alumno` = v_solicitud_alumno
     AND `id_reserva` <> p_id_reserva
     AND `id_estado_reserva` = v_pendiente;
END$$
DELIMITER ;

-- ── 8. Messages ──────────────────────────────────────────────────────────────
-- Same procedures, only the accents of their messages change.
DROP PROCEDURE IF EXISTS `sp_cancelar_reserva`;
DROP PROCEDURE IF EXISTS `sp_cancelar_reserva_admin`;
DROP PROCEDURE IF EXISTS `sp_reasignar_reserva`;
DELIMITER $$
CREATE PROCEDURE `sp_cancelar_reserva`(
  IN p_id_reserva INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_estado TINYINT DEFAULT NULL;
  DECLARE v_oferta INT DEFAULT NULL;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF @@autocommit = 1 THEN
    SIGNAL SQLSTATE '45001'
      SET MESSAGE_TEXT = 'sp_cancelar_reserva debe ejecutarse dentro de una transacción (autocommit = 0).';
  END IF;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelación.';
  END IF;

  -- Lock order: the reservation's offer, then the reservation. (The offer of a
  -- reservation never changes, so a plain read finds it.)
  SET v_no_data = 0;
  SELECT id_solicitud_empresa_especialidad INTO v_oferta
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva;
  IF v_no_data = 0 THEN
    SELECT id_solicitud_empresa_especialidad INTO v_lock
      FROM dual_solicitud_empresa_especialidades
     WHERE id_solicitud_empresa_especialidad = v_oferta
     FOR UPDATE;
  END IF;

  SET v_no_data = 0;
  SELECT id_estado_reserva INTO v_estado
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_no_data = 1 OR v_estado <> fn_id_estado_reserva('PENDIENTE') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE existente puede cancelarse.';
  END IF;

  -- D5: contract type, tutor and documents stay: they describe the cancelled attempt.
  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva;
END$$

CREATE PROCEDURE `sp_cancelar_reserva_admin`(
  IN p_id_reserva INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_estado TINYINT DEFAULT NULL;
  DECLARE v_oferta INT DEFAULT NULL;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF @@autocommit = 1 THEN
    SIGNAL SQLSTATE '45001'
      SET MESSAGE_TEXT = 'sp_cancelar_reserva_admin debe ejecutarse dentro de una transacción (autocommit = 0).';
  END IF;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelación.';
  END IF;

  -- Lock order: the reservation's offer, then the reservation. (The offer of a
  -- reservation never changes, so a plain read finds it.)
  SET v_no_data = 0;
  SELECT id_solicitud_empresa_especialidad INTO v_oferta
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva;
  IF v_no_data = 0 THEN
    SELECT id_solicitud_empresa_especialidad INTO v_lock
      FROM dual_solicitud_empresa_especialidades
     WHERE id_solicitud_empresa_especialidad = v_oferta
     FOR UPDATE;
  END IF;

  SET v_no_data = 0;
  SELECT id_estado_reserva INTO v_estado
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_no_data = 1 OR v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  IF v_estado = fn_id_estado_reserva('CANCELADA') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva ya está cancelada.';
  END IF;

  IF v_estado NOT IN (fn_id_estado_reserva('PENDIENTE'), fn_id_estado_reserva('CONFIRMADA')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estado de la reserva no permite cancelación administrativa.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva;
END$$

CREATE PROCEDURE `sp_reasignar_reserva`(
  IN p_id_reserva_origen INT,
  IN p_id_oferta_destino INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_cancelada TINYINT UNSIGNED;
  DECLARE v_id_alumno INT DEFAULT NULL;
  DECLARE v_oferta_origen INT DEFAULT NULL;
  DECLARE v_estado_origen TINYINT DEFAULT NULL;
  DECLARE v_solicitud_empresa INT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT NULL;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_activas_par INT DEFAULT 0;
  DECLARE v_id_nueva INT DEFAULT NULL;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_estado_alumno TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_estado_empresa TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF @@autocommit = 1 THEN
    SIGNAL SQLSTATE '45001'
      SET MESSAGE_TEXT = 'sp_reasignar_reserva debe ejecutarse dentro de una transacción (autocommit = 0).';
  END IF;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la reasignación.';
  END IF;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');
  SET v_cancelada = fn_id_estado_reserva('CANCELADA');

  -- Application and offer of a reservation never change (trigger): plain read.
  SET v_no_data = 0;
  SELECT id_solicitud_alumno, id_solicitud_empresa_especialidad
    INTO v_id_alumno, v_oferta_origen
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva_origen;
  IF v_no_data = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva de origen no existe.';
  END IF;

  IF v_oferta_origen = p_id_oferta_destino THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La oferta de destino debe ser distinta a la actual.';
  END IF;

  -- Lock order: student application → company application → offers → reservations.
  SELECT id_estado_validacion INTO v_estado_alumno
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_id_alumno
   FOR UPDATE;

  SET v_no_data = 0;
  SELECT id_solicitud_empresa INTO v_solicitud_empresa
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino;
  IF v_no_data = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La oferta de destino no existe.';
  END IF;

  SELECT id_estado_validacion INTO v_estado_empresa
    FROM dual_solicitudes_empresa
   WHERE id_solicitud_empresa = v_solicitud_empresa
   FOR SHARE;

  -- Eligibility before places (trg_dr_bi_reglas checks it again on the insert).
  IF v_estado_alumno <> fn_id_estado_validacion('VALIDADO')
     OR v_estado_empresa <> fn_id_estado_validacion('VALIDADO') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden reservar alumnos y empresas validados.';
  END IF;

  -- Both offers (the origin's state changes, the destination gets a place), ascending.
  SELECT COUNT(*) INTO v_lock
    FROM (SELECT id_solicitud_empresa_especialidad
            FROM dual_solicitud_empresa_especialidades
           WHERE id_solicitud_empresa_especialidad IN (v_oferta_origen, p_id_oferta_destino)
           ORDER BY id_solicitud_empresa_especialidad
           FOR UPDATE) x;

  SELECT cantidad_alumnos INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock
    FROM dual_reservas FORCE INDEX (ix_dr_solicitud_alumno)
   WHERE id_solicitud_alumno = v_id_alumno
   FOR UPDATE;

  SELECT id_estado_reserva INTO v_estado_origen
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva_origen
   FOR UPDATE;

  IF v_estado_origen = v_cancelada THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede reasignar una reserva cancelada.';
  END IF;

  SELECT COUNT(*) INTO v_activas_par
    FROM dual_reservas FORCE INDEX (ix_dr_solicitud_alumno)
   WHERE id_solicitud_alumno = v_id_alumno
     AND id_solicitud_empresa_especialidad = p_id_oferta_destino
     AND id_estado_reserva IN (v_pendiente, v_confirmada)
   FOR UPDATE;

  IF v_activas_par > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva activa con esa oferta.';
  END IF;

  SELECT COUNT(*) INTO v_ocupadas
    FROM dual_reservas FORCE INDEX (ix_dual_reservas_oferta_estado)
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
     AND id_estado_reserva IN (v_pendiente, v_confirmada)
   FOR UPDATE;

  IF v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles en la oferta de destino.';
  END IF;

  -- The cancelled origin keeps its contract type, tutor and documents (D5).
  UPDATE dual_reservas
     SET id_estado_reserva = v_cancelada,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva_origen;

  INSERT INTO dual_reservas
    (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva, id_reserva_origen)
  VALUES (v_id_alumno, p_id_oferta_destino, v_pendiente, p_id_reserva_origen);
  SET v_id_nueva = LAST_INSERT_ID();

  SELECT v_id_nueva AS id_reserva, p_id_reserva_origen AS id_reserva_origen;
END$$
DELIMITER ;

-- Check after applying:
--   SELECT * FROM vw_plazas_oferta;                       -- one row per offer
--   SHOW TRIGGERS;                                        -- 13 triggers
--   SELECT COUNT(*) FROM dual_convocatorias WHERE activa_unica = 1;   -- 0 or 1
