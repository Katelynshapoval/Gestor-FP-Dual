-- 018_reservas_por_intento_y_transacciones.sql
-- Database improvement plan · Stage 2 (DB-04, DB-05, DB-06, DB-07, DB-10, DB-11).
-- See docs/DATABASE_IMPROVEMENT_PLAN.md and docs/DATABASE_STAGE_2_REPORT.md.
--
-- 1. One row per reservation attempt (D2). The unique key (alumno, oferta) is
--    replaced by a unique key on the ACTIVE pair only (PENDIENTE or CONFIRMADA),
--    so a student can be booked again on an offer after a cancellation: that is
--    a NEW row. A CANCELADA row is final and can no longer be modified.
--    dual_reservas.id_reserva_origen links a reassigned reservation to the one it
--    replaced (unique: an attempt is replaced at most once).
-- 2. D5: cancelling keeps the contract type (and the tutor, motive, documents).
-- 3. D6: the reservation procedures no longer open, commit or roll back a
--    transaction. The backend owns it (backend/src/db/transaction.js), writes
--    the audit event in the same transaction and commits once. Each procedure
--    refuses to run with autocommit = 1, so it can never run outside a caller's
--    transaction and silently lose its locks.
-- 4. DB-07: one lock order everywhere: student application → company
--    application → offers (ascending id) → reservations. Nothing changes the state
--    of a reservation without first holding the lock of ITS offer: a state change
--    rewrites ix_dual_reservas_oferta_estado, the index bookings lock to count the
--    places, so without the offer lock a cancellation (holding the row) and a
--    booking (holding the index entries) can deadlock. Counts that take locks name
--    their index (FORCE INDEX), so the locked rows never depend on the optimizer.
--    Every value a decision depends on is read with a locking read (FOR UPDATE /
--    FOR SHARE), in the procedures and in the triggers, so an older snapshot of
--    the caller can never hide a concurrent change (trg_dsee_bu_cupo is rewritten
--    for that reason). The backend runs these transactions at READ COMMITTED.
-- 5. DB-11: dual_eventos accepts the entities OFERTA and TUTOR; estado_* columns
--    grow to 40 characters; ix_de_entidad gains creado_en.
--
-- Existing rows are not rewritten. Rows cancelled before 018 already lost their
-- contract type (old rule); rows reactivated before 018 keep the documents of
-- their earlier attempt marked non-current. Neither can be reconstructed.
--
-- The protected tables ge_contactos, ge_domicilios, ge_empresas and
-- gf_alumnosfct are only read.
-- Rollback: db/rollback/018_reservas_por_intento_y_transacciones.down.sql
-- (only possible while no student/offer pair has a second attempt and no OFERTA
-- or TUTOR event exists; read its header).

-- ─── guards (change nothing) ───────────────────────────────────────────────
DROP PROCEDURE IF EXISTS `sp_018_comprobar`;
DELIMITER $$
CREATE PROCEDURE `sp_018_comprobar`()
BEGIN
  DECLARE v_n INT DEFAULT 0;

  -- The generated keys below use the fixed ids of the lookup (generated
  -- columns cannot call functions), as uq_dual_reservas_confirmada_alumno already does.
  IF fn_id_estado_reserva('PENDIENTE') <> 1 OR fn_id_estado_reserva('CONFIRMADA') <> 2
     OR fn_id_estado_reserva('CANCELADA') <> 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '018: los ids de dual_estados_reserva no son PENDIENTE=1, CONFIRMADA=2, CANCELADA=3. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM (SELECT 1 FROM dual_reservas
           WHERE id_estado_reserva IN (1, 2)
           GROUP BY id_solicitud_alumno, id_solicitud_empresa_especialidad
          HAVING COUNT(*) > 1) x;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '018: hay pares alumno/oferta con más de una reserva activa. No se ha cambiado nada.';
  END IF;

  SELECT COUNT(*) INTO v_n
    FROM dual_solicitud_empresa_especialidades ee
   WHERE fn_reservas_activas(ee.id_solicitud_empresa_especialidad) > ee.cantidad_alumnos;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '018: hay ofertas con más reservas activas que plazas. No se ha cambiado nada.';
  END IF;
END$$
DELIMITER ;

CALL `sp_018_comprobar`();
DROP PROCEDURE IF EXISTS `sp_018_comprobar`;

-- ─── 1. one row per attempt ─────────────────────────────────────────────────
ALTER TABLE `dual_reservas`
  ADD KEY `ix_dr_solicitud_alumno` (`id_solicitud_alumno`),
  ADD COLUMN `id_reserva_origen` int DEFAULT NULL AFTER `motivo`,
  ADD UNIQUE KEY `uq_dr_reserva_origen` (`id_reserva_origen`),
  ADD CONSTRAINT `fk_dr_reserva_origen` FOREIGN KEY (`id_reserva_origen`)
    REFERENCES `dual_reservas` (`id_reserva`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN `id_alumno_activo` int GENERATED ALWAYS AS
    ((CASE WHEN (`id_estado_reserva` IN (1, 2)) THEN `id_solicitud_alumno` ELSE NULL END)) STORED,
  ADD UNIQUE KEY `uq_dr_par_activo` (`id_alumno_activo`, `id_solicitud_empresa_especialidad`),
  DROP INDEX `uq_dual_reservas_alumno_oferta`;

-- ─── 2. triggers ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS `trg_dr_bi_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bi_reglas` BEFORE INSERT ON `dual_reservas` FOR EACH ROW BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_cancelada TINYINT UNSIGNED;
  DECLARE v_validado TINYINT UNSIGNED;
  DECLARE v_estado_alumno TINYINT DEFAULT NULL;
  DECLARE v_estado_empresa TINYINT DEFAULT NULL;
  DECLARE v_convocatoria_alumno INT DEFAULT NULL;
  DECLARE v_convocatoria_empresa INT DEFAULT NULL;
  DECLARE v_especialidad_alumno INT DEFAULT NULL;
  DECLARE v_especialidad_empresa INT DEFAULT NULL;
  DECLARE v_solicitud_empresa INT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;
  DECLARE v_origen_alumno INT DEFAULT NULL;
  DECLARE v_origen_estado TINYINT DEFAULT NULL;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');
  SET v_cancelada = fn_id_estado_reserva('CANCELADA');
  SET v_validado = fn_id_estado_validacion('VALIDADO');

  -- Locking reads: the latest committed values, whatever snapshot the caller holds.
  SELECT sa.id_estado_validacion, sa.id_convocatoria, sa.id_especialidad
    INTO v_estado_alumno, v_convocatoria_alumno, v_especialidad_alumno
    FROM dual_solicitudes_alumno sa
   WHERE sa.id_solicitud_alumno = NEW.id_solicitud_alumno
   FOR SHARE;

  SELECT ee.id_solicitud_empresa, ee.id_especialidad, ee.cantidad_alumnos
    INTO v_solicitud_empresa, v_especialidad_empresa, v_cantidad
    FROM dual_solicitud_empresa_especialidades ee
   WHERE ee.id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
   FOR SHARE;

  SELECT se.id_estado_validacion, se.id_convocatoria
    INTO v_estado_empresa, v_convocatoria_empresa
    FROM dual_solicitudes_empresa se
   WHERE se.id_solicitud_empresa = v_solicitud_empresa
   FOR SHARE;

  IF v_estado_alumno <> v_validado OR v_estado_empresa <> v_validado THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden reservar alumnos y empresas validados.';
  END IF;

  IF v_convocatoria_alumno <> v_convocatoria_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Alumno y empresa deben pertenecer a la misma convocatoria.';
  END IF;

  IF v_especialidad_alumno <> v_especialidad_empresa THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La especialidad del alumno no coincide con la especialidad solicitada por la empresa.';
  END IF;

  IF NEW.id_estado_reserva IN (v_pendiente, v_confirmada) THEN
    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas FORCE INDEX (ix_dual_reservas_oferta_estado)
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (v_pendiente, v_confirmada)
     FOR SHARE;

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad de empresa.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas FORCE INDEX (ix_dr_solicitud_alumno)
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = v_confirmada
     FOR SHARE;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;

  -- A reassignment points at the cancelled reservation of the same application.
  IF NEW.id_reserva_origen IS NOT NULL THEN
    SELECT id_solicitud_alumno, id_estado_reserva
      INTO v_origen_alumno, v_origen_estado
      FROM dual_reservas
     WHERE id_reserva = NEW.id_reserva_origen
     FOR SHARE;
    IF NOT (v_origen_alumno <=> NEW.id_solicitud_alumno) OR NOT (v_origen_estado <=> v_cancelada) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La reserva de origen debe ser una reserva cancelada del mismo alumno.';
    END IF;
  END IF;

  IF NEW.id_estado_reserva = v_confirmada AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva <> v_confirmada AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato solo se indica en una reserva confirmada.';
  END IF;

  IF NEW.id_estado_reserva = v_cancelada
     AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `trg_dr_bu_reglas`;
DELIMITER $$
CREATE TRIGGER `trg_dr_bu_reglas` BEFORE UPDATE ON `dual_reservas` FOR EACH ROW BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_cancelada TINYINT UNSIGNED;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');
  SET v_cancelada = fn_id_estado_reserva('CANCELADA');

  -- D2: a cancelled attempt is history. Nothing in it changes; a new booking is a new row.
  IF OLD.id_estado_reserva = v_cancelada
     AND NOT (NEW.id_estado_reserva <=> OLD.id_estado_reserva
              AND NEW.id_tipo_contrato <=> OLD.id_tipo_contrato
              AND NEW.id_empresa_tutor <=> OLD.id_empresa_tutor
              AND NEW.motivo <=> OLD.motivo) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada es definitiva y no se puede modificar. Crea una reserva nueva.';
  END IF;

  IF NEW.id_solicitud_alumno <> OLD.id_solicitud_alumno
     OR NEW.id_solicitud_empresa_especialidad <> OLD.id_solicitud_empresa_especialidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cambiar el alumno ni la especialidad de una reserva existente.';
  END IF;

  IF NOT (NEW.id_reserva_origen <=> OLD.id_reserva_origen) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cambiar la reserva de origen.';
  END IF;

  IF OLD.id_estado_reserva = v_confirmada AND NEW.id_estado_reserva NOT IN (v_confirmada, v_cancelada) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada solo puede cancelarse de forma administrativa.';
  END IF;

  -- Staying CONFIRMADA (2→2) is allowed for column updates such as the tutor.
  IF NEW.id_estado_reserva = v_confirmada AND OLD.id_estado_reserva NOT IN (v_pendiente, v_confirmada) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede pasar a CONFIRMADA.';
  END IF;

  IF NEW.id_estado_reserva = v_confirmada AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva = v_cancelada AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;

  IF NEW.id_estado_reserva <> v_cancelada AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando una reserva es cancelada.';
  END IF;
END$$
DELIMITER ;

-- DB-10 (017) with a locking count: a reservation committed after the caller's
-- snapshot is still counted. fn_reservas_activas is a plain read.
DROP TRIGGER IF EXISTS `trg_dsee_bu_cupo`;
DELIMITER $$
CREATE TRIGGER `trg_dsee_bu_cupo` BEFORE UPDATE ON `dual_solicitud_empresa_especialidades` FOR EACH ROW BEGIN
  DECLARE v_activas INT DEFAULT 0;
  IF NEW.cantidad_alumnos < OLD.cantidad_alumnos THEN
    SELECT COUNT(*) INTO v_activas
      FROM dual_reservas FORCE INDEX (ix_dual_reservas_oferta_estado)
     WHERE id_solicitud_empresa_especialidad = OLD.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (fn_id_estado_reserva('PENDIENTE'), fn_id_estado_reserva('CONFIRMADA'))
     FOR SHARE;
    IF NEW.cantidad_alumnos < v_activas THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No se pueden reducir las plazas por debajo de las reservas activas.';
    END IF;
  END IF;
END$$
DELIMITER ;

-- ─── 3. procedures (caller-owned transactions) ─────────────────────────────
-- SQLSTATE 45001 (not 45000): a programming error, reported by the API as 500.

DROP PROCEDURE IF EXISTS `sp_reservar_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_reservar_alumno`(
  IN p_id_solicitud_alumno INT,
  IN p_id_solicitud_empresa_especialidad INT
)
BEGIN
  DECLARE v_pendiente TINYINT UNSIGNED;
  DECLARE v_confirmada TINYINT UNSIGNED;
  DECLARE v_lock INT DEFAULT NULL;
  DECLARE v_solicitud_empresa INT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT NULL;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;
  DECLARE v_activas_par INT DEFAULT 0;
  DECLARE v_estado_alumno TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_estado_empresa TINYINT UNSIGNED DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF @@autocommit = 1 THEN
    SIGNAL SQLSTATE '45001'
      SET MESSAGE_TEXT = 'sp_reservar_alumno debe ejecutarse dentro de una transacción (autocommit = 0).';
  END IF;

  SET v_pendiente = fn_id_estado_reserva('PENDIENTE');
  SET v_confirmada = fn_id_estado_reserva('CONFIRMADA');

  -- Lock order: student application → company application → offer → reservations.
  SET v_no_data = 0;
  SELECT id_estado_validacion INTO v_estado_alumno
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
   FOR UPDATE;
  IF v_no_data = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud del alumno no existe.';
  END IF;

  SET v_no_data = 0;
  SELECT id_solicitud_empresa INTO v_solicitud_empresa
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad;
  IF v_no_data = 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La especialidad solicitada por la empresa no existe.';
  END IF;

  SELECT id_estado_validacion INTO v_estado_empresa
    FROM dual_solicitudes_empresa
   WHERE id_solicitud_empresa = v_solicitud_empresa
   FOR SHARE;

  -- Eligibility before places, so a withdrawn or rejected application is told the
  -- real reason (trg_dr_bi_reglas checks it again, with convocatoria and ciclo).
  IF v_estado_alumno <> fn_id_estado_validacion('VALIDADO')
     OR v_estado_empresa <> fn_id_estado_validacion('VALIDADO') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden reservar alumnos y empresas validados.';
  END IF;

  SELECT cantidad_alumnos INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   FOR UPDATE;

  SELECT COUNT(*) INTO v_confirmadas
    FROM dual_reservas FORCE INDEX (ix_dr_solicitud_alumno)
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_estado_reserva = v_confirmada
   FOR UPDATE;

  SELECT COUNT(*) INTO v_activas_par
    FROM dual_reservas FORCE INDEX (ix_dr_solicitud_alumno)
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
     AND id_estado_reserva IN (v_pendiente, v_confirmada)
   FOR UPDATE;

  SELECT COUNT(*) INTO v_ocupadas
    FROM dual_reservas FORCE INDEX (ix_dual_reservas_oferta_estado)
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
     AND id_estado_reserva IN (v_pendiente, v_confirmada)
   FOR UPDATE;

  IF v_activas_par > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva activa con esta oferta.';
  END IF;

  IF v_confirmadas > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
  END IF;

  IF v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad.';
  END IF;

  -- D2: always a new row; an earlier cancelled attempt stays as it was.
  INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva)
  VALUES (p_id_solicitud_alumno, p_id_solicitud_empresa_especialidad, v_pendiente);

  SELECT LAST_INSERT_ID() AS id_reserva;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cancelar_reserva`;
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
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cancelar_reserva_admin`;
DELIMITER $$
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
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_confirmar_reserva`;
DELIMITER $$
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
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_reasignar_reserva`;
DELIMITER $$
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
DELIMITER ;

-- ─── 4. audit trail ─────────────────────────────────────────────────────────
ALTER TABLE `dual_eventos`
  DROP CHECK `chk_de_entidad`,
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR')),
  MODIFY COLUMN `estado_anterior` varchar(40) DEFAULT NULL,
  MODIFY COLUMN `estado_nuevo` varchar(40) DEFAULT NULL,
  ADD KEY `ix_de_entidad_fecha` (`entidad`, `id_entidad`, `creado_en`),
  DROP INDEX `ix_de_entidad`;

-- ─── post-migration checks (run by hand; expected result in brackets) ──────
--   SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME = 'dual_reservas' AND INDEX_NAME = 'uq_dual_reservas_alumno_oferta';      [0]
--   SELECT COUNT(*) FROM dual_reservas WHERE id_alumno_activo IS NOT NULL
--      AND id_estado_reserva NOT IN (1, 2);                                                       [0]
--   SELECT COUNT(*) FROM dual_reservas WHERE id_estado_reserva IN (1, 2)
--      AND NOT (id_alumno_activo <=> id_solicitud_alumno);                                        [0]
--   SET autocommit = 1; CALL sp_cancelar_reserva(-1, 'x');                    [error 45001: transacción]
--   SELECT COUNT(*) FROM dual_eventos;                                         [unchanged by 018]
