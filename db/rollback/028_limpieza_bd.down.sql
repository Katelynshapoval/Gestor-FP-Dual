-- 028_limpieza_bd.down.sql
-- Undoes 028: brings back the three views, the two place-count functions,
-- sp_activar_convocatoria, sp_asignar_transporte_empresa, the tables
-- dual_documento_versiones and dual_empresa_transportes (empty: their rows were
-- not kept), the triggers and procedures exactly as they were in 027, the two
-- indexes of dual_empresa_tutores, ix_plantilla_tipo and the index on
-- dual_convocatorias.activa;
-- removes vw_plazas_oferta, the sp_regla_* procedures, activa_unica and
-- chk_dd_estado_workflow.
--
-- Deploy the backend of 027 first (the backend of 028 reads vw_plazas_oferta).
-- After undoing, a required type added by the centre is again checked only by
-- the backend, and sp_guardar_documento again copies each replaced file into
-- dual_documento_versiones.
-- Afterwards: DELETE FROM schema_migrations WHERE version = '028';

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dual_documento_versiones` (
  `id_version` int NOT NULL AUTO_INCREMENT,
  `id_documento` int NOT NULL,
  `archivo` longblob,
  `id_estado_validacion` int DEFAULT NULL,
  `motivo` text,
  `estado_workflow` varchar(30) DEFAULT NULL,
  `archivado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `id_usuario_origen` int DEFAULT NULL,
  `origen_documento` varchar(20) DEFAULT NULL,
  `id_plantilla` int DEFAULT NULL,
  PRIMARY KEY (`id_version`),
  KEY `ix_ddv_documento` (`id_documento`),
  CONSTRAINT `fk_dual_documento_versiones_doc` FOREIGN KEY (`id_documento`) REFERENCES `dual_documentos` (`id_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_empresa_transportes` (
  `id_empresa` int NOT NULL,
  `id_transporte` tinyint unsigned NOT NULL,
  PRIMARY KEY (`id_empresa`,`id_transporte`),
  KEY `ix_det_transporte` (`id_transporte`),
  CONSTRAINT `fk_det_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_det_transporte` FOREIGN KEY (`id_transporte`) REFERENCES `dual_transportes` (`id_transporte`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Recreated together with ix_..._contacto so the three keep their 027 order.
ALTER TABLE `dual_empresa_tutores`
  DROP INDEX `ix_dual_empresa_tutores_contacto`,
  ADD KEY `ix_dual_empresa_tutores_empresa` (`id_empresa`),
  ADD KEY `ix_dual_empresa_tutores_contacto` (`id_contacto`),
  ADD KEY `ix_dual_empresa_tutores_activo` (`activo`);

-- Recreated together with fk_plantilla_usuario so both keep their 027 order.
ALTER TABLE `dual_documento_plantillas`
  DROP INDEX `fk_plantilla_usuario`,
  ADD KEY `ix_plantilla_tipo` (`id_tipo_documento`),
  ADD KEY `fk_plantilla_usuario` (`id_usuario_subida`);

ALTER TABLE `dual_documentos` DROP CHECK `chk_dd_estado_workflow`;

ALTER TABLE `dual_convocatorias`
  ADD KEY `ix_dual_convocatorias_activa` (`activa`),
  DROP INDEX `uq_dual_convocatorias_una_activa`,
  DROP COLUMN `activa_unica`;

-- ── Functions, procedures and triggers of 027 ───────────────────────────────
DELIMITER $$
DROP FUNCTION IF EXISTS `fn_reservas_activas`$$
CREATE FUNCTION `fn_reservas_activas`(
  p_id_solicitud_empresa_especialidad INT
) RETURNS int
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_total INT DEFAULT 0;

  SELECT COUNT(*)
    INTO v_total
    FROM dual_reservas r
    JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
   WHERE r.id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
     AND er.nombre IN ('PENDIENTE', 'CONFIRMADA');

  RETURN v_total;
END$$
DROP FUNCTION IF EXISTS `fn_cupos_disponibles`$$
CREATE FUNCTION `fn_cupos_disponibles`(
  p_id_solicitud_empresa_especialidad INT
) RETURNS int
    READS SQL DATA
    DETERMINISTIC
BEGIN
  DECLARE v_cantidad INT DEFAULT 0;

  SELECT e.cantidad_alumnos
    INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades e
   WHERE e.id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad;

  RETURN GREATEST(IFNULL(v_cantidad, 0) - fn_reservas_activas(p_id_solicitud_empresa_especialidad), 0);
END$$
DROP PROCEDURE IF EXISTS `sp_activar_convocatoria`$$
CREATE PROCEDURE `sp_activar_convocatoria`(
  IN p_id_convocatoria INT
)
BEGIN
  DECLARE v_existe INT DEFAULT 0;

  SELECT COUNT(*) INTO v_existe
    FROM dual_convocatorias
   WHERE id_convocatoria = p_id_convocatoria;

  IF v_existe = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La convocatoria indicada no existe.';
  END IF;

  START TRANSACTION;
  UPDATE dual_convocatorias SET activa = 0 WHERE activa = 1;
  UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = p_id_convocatoria;
  COMMIT;
END$$
DROP PROCEDURE IF EXISTS `sp_asignar_transporte_empresa`$$
CREATE PROCEDURE `sp_asignar_transporte_empresa`(
  IN p_id_empresa INT,
  IN p_id_transporte TINYINT UNSIGNED
)
BEGIN
  INSERT IGNORE INTO dual_empresa_transportes (id_empresa, id_transporte)
  VALUES (p_id_empresa, p_id_transporte);
END$$
DROP PROCEDURE IF EXISTS `sp_guardar_documento`$$
CREATE PROCEDURE `sp_guardar_documento`(
  IN p_id_solicitud_alumno  INT,
  IN p_id_solicitud_empresa INT,
  IN p_id_reserva           INT,
  IN p_id_tipo_documento    INT,
  IN p_archivo              LONGBLOB
)
BEGIN
  DECLARE v_id INT DEFAULT NULL;

  IF p_id_solicitud_alumno IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_alumno = p_id_solicitud_alumno
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1
     FOR UPDATE;
  ELSEIF p_id_solicitud_empresa IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_empresa = p_id_solicitud_empresa
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1
     FOR UPDATE;
  ELSEIF p_id_reserva IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_reserva = p_id_reserva
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF v_id IS NOT NULL THEN
    INSERT INTO dual_documento_versiones
      (id_documento, archivo, id_estado_validacion, motivo, estado_workflow, id_usuario_origen, origen_documento, id_plantilla)
    SELECT id_documento, archivo, id_estado_validacion, motivo, estado_workflow, id_usuario_origen, origen_documento, id_plantilla
      FROM dual_documentos
     WHERE id_documento = v_id;

    UPDATE dual_documentos
       SET archivo = p_archivo,
           id_estado_validacion = (
             SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1
           ),
           motivo = NULL,
           estado_workflow = 'SUBIDO',
           es_actual = 1
     WHERE id_documento = v_id;
    SELECT v_id AS id_documento;
  ELSE
    INSERT INTO dual_documentos
      (id_solicitud_alumno, id_solicitud_empresa, id_reserva, id_tipo_documento, archivo, id_estado_validacion, estado_workflow, es_actual, origen_documento)
    VALUES (
      p_id_solicitud_alumno, p_id_solicitud_empresa, p_id_reserva,
      p_id_tipo_documento, p_archivo,
      (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1),
      'SUBIDO',
      1,
      'LEGACY'
    );
    SELECT LAST_INSERT_ID() AS id_documento;
  END IF;
END$$
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_alumno`$$
CREATE PROCEDURE `sp_validar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT
)
BEGIN
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_cv_validado INT DEFAULT 0;
  DECLARE v_anexo_validado INT DEFAULT 0;

  SET v_validado = fn_id_estado_validacion('VALIDADO');

  SELECT COUNT(*) INTO v_cv_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = fn_id_tipo_documento('CV')
     AND es_actual = 1
     AND id_estado_validacion = v_validado;

  SELECT COUNT(*) INTO v_anexo_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = fn_id_tipo_documento('ANEXO_DGA')
     AND es_actual = 1
     AND id_estado_validacion = v_validado;

  IF v_cv_validado = 0 OR v_anexo_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para validar al alumno deben estar validados el CV y el Anexo DGA.';
  END IF;

  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = v_validado,
         motivo = NULL
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_empresa`$$
CREATE PROCEDURE `sp_validar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT
)
BEGIN
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_convenio_validado INT DEFAULT 0;
  DECLARE v_especialidades INT DEFAULT 0;

  SET v_validado = fn_id_estado_validacion('VALIDADO');

  SELECT COUNT(*) INTO v_convenio_validado
    FROM dual_documentos
   WHERE id_solicitud_empresa = p_id_solicitud_empresa
     AND id_tipo_documento = fn_id_tipo_documento('CONVENIO')
     AND es_actual = 1
     AND id_estado_validacion = v_validado;

  SELECT COUNT(*) INTO v_especialidades
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF v_convenio_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para validar la empresa debe estar validado el CONVENIO.';
  END IF;

  IF v_especialidades = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La empresa debe solicitar al menos una especialidad.';
  END IF;

  UPDATE dual_solicitudes_empresa
     SET id_estado_validacion = v_validado,
         motivo = NULL
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DROP PROCEDURE IF EXISTS `sp_confirmar_reserva`$$
CREATE PROCEDURE `sp_confirmar_reserva`(
  IN p_id_reserva INT,
  IN p_id_tipo_contrato TINYINT UNSIGNED
)
BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_solicitud_alumno INT DEFAULT NULL;
  DECLARE v_estado_reserva TINYINT DEFAULT NULL;
  DECLARE v_tipo_contrato TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_nombre_contrato VARCHAR(100) DEFAULT NULL;
  DECLARE v_anexo VARCHAR(40) DEFAULT NULL;
  DECLARE v_anexo_validado INT DEFAULT 0;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF @@autocommit = 1 THEN
    SIGNAL SQLSTATE '45001'
      SET MESSAGE_TEXT = 'sp_confirmar_reserva debe ejecutarse dentro de una transacción (autocommit = 0).';
  END IF;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');

  -- The application id never changes on a reservation (trigger), so a plain read finds it.
  SET v_no_data = 0;
  SELECT id_solicitud_alumno INTO v_solicitud_alumno
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva;
  IF v_no_data = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  -- Lock order: student application → the offers of this reservation and of the
  -- pending siblings it will cancel (ascending) → the student's reservations.
  -- With the application locked, no reservation of the student can be created.
  SELECT id_solicitud_alumno INTO v_lock
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_solicitud_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock
    FROM (SELECT ee.id_solicitud_empresa_especialidad
            FROM dual_solicitud_empresa_especialidades ee
           WHERE ee.id_solicitud_empresa_especialidad IN (
                   SELECT r.id_solicitud_empresa_especialidad
                     FROM dual_reservas r
                    WHERE r.id_solicitud_alumno = v_solicitud_alumno
                      AND (r.id_reserva = p_id_reserva OR r.id_estado_reserva = v_pendiente))
           ORDER BY ee.id_solicitud_empresa_especialidad
           FOR UPDATE) x;

  SELECT COUNT(*) INTO v_lock
    FROM dual_reservas FORCE INDEX (ix_dr_solicitud_alumno)
   WHERE id_solicitud_alumno = v_solicitud_alumno
   FOR UPDATE;

  SELECT id_estado_reserva, id_tipo_contrato
    INTO v_estado_reserva, v_tipo_contrato
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
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

  SELECT nombre INTO v_nombre_contrato
    FROM dual_tipos_contrato
   WHERE id_tipo_contrato = v_tipo_contrato;

  -- Same family rule as documentCatalogue.anexoClaveForContrato.
  SET v_anexo = IF(LOWER(v_nombre_contrato) LIKE '%beca%', 'ANEXO_III', 'ANEXO_II');

  SELECT COUNT(*) INTO v_anexo_validado
    FROM dual_documentos
   WHERE id_reserva = p_id_reserva
     AND id_tipo_documento = fn_id_tipo_documento(v_anexo)
     AND es_actual = 1
     AND archivo IS NOT NULL
     AND id_estado_validacion = fn_id_estado_validacion('VALIDADO')
   FOR SHARE;

  IF v_anexo_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para confirmar la reserva el anexo del tipo de contrato debe estar firmado y validado.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CONFIRMADA'),
         motivo = NULL
   WHERE id_reserva = p_id_reserva;

  -- D5: the other pending attempts are cancelled and keep their contract type.
  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
         motivo = 'Alumno asignado a otra empresa.'
   WHERE id_solicitud_alumno = v_solicitud_alumno
     AND id_reserva <> p_id_reserva
     AND id_estado_reserva = v_pendiente;
END$$
DROP PROCEDURE IF EXISTS `sp_cancelar_reserva`$$
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
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelacion.';
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
DROP PROCEDURE IF EXISTS `sp_cancelar_reserva_admin`$$
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
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelacion.';
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
      SET MESSAGE_TEXT = 'La reserva ya esta cancelada.';
  END IF;

  IF v_estado NOT IN (fn_id_estado_reserva('PENDIENTE'), fn_id_estado_reserva('CONFIRMADA')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estado de la reserva no permite cancelacion administrativa.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = fn_id_estado_reserva('CANCELADA'),
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva;
END$$
DROP PROCEDURE IF EXISTS `sp_reasignar_reserva`$$
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
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la reasignacion.';
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
DROP TRIGGER IF EXISTS `trg_convocatorias_bi_una_activa`$$
CREATE TRIGGER `trg_convocatorias_bi_una_activa` BEFORE INSERT ON `dual_convocatorias` FOR EACH ROW BEGIN
  DECLARE v_activas INT DEFAULT 0;

  IF NEW.activa = 1 THEN
    SELECT COUNT(*) INTO v_activas FROM dual_convocatorias WHERE activa = 1;
    IF v_activas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Solo puede existir una convocatoria activa.';
    END IF;
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_convocatorias_bu_una_activa`$$
CREATE TRIGGER `trg_convocatorias_bu_una_activa` BEFORE UPDATE ON `dual_convocatorias` FOR EACH ROW BEGIN
  DECLARE v_activas INT DEFAULT 0;

  IF NEW.activa = 1 THEN
    SELECT COUNT(*) INTO v_activas
      FROM dual_convocatorias
     WHERE activa = 1
       AND id_convocatoria <> OLD.id_convocatoria;
    IF v_activas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Use sp_activar_convocatoria para cambiar la convocatoria activa.';
    END IF;
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dd_bi_reglas`$$
CREATE TRIGGER `trg_dd_bi_reglas` BEFORE INSERT ON `dual_documentos` FOR EACH ROW BEGIN
  DECLARE v_ambito VARCHAR(20) DEFAULT NULL;

  SELECT ambito INTO v_ambito
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_ambito = 'solicitud_alumno' AND NEW.id_solicitud_alumno IS NULL)
     OR (v_ambito = 'solicitud_empresa' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_ambito = 'reserva' AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dd_bu_reglas`$$
CREATE TRIGGER `trg_dd_bu_reglas` BEFORE UPDATE ON `dual_documentos` FOR EACH ROW BEGIN
  DECLARE v_ambito VARCHAR(20) DEFAULT NULL;
  DECLARE v_rechazado TINYINT UNSIGNED;

  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  SELECT ambito INTO v_ambito
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_ambito = 'solicitud_alumno' AND NEW.id_solicitud_alumno IS NULL)
     OR (v_ambito = 'solicitud_empresa' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_ambito = 'reserva' AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando un documento es rechazado.';
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dsa_bi_reglas`$$
CREATE TRIGGER `trg_dsa_bi_reglas` BEFORE INSERT ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  DECLARE v_activa TINYINT DEFAULT 0;

  SELECT activa INTO v_activa
    FROM dual_convocatorias
   WHERE id_convocatoria = NEW.id_convocatoria;

  -- Checked here (before NOT NULL) so the caller gets a readable message.
  IF NEW.id_especialidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno debe indicar la especialidad.';
  END IF;

  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;

  IF NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dsa_bu_reglas`$$
CREATE TRIGGER `trg_dsa_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  DECLARE v_rechazado TINYINT UNSIGNED;
  DECLARE v_activas INT DEFAULT 0;
  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de alumno es rechazada.';
  END IF;

  -- Active reservations were checked against this ciclo (trg_dr_bi_reglas).
  IF NOT (NEW.id_especialidad <=> OLD.id_especialidad) THEN
    SELECT COUNT(*) INTO v_activas
      FROM dual_reservas
     WHERE id_solicitud_alumno = OLD.id_solicitud_alumno
       AND id_estado_reserva IN (fn_id_estado_reserva('PENDIENTE'), fn_id_estado_reserva('CONFIRMADA'));
    IF v_activas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No se puede cambiar la especialidad de una solicitud con reservas activas.';
    END IF;
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dse_bi_reglas`$$
CREATE TRIGGER `trg_dse_bi_reglas` BEFORE INSERT ON `dual_solicitudes_empresa` FOR EACH ROW BEGIN
  DECLARE v_empresa_representante INT DEFAULT NULL;
  DECLARE v_empresa_coordinador INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_legal INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_trabajo INT DEFAULT NULL;
  DECLARE v_activa TINYINT DEFAULT 0;

  SELECT d.idempresa INTO v_empresa_representante
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_representante_legal;

  SELECT d.idempresa INTO v_empresa_coordinador
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_coordinador_empresa;

  SELECT idempresa INTO v_empresa_domicilio_legal
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_legal;

  SELECT idempresa INTO v_empresa_domicilio_trabajo
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_trabajo;

  SELECT activa INTO v_activa
    FROM dual_convocatorias
   WHERE id_convocatoria = NEW.id_convocatoria;

  IF v_empresa_representante <> NEW.id_empresa
     OR v_empresa_coordinador <> NEW.id_empresa
     OR v_empresa_domicilio_legal <> NEW.id_empresa
     OR v_empresa_domicilio_trabajo <> NEW.id_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Contactos y domicilios deben pertenecer a la misma empresa de la solicitud.';
  END IF;

  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;

  IF NEW.id_estado_validacion = fn_id_estado_validacion('RECHAZADO')
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dse_bu_reglas`$$
CREATE TRIGGER `trg_dse_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_empresa` FOR EACH ROW BEGIN
  DECLARE v_rechazado TINYINT UNSIGNED;
  DECLARE v_empresa_representante INT DEFAULT NULL;
  DECLARE v_empresa_coordinador INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_legal INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_trabajo INT DEFAULT NULL;

  SET v_rechazado = fn_id_estado_validacion('RECHAZADO');

  SELECT d.idempresa INTO v_empresa_representante
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_representante_legal;

  SELECT d.idempresa INTO v_empresa_coordinador
    FROM ge_contactos c
    JOIN ge_domicilios d ON d.iddomicilio = c.iddomicilio
   WHERE c.idcontacto = NEW.id_coordinador_empresa;

  SELECT idempresa INTO v_empresa_domicilio_legal
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_legal;

  SELECT idempresa INTO v_empresa_domicilio_trabajo
    FROM ge_domicilios
   WHERE iddomicilio = NEW.id_domicilio_trabajo;

  IF v_empresa_representante <> NEW.id_empresa
     OR v_empresa_coordinador <> NEW.id_empresa
     OR v_empresa_domicilio_legal <> NEW.id_empresa
     OR v_empresa_domicilio_trabajo <> NEW.id_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Contactos y domicilios deben pertenecer a la misma empresa de la solicitud.';
  END IF;

  IF NEW.id_estado_validacion = v_rechazado AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> v_rechazado AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de empresa es rechazada.';
  END IF;
END$$
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bi_role_links`$$
CREATE TRIGGER `trg_dual_usuarios_bi_role_links` BEFORE INSERT ON `dual_usuarios` FOR EACH ROW BEGIN
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
DROP TRIGGER IF EXISTS `trg_dual_usuarios_bu_role_links`$$
CREATE TRIGGER `trg_dual_usuarios_bu_role_links` BEFORE UPDATE ON `dual_usuarios` FOR EACH ROW BEGIN
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

DROP PROCEDURE IF EXISTS `sp_regla_motivo`;
DROP PROCEDURE IF EXISTS `sp_regla_documento`;
DROP PROCEDURE IF EXISTS `sp_regla_solicitud_empresa`;
DROP PROCEDURE IF EXISTS `sp_regla_usuario`;

-- ── Views ────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS `vw_plazas_oferta`;
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_alumnos_disponibles` AS select `sa`.`id_solicitud_alumno` AS `id_solicitud_alumno`,`a`.`idalumno` AS `idalumno`,`a`.`nombre` AS `nombre`,`a`.`dni` AS `dni`,`a`.`email` AS `email`,`a`.`telalumno` AS `telalumno`,`e`.`codigo` AS `codigo_especialidad`,`e`.`nombre` AS `especialidad`,(case `e`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`c`.`nombre` AS `convocatoria` from ((((`dual_solicitudes_alumno` `sa` join `gf_alumnosfct` `a` on((`a`.`idalumno` = `sa`.`id_alumno`))) join `dual_especialidades` `e` on((`e`.`id_especialidad` = `sa`.`id_especialidad`))) join `dual_convocatorias` `c` on((`c`.`id_convocatoria` = `sa`.`id_convocatoria`))) left join `dual_reservas` `r_confirmada` on(((`r_confirmada`.`id_solicitud_alumno` = `sa`.`id_solicitud_alumno`) and (`r_confirmada`.`id_estado_reserva` = 2)))) where ((`c`.`activa` = 1) and (`sa`.`id_estado_validacion` = 2) and (`r_confirmada`.`id_reserva` is null));
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_cupos_empresa_disponibles` AS select `ee`.`id_solicitud_empresa_especialidad` AS `id_solicitud_empresa_especialidad`,`emp`.`idempresa` AS `idempresa`,`emp`.`empresa` AS `empresa`,`c`.`nombre` AS `convocatoria`,`esp`.`codigo` AS `codigo_especialidad`,`esp`.`nombre` AS `especialidad`,(case `esp`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`ee`.`cantidad_alumnos` AS `plazas_ofertadas`,`fn_reservas_activas`(`ee`.`id_solicitud_empresa_especialidad`) AS `plazas_ocupadas`,`fn_cupos_disponibles`(`ee`.`id_solicitud_empresa_especialidad`) AS `plazas_disponibles` from ((((`dual_solicitud_empresa_especialidades` `ee` join `dual_solicitudes_empresa` `se` on((`se`.`id_solicitud_empresa` = `ee`.`id_solicitud_empresa`))) join `ge_empresas` `emp` on((`emp`.`idempresa` = `se`.`id_empresa`))) join `dual_convocatorias` `c` on((`c`.`id_convocatoria` = `se`.`id_convocatoria`))) join `dual_especialidades` `esp` on((`esp`.`id_especialidad` = `ee`.`id_especialidad`))) where ((`c`.`activa` = 1) and (`se`.`id_estado_validacion` = 2));
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_reservas_detalle` AS select `r`.`id_reserva` AS `id_reserva`,`er`.`nombre` AS `estado_reserva`,`r`.`motivo` AS `motivo`,`tc`.`nombre_mostrar` AS `tipo_contrato`,`a`.`idalumno` AS `idalumno`,`a`.`nombre` AS `alumno`,`a`.`dni` AS `dni_alumno`,`esp`.`codigo` AS `codigo_especialidad`,(case `esp`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`emp`.`idempresa` AS `idempresa`,`emp`.`empresa` AS `empresa`,`ee`.`cantidad_alumnos` AS `plazas_ofertadas` from ((((((((`dual_reservas` `r` join `dual_estados_reserva` `er` on((`er`.`id_estado_reserva` = `r`.`id_estado_reserva`))) left join `dual_tipos_contrato` `tc` on((`tc`.`id_tipo_contrato` = `r`.`id_tipo_contrato`))) join `dual_solicitudes_alumno` `sa` on((`sa`.`id_solicitud_alumno` = `r`.`id_solicitud_alumno`))) join `gf_alumnosfct` `a` on((`a`.`idalumno` = `sa`.`id_alumno`))) join `dual_solicitud_empresa_especialidades` `ee` on((`ee`.`id_solicitud_empresa_especialidad` = `r`.`id_solicitud_empresa_especialidad`))) join `dual_especialidades` `esp` on((`esp`.`id_especialidad` = `ee`.`id_especialidad`))) join `dual_solicitudes_empresa` `se` on((`se`.`id_solicitud_empresa` = `ee`.`id_solicitud_empresa`))) join `ge_empresas` `emp` on((`emp`.`idempresa` = `se`.`id_empresa`)));
