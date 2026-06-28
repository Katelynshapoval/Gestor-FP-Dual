-- Parche aditivo para el esquema final de proyecto_dual.
-- Ejecutar una vez después de haber aplicado dbfinal.txt.
-- Todos los CREATE son idempotentes (IF NOT EXISTS / IF NOT DEFINED).
-- No modifica ni elimina nada del esquema base.

USE `proyecto_dual`;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PREFERENCIAS DE ALUMNO
-- El esquema final elimina la tabla `preferencia` legacy sin reemplazarla.
-- Se añaden dos tablas normalizadas para conservar la experiencia de usuario.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `dual_preferencias` (
  `id_preferencia` int NOT NULL AUTO_INCREMENT,
  `id_especialidad` int NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  PRIMARY KEY (`id_preferencia`),
  KEY `ix_dp_especialidad` (`id_especialidad`),
  CONSTRAINT `fk_dp_especialidad`
    FOREIGN KEY (`id_especialidad`) REFERENCES `dual_especialidades` (`id_especialidad`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_solicitud_preferencias` (
  `id_solicitud_alumno` int NOT NULL,
  `orden` tinyint unsigned NOT NULL COMMENT '1, 2 o 3',
  `id_preferencia` int NOT NULL,
  PRIMARY KEY (`id_solicitud_alumno`, `orden`),
  KEY `ix_dsp_preferencia` (`id_preferencia`),
  CONSTRAINT `fk_dsp_solicitud`
    FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dsp_preferencia`
    FOREIGN KEY (`id_preferencia`) REFERENCES `dual_preferencias` (`id_preferencia`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dsp_orden` CHECK (`orden` BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TOKENS SEGUROS PARA SUBIDA PÚBLICA DE CONVENIO
-- Sustituye el enlace con ID ofuscado por un token opaco con expiración.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `dual_convenio_tokens` (
  `id_token` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_empresa` int NOT NULL,
  `token` varchar(64) NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expira_en` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_token`),
  UNIQUE KEY `uq_dct_token` (`token`),
  KEY `ix_dct_solicitud` (`id_solicitud_empresa`),
  CONSTRAINT `fk_dct_solicitud`
    FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dct_usado` CHECK (`usado` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FECHA DE ACTUALIZACIÓN EN EVALUACIONES
-- La tabla dual_evaluaciones no incluye un campo de fecha.
-- Se añade updated_at para mostrar en la UI cuándo fue la última modificación.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `dual_evaluaciones`
  ADD COLUMN IF NOT EXISTS `updated_at` datetime DEFAULT NULL
    ON UPDATE CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FUNCIONES NECESARIAS PARA LA VISTA vw_cupos_empresa_disponibles
-- La vista referencia fn_reservas_activas y fn_cupos_disponibles, que no están
-- incluidas en el dump. Se definen aquí de forma idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS `fn_reservas_activas`;
DELIMITER $$
CREATE FUNCTION `fn_reservas_activas`(
  p_id_oferta INT
) RETURNS SMALLINT
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_count SMALLINT;
  SELECT COUNT(*)
    INTO v_count
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_oferta
     AND id_estado_reserva IN (
       SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre IN ('PENDIENTE', 'CONFIRMADO')
     );
  RETURN IFNULL(v_count, 0);
END$$
DELIMITER ;

DROP FUNCTION IF EXISTS `fn_cupos_disponibles`;
DELIMITER $$
CREATE FUNCTION `fn_cupos_disponibles`(
  p_id_oferta INT
) RETURNS SMALLINT
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE v_ofertadas SMALLINT DEFAULT 0;
  DECLARE v_ocupadas SMALLINT DEFAULT 0;

  SELECT cantidad_alumnos
    INTO v_ofertadas
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_oferta;

  SET v_ocupadas = fn_reservas_activas(p_id_oferta);

  RETURN GREATEST(0, IFNULL(v_ofertadas, 0) - v_ocupadas);
END$$
DELIMITER ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PROCEDIMIENTOS ALMACENADOS
-- ─────────────────────────────────────────────────────────────────────────────

-- 5.1 Activar una convocatoria (desactiva el resto)
DROP PROCEDURE IF EXISTS `sp_activar_convocatoria`;
DELIMITER $$
CREATE PROCEDURE `sp_activar_convocatoria`(IN p_id INT)
BEGIN
  UPDATE dual_convocatorias SET activa = 0;
  UPDATE dual_convocatorias SET activa = 1 WHERE id_convocatoria = p_id;
END$$
DELIMITER ;

-- 5.2 Guardar o reemplazar un documento (respeta la restricción de un solo padre)
DROP PROCEDURE IF EXISTS `sp_guardar_documento`;
DELIMITER $$
CREATE PROCEDURE `sp_guardar_documento`(
  IN p_id_solicitud_alumno  INT,
  IN p_id_solicitud_empresa INT,
  IN p_id_reserva           INT,
  IN p_id_tipo_documento    TINYINT UNSIGNED,
  IN p_archivo              LONGBLOB
)
BEGIN
  DECLARE v_id INT DEFAULT NULL;

  -- Busca un documento del mismo tipo y mismo padre para reemplazarlo
  IF p_id_solicitud_alumno IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_alumno = p_id_solicitud_alumno
       AND id_tipo_documento = p_id_tipo_documento
     LIMIT 1;
  ELSEIF p_id_solicitud_empresa IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_empresa = p_id_solicitud_empresa
       AND id_tipo_documento = p_id_tipo_documento
     LIMIT 1;
  ELSEIF p_id_reserva IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_reserva = p_id_reserva
       AND id_tipo_documento = p_id_tipo_documento
     LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    -- Actualiza el existente y resetea el estado a PENDIENTE
    UPDATE dual_documentos
       SET archivo = p_archivo,
           id_estado_validacion = (
             SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1
           ),
           motivo = NULL
     WHERE id_documento = v_id;
    SELECT v_id AS id_documento;
  ELSE
    -- Inserta uno nuevo
    INSERT INTO dual_documentos
      (id_solicitud_alumno, id_solicitud_empresa, id_reserva, id_tipo_documento, archivo, id_estado_validacion)
    VALUES (
      p_id_solicitud_alumno, p_id_solicitud_empresa, p_id_reserva,
      p_id_tipo_documento, p_archivo,
      (SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'PENDIENTE' LIMIT 1)
    );
    SELECT LAST_INSERT_ID() AS id_documento;
  END IF;
END$$
DELIMITER ;

-- 5.3 Validar solicitud de alumno
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_alumno`(IN p_id INT)
BEGIN
  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = (
           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
         ),
         motivo = NULL
   WHERE id_solicitud_alumno = p_id;
END$$
DELIMITER ;

-- 5.4 Rechazar solicitud de alumno
DROP PROCEDURE IF EXISTS `sp_rechazar_solicitud_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_solicitud_alumno`(IN p_id INT, IN p_motivo TEXT)
BEGIN
  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = (
           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'RECHAZADO' LIMIT 1
         ),
         motivo = p_motivo
   WHERE id_solicitud_alumno = p_id;
END$$
DELIMITER ;

-- 5.5 Validar solicitud de empresa
DROP PROCEDURE IF EXISTS `sp_validar_solicitud_empresa`;
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_empresa`(IN p_id INT)
BEGIN
  UPDATE dual_solicitudes_empresa
     SET id_estado_validacion = (
           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
         ),
         motivo = NULL
   WHERE id_solicitud_empresa = p_id;
END$$
DELIMITER ;

-- 5.6 Rechazar solicitud de empresa
DROP PROCEDURE IF EXISTS `sp_rechazar_solicitud_empresa`;
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_solicitud_empresa`(IN p_id INT, IN p_motivo TEXT)
BEGIN
  UPDATE dual_solicitudes_empresa
     SET id_estado_validacion = (
           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'RECHAZADO' LIMIT 1
         ),
         motivo = p_motivo
   WHERE id_solicitud_empresa = p_id;
END$$
DELIMITER ;

-- 5.7 Validar documento
DROP PROCEDURE IF EXISTS `sp_validar_documento`;
DELIMITER $$
CREATE PROCEDURE `sp_validar_documento`(IN p_id INT)
BEGIN
  UPDATE dual_documentos
     SET id_estado_validacion = (
           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'VALIDADO' LIMIT 1
         ),
         motivo = NULL
   WHERE id_documento = p_id;
END$$
DELIMITER ;

-- 5.8 Rechazar documento
DROP PROCEDURE IF EXISTS `sp_rechazar_documento`;
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_documento`(IN p_id INT, IN p_motivo TEXT)
BEGIN
  UPDATE dual_documentos
     SET id_estado_validacion = (
           SELECT id_estado_validacion FROM dual_estados_validacion WHERE nombre = 'RECHAZADO' LIMIT 1
         ),
         motivo = p_motivo
   WHERE id_documento = p_id;
END$$
DELIMITER ;

-- 5.9 Guardar evaluación (upsert)
DROP PROCEDURE IF EXISTS `sp_guardar_evaluacion`;
DELIMITER $$
CREATE PROCEDURE `sp_guardar_evaluacion`(
  IN p_id_solicitud_alumno INT,
  IN p_nota_media    DECIMAL(4,2),
  IN p_idiomas       DECIMAL(4,2),
  IN p_madurez       DECIMAL(4,2),
  IN p_competencia   DECIMAL(4,2),
  IN p_faltas        SMALLINT UNSIGNED,
  IN p_nota_total    DECIMAL(5,2)
)
BEGIN
  INSERT INTO dual_evaluaciones
    (id_solicitud_alumno, nota_media, idiomas, madurez, competencia, faltas, nota_total, updated_at)
  VALUES
    (p_id_solicitud_alumno, p_nota_media, p_idiomas, p_madurez, p_competencia, p_faltas, p_nota_total, NOW())
  ON DUPLICATE KEY UPDATE
    nota_media   = p_nota_media,
    idiomas      = p_idiomas,
    madurez      = p_madurez,
    competencia  = p_competencia,
    faltas       = p_faltas,
    nota_total   = p_nota_total,
    updated_at   = NOW();
END$$
DELIMITER ;

-- 5.10 Asignar transporte a empresa (idempotente)
DROP PROCEDURE IF EXISTS `sp_asignar_transporte_empresa`;
DELIMITER $$
CREATE PROCEDURE `sp_asignar_transporte_empresa`(
  IN p_id_empresa    INT,
  IN p_id_transporte TINYINT UNSIGNED
)
BEGIN
  INSERT IGNORE INTO dual_empresa_transportes (id_empresa, id_transporte)
  VALUES (p_id_empresa, p_id_transporte);
END$$
DELIMITER ;

-- 5.11 Reservar alumno para una oferta de empresa (con bloqueo transaccional)
DROP PROCEDURE IF EXISTS `sp_reservar_alumno`;
DELIMITER $$
CREATE PROCEDURE `sp_reservar_alumno`(
  IN  p_id_solicitud_alumno           INT,
  IN  p_id_solicitud_empresa_esp      INT,
  OUT p_id_reserva                    INT
)
BEGIN
  DECLARE v_plazas_disponibles SMALLINT DEFAULT 0;
  DECLARE v_ya_confirmado      INT DEFAULT 0;
  DECLARE v_id_estado_pendiente TINYINT UNSIGNED;

  -- Obtener el estado PENDIENTE
  SELECT id_estado_reserva INTO v_id_estado_pendiente
    FROM dual_estados_reserva WHERE nombre = 'PENDIENTE' LIMIT 1;

  -- Bloquea la fila de la oferta para evitar concurrencia
  SELECT fn_cupos_disponibles(p_id_solicitud_empresa_esp)
    INTO v_plazas_disponibles;

  IF v_plazas_disponibles <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta oferta.';
  END IF;

  -- Comprueba que el alumno no tenga ya una reserva confirmada
  SELECT COUNT(*) INTO v_ya_confirmado
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_estado_reserva = (
           SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = 'CONFIRMADO' LIMIT 1
         );

  IF v_ya_confirmado > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
  END IF;

  INSERT INTO dual_reservas (id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva)
  VALUES (p_id_solicitud_alumno, p_id_solicitud_empresa_esp, v_id_estado_pendiente);

  SET p_id_reserva = LAST_INSERT_ID();
  SELECT p_id_reserva AS id_reserva;
END$$
DELIMITER ;

-- 5.12 Cancelar reserva (solo si no está confirmada)
DROP PROCEDURE IF EXISTS `sp_cancelar_reserva`;
DELIMITER $$
CREATE PROCEDURE `sp_cancelar_reserva`(
  IN p_id_reserva INT,
  IN p_motivo     TEXT
)
BEGIN
  DECLARE v_estado VARCHAR(30);

  SELECT er.nombre INTO v_estado
    FROM dual_reservas r
    JOIN dual_estados_reserva er ON er.id_estado_reserva = r.id_estado_reserva
   WHERE r.id_reserva = p_id_reserva;

  IF v_estado = 'CONFIRMADO' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cancelar una reserva ya confirmada.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = (
           SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = 'CANCELADO' LIMIT 1
         ),
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva;
END$$
DELIMITER ;

-- 5.13 Confirmar reserva (admin/coordinador)
DROP PROCEDURE IF EXISTS `sp_confirmar_reserva`;
DELIMITER $$
CREATE PROCEDURE `sp_confirmar_reserva`(
  IN p_id_reserva     INT,
  IN p_id_tipo_contrato TINYINT UNSIGNED
)
BEGIN
  DECLARE v_id_alumno INT;

  -- Recupera el alumno para comprobar que no tenga otra confirmada
  SELECT id_solicitud_alumno INTO v_id_alumno
    FROM dual_reservas WHERE id_reserva = p_id_reserva;

  -- La restricción UNIQUE en id_solicitud_alumno_confirmada de dual_reservas
  -- garantiza que no puede haber dos confirmadas para el mismo alumno.
  -- El UPDATE fallará con ER_DUP_ENTRY si ya existe otra confirmada.

  UPDATE dual_reservas
     SET id_estado_reserva = (
           SELECT id_estado_reserva FROM dual_estados_reserva WHERE nombre = 'CONFIRMADO' LIMIT 1
         ),
         id_tipo_contrato = p_id_tipo_contrato
   WHERE id_reserva = p_id_reserva;
END$$
DELIMITER ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DATOS SEMILLA
-- Asegura que existen los estados, tipos y roles básicos.
-- INSERT IGNORE para ser idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO `dual_estados_validacion` (`nombre`) VALUES ('PENDIENTE'), ('VALIDADO'), ('RECHAZADO');
INSERT IGNORE INTO `dual_estados_reserva` (`nombre`) VALUES ('PENDIENTE'), ('CONFIRMADO'), ('CANCELADO');
INSERT IGNORE INTO `dual_roles` (`nombre`) VALUES ('ADMINISTRADOR'), ('COORDINADOR'), ('EMPRESA');
INSERT IGNORE INTO `dual_tipos_documento` (`nombre`) VALUES ('CV'), ('ANEXO_2'), ('CONVENIO'), ('ANEXO_H'), ('OTRO');
INSERT IGNORE INTO `dual_tipos_contrato` (`nombre`)
  VALUES ('Formación en alternancia'), ('Prácticas no laborales'), ('Beca'), ('Otro');
