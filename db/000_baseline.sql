-- 000_baseline.sql
-- Schema baseline generated from `proyecto_dual` by backend/scripts/schema.js.
-- Equals the result of the retired scripts in db/legacy_migrations (002–011 as
-- actually applied). Structure plus lookup rows only: no personal data.
-- Applied automatically by `npm run db:migrate -- up` on an empty database.
-- Do not edit by hand: later changes go in db/migrations/NNN_*.sql.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- TABLE calendario
CREATE TABLE `calendario` (
  `idAlumno` int NOT NULL,
  `idEmpresa` int NOT NULL,
  `calendarioComprobado` tinyint(1) NOT NULL DEFAULT '0',
  `horarioLunes` varchar(15) NOT NULL,
  `horarioMartes` varchar(15) NOT NULL,
  `horarioMiercoles` varchar(15) NOT NULL,
  `horarioJueves` varchar(15) NOT NULL,
  `horarioViernes` varchar(15) NOT NULL,
  `horarioJornadaCompleta` varchar(15) NOT NULL,
  `horasTotalesAnuales` int NOT NULL,
  `vacaciones` int NOT NULL,
  `calendarioDoc` longblob,
  `fechaHoy` date NOT NULL,
  PRIMARY KEY (`idAlumno`,`idEmpresa`),
  KEY `ix_calendario_empresa` (`idEmpresa`),
  CONSTRAINT `fk_calendario_alumno` FOREIGN KEY (`idAlumno`) REFERENCES `gf_alumnosfct` (`idalumno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_calendario_empresa` FOREIGN KEY (`idEmpresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_convocatorias
CREATE TABLE `dual_convocatorias` (
  `id_convocatoria` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(20) NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_convocatoria`),
  UNIQUE KEY `uq_dual_convocatorias_nombre` (`nombre`),
  KEY `ix_dual_convocatorias_activa` (`activa`),
  CONSTRAINT `chk_dual_convocatorias_activa` CHECK ((`activa` in (0,1))),
  CONSTRAINT `chk_dual_convocatorias_fechas` CHECK ((`fecha_fin` >= `fecha_inicio`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_documento_firmas
CREATE TABLE `dual_documento_firmas` (
  `id_firma` int NOT NULL AUTO_INCREMENT,
  `id_documento` int NOT NULL,
  `rol` varchar(20) NOT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'SIN_FIRMAR',
  `firmado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id_firma`),
  UNIQUE KEY `uq_dual_documento_firmas_doc_rol` (`id_documento`,`rol`),
  CONSTRAINT `fk_dual_documento_firmas_doc` FOREIGN KEY (`id_documento`) REFERENCES `dual_documentos` (`id_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dual_documento_firmas_estado` CHECK ((`estado` in (_utf8mb4'SIN_FIRMAR',_utf8mb4'FIRMADO'))),
  CONSTRAINT `chk_dual_documento_firmas_rol` CHECK ((`rol` in (_utf8mb4'EMPRESA',_utf8mb4'GESTOR',_utf8mb4'ALUMNO')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_documento_plantillas
CREATE TABLE `dual_documento_plantillas` (
  `id_plantilla` int NOT NULL AUTO_INCREMENT,
  `id_tipo_documento` tinyint unsigned NOT NULL,
  `archivo` longblob NOT NULL,
  `nombre_archivo` varchar(255) NOT NULL,
  `mime_type` varchar(150) NOT NULL,
  `version` int NOT NULL,
  `es_activa` tinyint(1) NOT NULL DEFAULT '0',
  `id_usuario_subida` int NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `activa_tipo` tinyint unsigned GENERATED ALWAYS AS (if((`es_activa` = 1),`id_tipo_documento`,NULL)) STORED,
  PRIMARY KEY (`id_plantilla`),
  UNIQUE KEY `uq_plantilla_tipo_version` (`id_tipo_documento`,`version`),
  UNIQUE KEY `uq_plantilla_activa` (`activa_tipo`),
  KEY `ix_plantilla_tipo` (`id_tipo_documento`),
  KEY `fk_plantilla_usuario` (`id_usuario_subida`),
  CONSTRAINT `fk_plantilla_tipo` FOREIGN KEY (`id_tipo_documento`) REFERENCES `dual_tipos_documento` (`id_tipo_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_plantilla_usuario` FOREIGN KEY (`id_usuario_subida`) REFERENCES `dual_usuarios` (`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_documento_versiones
CREATE TABLE `dual_documento_versiones` (
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

-- TABLE dual_documentos
CREATE TABLE `dual_documentos` (
  `id_documento` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_alumno` int DEFAULT NULL,
  `id_solicitud_empresa` int DEFAULT NULL,
  `id_reserva` int DEFAULT NULL,
  `id_tipo_documento` tinyint unsigned NOT NULL,
  `archivo` longblob,
  `id_estado_validacion` tinyint unsigned NOT NULL DEFAULT '1',
  `motivo` text,
  `estado_workflow` varchar(30) DEFAULT NULL,
  `es_actual` tinyint(1) NOT NULL DEFAULT '1',
  `id_usuario_origen` int DEFAULT NULL,
  `origen_documento` varchar(20) NOT NULL DEFAULT 'LEGACY',
  `id_plantilla` int DEFAULT NULL,
  `registrado_en` datetime DEFAULT NULL,
  PRIMARY KEY (`id_documento`),
  KEY `ix_dd_solicitud_alumno` (`id_solicitud_alumno`),
  KEY `ix_dd_solicitud_empresa` (`id_solicitud_empresa`),
  KEY `ix_dd_reserva` (`id_reserva`),
  KEY `ix_dd_tipo_estado` (`id_tipo_documento`,`id_estado_validacion`),
  KEY `fk_dd_estado_validacion` (`id_estado_validacion`),
  KEY `ix_documentos_usuario_origen` (`id_usuario_origen`),
  KEY `ix_documentos_plantilla` (`id_plantilla`),
  CONSTRAINT `fk_dd_estado_validacion` FOREIGN KEY (`id_estado_validacion`) REFERENCES `dual_estados_validacion` (`id_estado_validacion`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dd_reserva` FOREIGN KEY (`id_reserva`) REFERENCES `dual_reservas` (`id_reserva`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dd_solicitud_alumno` FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dd_solicitud_empresa` FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dd_tipo_documento` FOREIGN KEY (`id_tipo_documento`) REFERENCES `dual_tipos_documento` (`id_tipo_documento`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_documentos_plantilla` FOREIGN KEY (`id_plantilla`) REFERENCES `dual_documento_plantillas` (`id_plantilla`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_documentos_usuario_origen` FOREIGN KEY (`id_usuario_origen`) REFERENCES `dual_usuarios` (`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dd_un_padre` CHECK (((((`id_solicitud_alumno` is not null) + (`id_solicitud_empresa` is not null)) + (`id_reserva` is not null)) = 1)),
  CONSTRAINT `chk_documentos_origen` CHECK ((`origen_documento` in (_utf8mb4'SUBIDA',_utf8mb4'GENERADO',_utf8mb4'LEGACY')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_empresa_cambios
CREATE TABLE `dual_empresa_cambios` (
  `id_cambio` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_empresa` int NOT NULL,
  `id_empresa` int NOT NULL,
  `id_usuario_solicitante` int NOT NULL,
  `payload` json NOT NULL,
  `estado` varchar(20) NOT NULL,
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_resolucion` datetime DEFAULT NULL,
  `id_usuario_resolutor` int DEFAULT NULL,
  `motivo` text,
  `id_solicitud_pendiente` int GENERATED ALWAYS AS ((case when (`estado` = _utf8mb4'PENDIENTE') then `id_solicitud_empresa` else NULL end)) STORED,
  PRIMARY KEY (`id_cambio`),
  UNIQUE KEY `uq_dec_solicitud_pendiente` (`id_solicitud_pendiente`),
  KEY `ix_dec_empresa` (`id_empresa`),
  KEY `ix_dec_solicitud` (`id_solicitud_empresa`),
  KEY `ix_dec_estado` (`estado`),
  KEY `fk_dec_solicitante` (`id_usuario_solicitante`),
  KEY `fk_dec_resolutor` (`id_usuario_resolutor`),
  CONSTRAINT `fk_dec_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dec_resolutor` FOREIGN KEY (`id_usuario_resolutor`) REFERENCES `dual_usuarios` (`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dec_solicitante` FOREIGN KEY (`id_usuario_solicitante`) REFERENCES `dual_usuarios` (`id_usuario`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dec_solicitud` FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dec_estado` CHECK ((`estado` in (_utf8mb4'PENDIENTE',_utf8mb4'APROBADO',_utf8mb4'RECHAZADO')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_empresa_transportes
CREATE TABLE `dual_empresa_transportes` (
  `id_empresa` int NOT NULL,
  `id_transporte` tinyint unsigned NOT NULL,
  PRIMARY KEY (`id_empresa`,`id_transporte`),
  KEY `ix_det_transporte` (`id_transporte`),
  CONSTRAINT `fk_det_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_det_transporte` FOREIGN KEY (`id_transporte`) REFERENCES `dual_transportes` (`id_transporte`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_empresa_tutores
CREATE TABLE `dual_empresa_tutores` (
  `id_empresa_tutor` int NOT NULL AUTO_INCREMENT,
  `id_empresa` int NOT NULL,
  `id_contacto` int NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_empresa_tutor`),
  UNIQUE KEY `uq_dual_empresa_tutores_empresa_contacto` (`id_empresa`,`id_contacto`),
  KEY `ix_dual_empresa_tutores_empresa` (`id_empresa`),
  KEY `ix_dual_empresa_tutores_contacto` (`id_contacto`),
  KEY `ix_dual_empresa_tutores_activo` (`activo`),
  CONSTRAINT `fk_dual_empresa_tutores_contacto` FOREIGN KEY (`id_contacto`) REFERENCES `ge_contactos` (`idcontacto`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dual_empresa_tutores_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dual_empresa_tutores_activo` CHECK ((`activo` in (0,1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_especialidades
CREATE TABLE `dual_especialidades` (
  `id_especialidad` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `turno` tinyint unsigned NOT NULL COMMENT '0=DIURNO, 1=VESPERTINO',
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_especialidad`),
  UNIQUE KEY `uq_dual_especialidades_codigo_turno` (`codigo`,`turno`),
  CONSTRAINT `chk_dual_especialidades_activa` CHECK ((`activa` in (0,1))),
  CONSTRAINT `chk_dual_especialidades_turno` CHECK ((`turno` in (0,1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_estados_reserva
CREATE TABLE `dual_estados_reserva` (
  `id_estado_reserva` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(30) NOT NULL,
  PRIMARY KEY (`id_estado_reserva`),
  UNIQUE KEY `uq_dual_estados_reserva_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_estados_validacion
CREATE TABLE `dual_estados_validacion` (
  `id_estado_validacion` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(30) NOT NULL,
  PRIMARY KEY (`id_estado_validacion`),
  UNIQUE KEY `uq_dual_estados_validacion_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_preferencias
CREATE TABLE `dual_preferencias` (
  `id_preferencia` int NOT NULL AUTO_INCREMENT,
  `id_especialidad` int NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  PRIMARY KEY (`id_preferencia`),
  KEY `ix_dp_especialidad` (`id_especialidad`),
  CONSTRAINT `fk_dp_especialidad` FOREIGN KEY (`id_especialidad`) REFERENCES `dual_especialidades` (`id_especialidad`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_reservas
CREATE TABLE `dual_reservas` (
  `id_reserva` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_alumno` int NOT NULL,
  `id_solicitud_empresa_especialidad` int NOT NULL,
  `id_estado_reserva` tinyint unsigned NOT NULL DEFAULT '1',
  `id_tipo_contrato` tinyint unsigned DEFAULT NULL,
  `id_empresa_tutor` int DEFAULT NULL,
  `motivo` text,
  `id_solicitud_alumno_confirmada` int GENERATED ALWAYS AS ((case when (`id_estado_reserva` = 2) then `id_solicitud_alumno` else NULL end)) STORED,
  PRIMARY KEY (`id_reserva`),
  UNIQUE KEY `uq_dual_reservas_alumno_oferta` (`id_solicitud_alumno`,`id_solicitud_empresa_especialidad`),
  UNIQUE KEY `uq_dual_reservas_confirmada_alumno` (`id_solicitud_alumno_confirmada`),
  KEY `ix_dual_reservas_oferta_estado` (`id_solicitud_empresa_especialidad`,`id_estado_reserva`),
  KEY `ix_dual_reservas_estado` (`id_estado_reserva`),
  KEY `ix_dual_reservas_tipo_contrato` (`id_tipo_contrato`),
  KEY `ix_dr_empresa_tutor` (`id_empresa_tutor`),
  CONSTRAINT `fk_dr_empresa_tutor` FOREIGN KEY (`id_empresa_tutor`) REFERENCES `dual_empresa_tutores` (`id_empresa_tutor`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dr_estado_reserva` FOREIGN KEY (`id_estado_reserva`) REFERENCES `dual_estados_reserva` (`id_estado_reserva`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dr_solicitud_alumno` FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dr_solicitud_empresa_especialidad` FOREIGN KEY (`id_solicitud_empresa_especialidad`) REFERENCES `dual_solicitud_empresa_especialidades` (`id_solicitud_empresa_especialidad`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dr_tipo_contrato` FOREIGN KEY (`id_tipo_contrato`) REFERENCES `dual_tipos_contrato` (`id_tipo_contrato`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_roles
CREATE TABLE `dual_roles` (
  `id_rol` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(40) NOT NULL,
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `uq_dual_roles_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_solicitud_empresa_especialidades
CREATE TABLE `dual_solicitud_empresa_especialidades` (
  `id_solicitud_empresa_especialidad` int NOT NULL AUTO_INCREMENT,
  `id_solicitud_empresa` int NOT NULL,
  `id_especialidad` int NOT NULL,
  `cantidad_alumnos` smallint unsigned NOT NULL,
  PRIMARY KEY (`id_solicitud_empresa_especialidad`),
  UNIQUE KEY `uq_dsee_solicitud_especialidad` (`id_solicitud_empresa`,`id_especialidad`),
  KEY `ix_dsee_especialidad` (`id_especialidad`),
  CONSTRAINT `fk_dsee_especialidad` FOREIGN KEY (`id_especialidad`) REFERENCES `dual_especialidades` (`id_especialidad`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dsee_solicitud_empresa` FOREIGN KEY (`id_solicitud_empresa`) REFERENCES `dual_solicitudes_empresa` (`id_solicitud_empresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dsee_cantidad_alumnos` CHECK ((`cantidad_alumnos` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_solicitud_preferencias
CREATE TABLE `dual_solicitud_preferencias` (
  `id_solicitud_alumno` int NOT NULL,
  `orden` tinyint unsigned NOT NULL COMMENT '1, 2 o 3',
  `id_preferencia` int NOT NULL,
  PRIMARY KEY (`id_solicitud_alumno`,`orden`),
  KEY `ix_dsp_preferencia` (`id_preferencia`),
  CONSTRAINT `fk_dsp_preferencia` FOREIGN KEY (`id_preferencia`) REFERENCES `dual_preferencias` (`id_preferencia`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dsp_solicitud` FOREIGN KEY (`id_solicitud_alumno`) REFERENCES `dual_solicitudes_alumno` (`id_solicitud_alumno`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dsp_orden` CHECK ((`orden` between 1 and 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_solicitudes_alumno
CREATE TABLE `dual_solicitudes_alumno` (
  `id_solicitud_alumno` int NOT NULL AUTO_INCREMENT,
  `id_alumno` int NOT NULL,
  `id_convocatoria` int NOT NULL,
  `id_estado_validacion` tinyint unsigned NOT NULL DEFAULT '1',
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `motivo` text,
  PRIMARY KEY (`id_solicitud_alumno`),
  UNIQUE KEY `uq_dual_solicitudes_alumno` (`id_alumno`,`id_convocatoria`),
  KEY `ix_dsa_convocatoria_estado` (`id_convocatoria`,`id_estado_validacion`),
  KEY `fk_dsa_estado_validacion` (`id_estado_validacion`),
  CONSTRAINT `fk_dsa_alumno` FOREIGN KEY (`id_alumno`) REFERENCES `gf_alumnosfct` (`idalumno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dsa_convocatoria` FOREIGN KEY (`id_convocatoria`) REFERENCES `dual_convocatorias` (`id_convocatoria`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dsa_estado_validacion` FOREIGN KEY (`id_estado_validacion`) REFERENCES `dual_estados_validacion` (`id_estado_validacion`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_solicitudes_empresa
CREATE TABLE `dual_solicitudes_empresa` (
  `id_solicitud_empresa` int NOT NULL AUTO_INCREMENT,
  `id_empresa` int NOT NULL,
  `id_convocatoria` int NOT NULL,
  `id_estado_validacion` tinyint unsigned NOT NULL DEFAULT '1',
  `id_representante_legal` int NOT NULL,
  `id_coordinador_empresa` int NOT NULL,
  `id_domicilio_legal` int NOT NULL,
  `id_domicilio_trabajo` int NOT NULL,
  `descripcion_puesto` text NOT NULL,
  `fecha_solicitud` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `motivo` text,
  PRIMARY KEY (`id_solicitud_empresa`),
  UNIQUE KEY `uq_dual_solicitudes_empresa` (`id_empresa`,`id_convocatoria`),
  KEY `ix_dse_convocatoria_estado` (`id_convocatoria`,`id_estado_validacion`),
  KEY `ix_dse_representante` (`id_representante_legal`),
  KEY `ix_dse_coordinador` (`id_coordinador_empresa`),
  KEY `ix_dse_domicilio_legal` (`id_domicilio_legal`),
  KEY `ix_dse_domicilio_trabajo` (`id_domicilio_trabajo`),
  KEY `fk_dse_estado_validacion` (`id_estado_validacion`),
  CONSTRAINT `fk_dse_convocatoria` FOREIGN KEY (`id_convocatoria`) REFERENCES `dual_convocatorias` (`id_convocatoria`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dse_coordinador` FOREIGN KEY (`id_coordinador_empresa`) REFERENCES `ge_contactos` (`idcontacto`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dse_domicilio_legal` FOREIGN KEY (`id_domicilio_legal`) REFERENCES `ge_domicilios` (`iddomicilio`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dse_domicilio_trabajo` FOREIGN KEY (`id_domicilio_trabajo`) REFERENCES `ge_domicilios` (`iddomicilio`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dse_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dse_estado_validacion` FOREIGN KEY (`id_estado_validacion`) REFERENCES `dual_estados_validacion` (`id_estado_validacion`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dse_representante` FOREIGN KEY (`id_representante_legal`) REFERENCES `ge_contactos` (`idcontacto`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_tipos_contrato
CREATE TABLE `dual_tipos_contrato` (
  `id_tipo_contrato` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `nombre_mostrar` varchar(100) NOT NULL,
  PRIMARY KEY (`id_tipo_contrato`),
  UNIQUE KEY `uq_dual_tipos_contrato_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_tipos_documento
CREATE TABLE `dual_tipos_documento` (
  `id_tipo_documento` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(40) NOT NULL,
  PRIMARY KEY (`id_tipo_documento`),
  UNIQUE KEY `uq_dual_tipos_documento_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_transportes
CREATE TABLE `dual_transportes` (
  `id_transporte` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `nombre_mostrar` varchar(50) NOT NULL,
  PRIMARY KEY (`id_transporte`),
  UNIQUE KEY `uq_dual_transportes_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE dual_usuarios
CREATE TABLE `dual_usuarios` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `nombre_mostrar` varchar(100) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `id_rol` tinyint unsigned NOT NULL,
  `id_contacto` int DEFAULT NULL,
  `id_alumno` int DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `uq_dual_usuarios_email` (`email`),
  UNIQUE KEY `uq_dual_usuarios_contacto` (`id_contacto`),
  UNIQUE KEY `uq_dual_usuarios_alumno` (`id_alumno`),
  KEY `ix_dual_usuarios_rol` (`id_rol`),
  CONSTRAINT `fk_dual_usuarios_alumno` FOREIGN KEY (`id_alumno`) REFERENCES `gf_alumnosfct` (`idalumno`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dual_usuarios_contacto` FOREIGN KEY (`id_contacto`) REFERENCES `ge_contactos` (`idcontacto`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dual_usuarios_rol` FOREIGN KEY (`id_rol`) REFERENCES `dual_roles` (`id_rol`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dual_usuarios_activo` CHECK ((`activo` in (0,1))),
  CONSTRAINT `chk_dual_usuarios_pwd_change` CHECK ((`must_change_password` in (0,1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE ge_contactos
CREATE TABLE `ge_contactos` (
  `idcontacto` int NOT NULL AUTO_INCREMENT,
  `iddomicilio` int NOT NULL,
  `dni` varchar(15) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `telefono` varchar(50) NOT NULL,
  `cargo` varchar(100) NOT NULL,
  `observaciones` longtext NOT NULL,
  `especialidad` varchar(75) NOT NULL DEFAULT '',
  PRIMARY KEY (`idcontacto`),
  KEY `ix_ge_contactos_domicilio` (`iddomicilio`),
  KEY `ix_ge_contactos_nombre` (`nombre`),
  CONSTRAINT `fk_ge_contactos_domicilio` FOREIGN KEY (`iddomicilio`) REFERENCES `ge_domicilios` (`iddomicilio`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE ge_domicilios
CREATE TABLE `ge_domicilios` (
  `iddomicilio` int NOT NULL AUTO_INCREMENT,
  `idempresa` int NOT NULL,
  `domicilio` varchar(255) NOT NULL,
  `cp` varchar(10) NOT NULL,
  `provincia` varchar(50) NOT NULL,
  `localidad` varchar(100) NOT NULL,
  `telefono` varchar(50) NOT NULL DEFAULT '',
  `email` varchar(100) NOT NULL DEFAULT '',
  `especialidad` mediumtext NOT NULL,
  `municipio` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`iddomicilio`),
  KEY `ix_ge_domicilios_empresa` (`idempresa`),
  CONSTRAINT `fk_ge_domicilios_empresa` FOREIGN KEY (`idempresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE ge_empresas
CREATE TABLE `ge_empresas` (
  `idempresa` int NOT NULL AUTO_INCREMENT,
  `cif` varchar(12) NOT NULL,
  `empresa` varchar(100) NOT NULL,
  `convenio` varchar(6) NOT NULL DEFAULT '',
  `fechaconvenio` date DEFAULT NULL,
  `web` varchar(100) NOT NULL DEFAULT '',
  `observaciones` longtext NOT NULL,
  `emailEmpresa` varchar(100) DEFAULT NULL,
  `telefonoEmpresa` varchar(20) DEFAULT NULL,
  `menosdecincotrabajadores` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`idempresa`),
  UNIQUE KEY `uq_ge_empresas_cif` (`cif`),
  KEY `ix_ge_empresas_nombre` (`empresa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TABLE gf_alumnosfct
CREATE TABLE `gf_alumnosfct` (
  `idalumno` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `dni` varchar(15) NOT NULL,
  `domicilio` varchar(255) NOT NULL,
  `cp` varchar(10) NOT NULL,
  `localidad` varchar(100) NOT NULL,
  `telalumno` varchar(20) NOT NULL,
  `telfamilia` varchar(20) NOT NULL DEFAULT '',
  `email` varchar(100) NOT NULL,
  `especialidad` varchar(20) NOT NULL DEFAULT '',
  `id_especialidad_dual` int DEFAULT NULL,
  `idempresa` int DEFAULT NULL,
  `iddomicilio` int DEFAULT NULL,
  `idrepresentante` int DEFAULT NULL,
  `idtutorempresa` int DEFAULT NULL,
  `observaciones` longtext NOT NULL,
  `mesFCT` varchar(10) NOT NULL DEFAULT 'Junio',
  `nacionalidad` varchar(50) DEFAULT NULL,
  `fechaNacimiento` date DEFAULT NULL,
  `emailColegio` varchar(100) DEFAULT NULL,
  `sexo` varchar(15) DEFAULT NULL,
  `carnetDeConducir` tinyint(1) DEFAULT NULL,
  `tieneCoche` tinyint(1) DEFAULT NULL,
  `numeroSS` varchar(30) DEFAULT NULL,
  `situacionLaboral` varchar(30) DEFAULT NULL,
  `idiomasConocidos` varchar(255) DEFAULT NULL,
  `tutorLegal` varchar(100) DEFAULT NULL,
  `dniTutorLegal` varchar(15) DEFAULT NULL,
  PRIMARY KEY (`idalumno`),
  KEY `ix_gf_alumnosfct_dni` (`dni`),
  KEY `ix_gf_alumnosfct_empresa` (`idempresa`),
  KEY `ix_gf_alumnosfct_domicilio` (`iddomicilio`),
  KEY `ix_gf_alumnosfct_especialidad_dual` (`id_especialidad_dual`),
  CONSTRAINT `fk_gf_alumnosfct_domicilio` FOREIGN KEY (`iddomicilio`) REFERENCES `ge_domicilios` (`iddomicilio`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gf_alumnosfct_empresa` FOREIGN KEY (`idempresa`) REFERENCES `ge_empresas` (`idempresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gf_alumnosfct_especialidad_dual` FOREIGN KEY (`id_especialidad_dual`) REFERENCES `dual_especialidades` (`id_especialidad`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- FUNCTION fn_cupos_disponibles
DELIMITER $$
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
DELIMITER ;

-- FUNCTION fn_reservas_activas
DELIMITER $$
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
DELIMITER ;

-- VIEW vw_alumnos_disponibles
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_alumnos_disponibles` AS select `sa`.`id_solicitud_alumno` AS `id_solicitud_alumno`,`a`.`idalumno` AS `idalumno`,`a`.`nombre` AS `nombre`,`a`.`dni` AS `dni`,`a`.`email` AS `email`,`a`.`telalumno` AS `telalumno`,`e`.`codigo` AS `codigo_especialidad`,`e`.`nombre` AS `especialidad`,(case `e`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`c`.`nombre` AS `convocatoria` from ((((`dual_solicitudes_alumno` `sa` join `gf_alumnosfct` `a` on((`a`.`idalumno` = `sa`.`id_alumno`))) join `dual_especialidades` `e` on((`e`.`id_especialidad` = `a`.`id_especialidad_dual`))) join `dual_convocatorias` `c` on((`c`.`id_convocatoria` = `sa`.`id_convocatoria`))) left join `dual_reservas` `r_confirmada` on(((`r_confirmada`.`id_solicitud_alumno` = `sa`.`id_solicitud_alumno`) and (`r_confirmada`.`id_estado_reserva` = 2)))) where ((`c`.`activa` = 1) and (`sa`.`id_estado_validacion` = 2) and (`r_confirmada`.`id_reserva` is null));

-- VIEW vw_cupos_empresa_disponibles
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_cupos_empresa_disponibles` AS select `ee`.`id_solicitud_empresa_especialidad` AS `id_solicitud_empresa_especialidad`,`emp`.`idempresa` AS `idempresa`,`emp`.`empresa` AS `empresa`,`c`.`nombre` AS `convocatoria`,`esp`.`codigo` AS `codigo_especialidad`,`esp`.`nombre` AS `especialidad`,(case `esp`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`ee`.`cantidad_alumnos` AS `plazas_ofertadas`,`fn_reservas_activas`(`ee`.`id_solicitud_empresa_especialidad`) AS `plazas_ocupadas`,`fn_cupos_disponibles`(`ee`.`id_solicitud_empresa_especialidad`) AS `plazas_disponibles` from ((((`dual_solicitud_empresa_especialidades` `ee` join `dual_solicitudes_empresa` `se` on((`se`.`id_solicitud_empresa` = `ee`.`id_solicitud_empresa`))) join `ge_empresas` `emp` on((`emp`.`idempresa` = `se`.`id_empresa`))) join `dual_convocatorias` `c` on((`c`.`id_convocatoria` = `se`.`id_convocatoria`))) join `dual_especialidades` `esp` on((`esp`.`id_especialidad` = `ee`.`id_especialidad`))) where ((`c`.`activa` = 1) and (`se`.`id_estado_validacion` = 2));

-- VIEW vw_reservas_detalle
CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `vw_reservas_detalle` AS select `r`.`id_reserva` AS `id_reserva`,`er`.`nombre` AS `estado_reserva`,`r`.`motivo` AS `motivo`,`tc`.`nombre_mostrar` AS `tipo_contrato`,`a`.`idalumno` AS `idalumno`,`a`.`nombre` AS `alumno`,`a`.`dni` AS `dni_alumno`,`esp`.`codigo` AS `codigo_especialidad`,(case `esp`.`turno` when 0 then 'DIURNO' when 1 then 'VESPERTINO' end) AS `turno`,`emp`.`idempresa` AS `idempresa`,`emp`.`empresa` AS `empresa`,`ee`.`cantidad_alumnos` AS `plazas_ofertadas` from ((((((((`dual_reservas` `r` join `dual_estados_reserva` `er` on((`er`.`id_estado_reserva` = `r`.`id_estado_reserva`))) left join `dual_tipos_contrato` `tc` on((`tc`.`id_tipo_contrato` = `r`.`id_tipo_contrato`))) join `dual_solicitudes_alumno` `sa` on((`sa`.`id_solicitud_alumno` = `r`.`id_solicitud_alumno`))) join `gf_alumnosfct` `a` on((`a`.`idalumno` = `sa`.`id_alumno`))) join `dual_solicitud_empresa_especialidades` `ee` on((`ee`.`id_solicitud_empresa_especialidad` = `r`.`id_solicitud_empresa_especialidad`))) join `dual_especialidades` `esp` on((`esp`.`id_especialidad` = `ee`.`id_especialidad`))) join `dual_solicitudes_empresa` `se` on((`se`.`id_solicitud_empresa` = `ee`.`id_solicitud_empresa`))) join `ge_empresas` `emp` on((`emp`.`idempresa` = `se`.`id_empresa`)));

-- PROCEDURE sp_activar_convocatoria
DELIMITER $$
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
DELIMITER ;

-- PROCEDURE sp_asignar_transporte_empresa
DELIMITER $$
CREATE PROCEDURE `sp_asignar_transporte_empresa`(
  IN p_id_empresa INT,
  IN p_id_transporte TINYINT UNSIGNED
)
BEGIN
  INSERT IGNORE INTO dual_empresa_transportes (id_empresa, id_transporte)
  VALUES (p_id_empresa, p_id_transporte);
END$$
DELIMITER ;

-- PROCEDURE sp_cancelar_reserva
DELIMITER $$
CREATE PROCEDURE `sp_cancelar_reserva`(
  IN p_id_reserva INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelacion.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva
     AND id_estado_reserva = 1;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE existente puede cancelarse.';
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_cancelar_reserva_admin
DELIMITER $$
CREATE PROCEDURE `sp_cancelar_reserva_admin`(
  IN p_id_reserva INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_estado TINYINT DEFAULT NULL;
  DECLARE v_no_data INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la cancelacion.';
  END IF;

  START TRANSACTION;

  SET v_no_data = 0;
  SELECT id_estado_reserva INTO v_estado
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_no_data = 1 OR v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  IF v_estado = 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva ya esta cancelada.';
  END IF;

  IF v_estado NOT IN (1, 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estado de la reserva no permite cancelacion administrativa.';
  END IF;

  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva;

  COMMIT;
END$$
DELIMITER ;

-- PROCEDURE sp_confirmar_reserva
DELIMITER $$
CREATE PROCEDURE `sp_confirmar_reserva`(
  IN p_id_reserva INT,
  IN p_id_tipo_contrato TINYINT UNSIGNED
)
BEGIN
  DECLARE v_solicitud_alumno INT DEFAULT NULL;
  DECLARE v_estado_reserva TINYINT DEFAULT NULL;
  DECLARE v_bloqueo_solicitud INT DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id_solicitud_alumno, id_estado_reserva
    INTO v_solicitud_alumno, v_estado_reserva
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva
   FOR UPDATE;

  IF v_solicitud_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva indicada no existe.';
  END IF;

  IF v_estado_reserva <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede confirmarse.';
  END IF;

  SELECT id_solicitud_alumno INTO v_bloqueo_solicitud
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_solicitud_alumno
   FOR UPDATE;

  UPDATE dual_reservas
     SET id_estado_reserva = 2,
         id_tipo_contrato = p_id_tipo_contrato,
         motivo = NULL
   WHERE id_reserva = p_id_reserva;

  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = 'Alumno asignado a otra empresa.'
   WHERE id_solicitud_alumno = v_solicitud_alumno
     AND id_reserva <> p_id_reserva
     AND id_estado_reserva = 1;

  COMMIT;
END$$
DELIMITER ;

-- PROCEDURE sp_guardar_documento
DELIMITER $$
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
     LIMIT 1;
  ELSEIF p_id_solicitud_empresa IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_solicitud_empresa = p_id_solicitud_empresa
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1;
  ELSEIF p_id_reserva IS NOT NULL THEN
    SELECT id_documento INTO v_id FROM dual_documentos
     WHERE id_reserva = p_id_reserva
       AND id_tipo_documento = p_id_tipo_documento
       AND es_actual = 1
     ORDER BY id_documento DESC
     LIMIT 1;
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
DELIMITER ;

-- PROCEDURE sp_reasignar_reserva
DELIMITER $$
CREATE PROCEDURE `sp_reasignar_reserva`(
  IN p_id_reserva_origen INT,
  IN p_id_oferta_destino INT,
  IN p_motivo TEXT
)
BEGIN
  DECLARE v_id_alumno INT DEFAULT NULL;
  DECLARE v_oferta_origen INT DEFAULT NULL;
  DECLARE v_estado_origen TINYINT DEFAULT NULL;
  DECLARE v_id_nueva INT DEFAULT NULL;
  DECLARE v_estado_dest TINYINT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE v_lock_count INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo de la reasignacion.';
  END IF;

  START TRANSACTION;

  SET v_no_data = 0;
  SELECT id_solicitud_alumno, id_solicitud_empresa_especialidad, id_estado_reserva
    INTO v_id_alumno, v_oferta_origen, v_estado_origen
    FROM dual_reservas
   WHERE id_reserva = p_id_reserva_origen
   FOR UPDATE;

  IF v_no_data = 1 OR v_id_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La reserva de origen no existe.';
  END IF;

  IF v_estado_origen = 3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede reasignar una reserva cancelada.';
  END IF;

  IF v_oferta_origen = p_id_oferta_destino THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La oferta de destino debe ser distinta a la actual.';
  END IF;

  SET v_no_data = 0;
  SELECT cantidad_alumnos INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
   FOR UPDATE;

  IF v_no_data = 1 OR v_cantidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La oferta de destino no existe.';
  END IF;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = v_id_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_alumno = v_id_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
   FOR UPDATE;

  SELECT COUNT(*) INTO v_ocupadas
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_oferta_destino
     AND id_estado_reserva IN (1, 2);

  SET v_no_data = 0;
  SET v_id_nueva = NULL;
  SET v_estado_dest = NULL;
  SELECT id_reserva, id_estado_reserva
    INTO v_id_nueva, v_estado_dest
    FROM dual_reservas
   WHERE id_solicitud_alumno = v_id_alumno
     AND id_solicitud_empresa_especialidad = p_id_oferta_destino
   LIMIT 1
   FOR UPDATE;

  IF v_no_data = 1 THEN
    SET v_id_nueva = NULL;
    SET v_estado_dest = NULL;
  END IF;

  IF v_id_nueva IS NOT NULL AND v_estado_dest IN (1, 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno ya tiene una reserva activa con esa oferta.';
  END IF;

  IF v_id_nueva IS NULL AND v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles en la oferta de destino.';
  END IF;

  IF v_id_nueva IS NOT NULL AND v_estado_dest = 3 AND v_ocupadas >= v_cantidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No quedan plazas disponibles en la oferta de destino.';
  END IF;



  UPDATE dual_reservas
     SET id_estado_reserva = 3,
         id_tipo_contrato = NULL,
         motivo = p_motivo
   WHERE id_reserva = p_id_reserva_origen;

  IF v_id_nueva IS NULL THEN
    INSERT INTO dual_reservas (
      id_solicitud_alumno,
      id_solicitud_empresa_especialidad,
      id_estado_reserva,
      id_tipo_contrato,
      motivo
    ) VALUES (
      v_id_alumno,
      p_id_oferta_destino,
      1,
      NULL,
      NULL
    );
    SET v_id_nueva = LAST_INSERT_ID();
  ELSE
    UPDATE dual_reservas
       SET id_estado_reserva = 1,
           id_tipo_contrato = NULL,
           motivo = NULL
     WHERE id_reserva = v_id_nueva;
  END IF;

  COMMIT;
  SELECT v_id_nueva AS id_reserva, p_id_reserva_origen AS id_reserva_origen;
END$$
DELIMITER ;

-- PROCEDURE sp_rechazar_documento
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_documento`(
  IN p_id_documento INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo del rechazo del documento.';
  END IF;

  UPDATE dual_documentos
     SET id_estado_validacion = 3,
         motivo = p_motivo
   WHERE id_documento = p_id_documento;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento indicado no existe.';
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_rechazar_solicitud_alumno
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo del rechazo de la solicitud de alumno.';
  END IF;

  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = 3,
         motivo = p_motivo
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_rechazar_solicitud_empresa
DELIMITER $$
CREATE PROCEDURE `sp_rechazar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT,
  IN p_motivo TEXT
)
BEGIN
  IF p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe indicar el motivo del rechazo de la solicitud de empresa.';
  END IF;

  UPDATE dual_solicitudes_empresa
     SET id_estado_validacion = 3,
         motivo = p_motivo
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_reservar_alumno
DELIMITER $$
CREATE PROCEDURE `sp_reservar_alumno`(
  IN p_id_solicitud_alumno INT,
  IN p_id_solicitud_empresa_especialidad INT
)
BEGIN
  DECLARE v_id_reserva INT DEFAULT NULL;
  DECLARE v_estado TINYINT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_no_data INT DEFAULT 0;
  DECLARE v_lock_alumno INT DEFAULT NULL;
  DECLARE v_lock_count INT DEFAULT 0;
  DECLARE v_ya_confirmado INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_no_data = 1;

  START TRANSACTION;

  SET v_no_data = 0;
  SELECT cantidad_alumnos INTO v_cantidad
    FROM dual_solicitud_empresa_especialidades
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   FOR UPDATE;

  IF v_no_data = 1 OR v_cantidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La especialidad solicitada por la empresa no existe.';
  END IF;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   FOR UPDATE;

  SET v_no_data = 0;
  SELECT id_solicitud_alumno INTO v_lock_alumno
    FROM dual_solicitudes_alumno
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
   FOR UPDATE;

  IF v_no_data = 1 OR v_lock_alumno IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud del alumno no existe.';
  END IF;

  SELECT COUNT(*) INTO v_lock_count
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
   FOR UPDATE;

  SELECT COUNT(*) INTO v_ocupadas
    FROM dual_reservas
   WHERE id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
     AND id_estado_reserva IN (1, 2);

  SELECT COUNT(*) INTO v_ya_confirmado
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_estado_reserva = 2;

  SET v_no_data = 0;
  SET v_id_reserva = NULL;
  SET v_estado = NULL;
  SELECT id_reserva, id_estado_reserva
    INTO v_id_reserva, v_estado
    FROM dual_reservas
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_solicitud_empresa_especialidad = p_id_solicitud_empresa_especialidad
   LIMIT 1
   FOR UPDATE;

  IF v_no_data = 1 THEN
    SET v_id_reserva = NULL;
    SET v_estado = NULL;
  END IF;

  IF v_id_reserva IS NULL THEN
    IF v_ya_confirmado > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad.';
    END IF;

    INSERT INTO dual_reservas (
      id_solicitud_alumno,
      id_solicitud_empresa_especialidad,
      id_estado_reserva,
      id_tipo_contrato,
      motivo
    ) VALUES (
      p_id_solicitud_alumno,
      p_id_solicitud_empresa_especialidad,
      1,
      NULL,
      NULL
    );
    SET v_id_reserva = LAST_INSERT_ID();
  ELSE
    IF v_estado = 1 THEN
      SET v_id_reserva = v_id_reserva;
    ELSEIF v_estado = 2 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada con esta oferta.';
    ELSE
      IF v_ya_confirmado > 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
      END IF;
      IF v_ocupadas >= v_cantidad THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad.';
      END IF;

      UPDATE dual_reservas
         SET id_estado_reserva = 1,
             id_tipo_contrato = NULL,
             motivo = NULL
       WHERE id_reserva = v_id_reserva;
    END IF;
  END IF;

  COMMIT;
  SELECT v_id_reserva AS id_reserva;
END$$
DELIMITER ;

-- PROCEDURE sp_validar_documento
DELIMITER $$
CREATE PROCEDURE `sp_validar_documento`(
  IN p_id_documento INT
)
BEGIN
  UPDATE dual_documentos
     SET id_estado_validacion = 2,
         motivo = NULL
   WHERE id_documento = p_id_documento;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El documento indicado no existe.';
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_validar_solicitud_alumno
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_alumno`(
  IN p_id_solicitud_alumno INT
)
BEGIN
  DECLARE v_cv_validado INT DEFAULT 0;
  DECLARE v_anexo_validado INT DEFAULT 0;

  SELECT COUNT(*) INTO v_cv_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = 1
     AND id_estado_validacion = 2;

  SELECT COUNT(*) INTO v_anexo_validado
    FROM dual_documentos
   WHERE id_solicitud_alumno = p_id_solicitud_alumno
     AND id_tipo_documento = 2
     AND id_estado_validacion = 2;

  IF v_cv_validado = 0 OR v_anexo_validado = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Para validar al alumno deben estar validados CV y ANEXO_2.';
  END IF;

  UPDATE dual_solicitudes_alumno
     SET id_estado_validacion = 2,
         motivo = NULL
   WHERE id_solicitud_alumno = p_id_solicitud_alumno;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de alumno indicada no existe.';
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_validar_solicitud_empresa
DELIMITER $$
CREATE PROCEDURE `sp_validar_solicitud_empresa`(
  IN p_id_solicitud_empresa INT
)
BEGIN
  DECLARE v_convenio_validado INT DEFAULT 0;
  DECLARE v_especialidades INT DEFAULT 0;

  SELECT COUNT(*) INTO v_convenio_validado
    FROM dual_documentos
   WHERE id_solicitud_empresa = p_id_solicitud_empresa
     AND id_tipo_documento = 3
     AND id_estado_validacion = 2;

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
     SET id_estado_validacion = 2,
         motivo = NULL
   WHERE id_solicitud_empresa = p_id_solicitud_empresa;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La solicitud de empresa indicada no existe.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_convocatorias_bi_una_activa
DELIMITER $$
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
DELIMITER ;

-- TRIGGER trg_convocatorias_bu_una_activa
DELIMITER $$
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
DELIMITER ;

-- TRIGGER trg_dd_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dd_bi_reglas` BEFORE INSERT ON `dual_documentos` FOR EACH ROW BEGIN
  DECLARE v_tipo VARCHAR(40) DEFAULT NULL;

  SELECT nombre INTO v_tipo
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_tipo IN ('CV', 'ANEXO_2') AND NEW.id_solicitud_alumno IS NULL)
     OR (v_tipo = 'CONVENIO' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_tipo = 'ANEXO_H' AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dd_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dd_bu_reglas` BEFORE UPDATE ON `dual_documentos` FOR EACH ROW BEGIN
  DECLARE v_tipo VARCHAR(40) DEFAULT NULL;

  SELECT nombre INTO v_tipo
    FROM dual_tipos_documento
   WHERE id_tipo_documento = NEW.id_tipo_documento;

  IF (NEW.id_solicitud_alumno IS NOT NULL) +
     (NEW.id_solicitud_empresa IS NOT NULL) +
     (NEW.id_reserva IS NOT NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Cada documento debe pertenecer exactamente a una solicitud o reserva.';
  END IF;

  IF (v_tipo IN ('CV', 'ANEXO_2') AND NEW.id_solicitud_alumno IS NULL)
     OR (v_tipo = 'CONVENIO' AND NEW.id_solicitud_empresa IS NULL)
     OR (v_tipo = 'ANEXO_H' AND NEW.id_reserva IS NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de documento no corresponde al registro padre indicado.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Un documento rechazado requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando un documento es rechazado.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dr_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dr_bi_reglas` BEFORE INSERT ON `dual_reservas` FOR EACH ROW BEGIN
  DECLARE v_estado_alumno TINYINT DEFAULT NULL;
  DECLARE v_estado_empresa TINYINT DEFAULT NULL;
  DECLARE v_convocatoria_alumno INT DEFAULT NULL;
  DECLARE v_convocatoria_empresa INT DEFAULT NULL;
  DECLARE v_especialidad_alumno INT DEFAULT NULL;
  DECLARE v_especialidad_empresa INT DEFAULT NULL;
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

  SELECT sa.id_estado_validacion, sa.id_convocatoria, a.id_especialidad_dual
    INTO v_estado_alumno, v_convocatoria_alumno, v_especialidad_alumno
    FROM dual_solicitudes_alumno sa
    JOIN gf_alumnosfct a ON a.idalumno = sa.id_alumno
   WHERE sa.id_solicitud_alumno = NEW.id_solicitud_alumno;

  SELECT se.id_estado_validacion, se.id_convocatoria, ee.id_especialidad, ee.cantidad_alumnos
    INTO v_estado_empresa, v_convocatoria_empresa, v_especialidad_empresa, v_cantidad
    FROM dual_solicitud_empresa_especialidades ee
    JOIN dual_solicitudes_empresa se ON se.id_solicitud_empresa = ee.id_solicitud_empresa
   WHERE ee.id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad;

  IF v_estado_alumno <> 2 OR v_estado_empresa <> 2 THEN
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

  IF NEW.id_estado_reserva IN (1, 2) THEN
    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (1, 2);

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para esta especialidad de empresa.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = 2;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;

  IF NEW.id_estado_reserva = 2 AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva <> 2 AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El tipo de contrato solo se indica en una reserva confirmada.';
  END IF;

  IF NEW.id_estado_reserva = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dr_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dr_bu_reglas` BEFORE UPDATE ON `dual_reservas` FOR EACH ROW BEGIN
  DECLARE v_cantidad INT DEFAULT 0;
  DECLARE v_ocupadas INT DEFAULT 0;
  DECLARE v_confirmadas INT DEFAULT 0;

  IF NEW.id_solicitud_alumno <> OLD.id_solicitud_alumno
     OR NEW.id_solicitud_empresa_especialidad <> OLD.id_solicitud_empresa_especialidad THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se puede cambiar el alumno ni la especialidad de una reserva existente.';
  END IF;

  IF OLD.id_estado_reserva = 2 AND NEW.id_estado_reserva NOT IN (2, 3) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada solo puede cancelarse de forma administrativa.';
  END IF;

  IF NEW.id_estado_reserva = 2 AND OLD.id_estado_reserva NOT IN (1, 2) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo una reserva PENDIENTE puede pasar a CONFIRMADA.';
  END IF;

  IF NEW.id_estado_reserva = 2 AND NEW.id_tipo_contrato IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva confirmada requiere tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva = 3 AND NEW.id_tipo_contrato IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada no puede tener tipo de contrato.';
  END IF;

  IF NEW.id_estado_reserva = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una reserva cancelada requiere motivo.';
  END IF;

  IF NEW.id_estado_reserva <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando una reserva es cancelada.';
  END IF;

  IF NEW.id_estado_reserva IN (1, 2) AND OLD.id_estado_reserva = 3 THEN
    SELECT cantidad_alumnos INTO v_cantidad
      FROM dual_solicitud_empresa_especialidades
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad;

    SELECT COUNT(*) INTO v_ocupadas
      FROM dual_reservas
     WHERE id_solicitud_empresa_especialidad = NEW.id_solicitud_empresa_especialidad
       AND id_estado_reserva IN (1, 2)
       AND id_reserva <> OLD.id_reserva;

    IF v_ocupadas >= v_cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No quedan plazas disponibles para reactivar la reserva.';
    END IF;

    SELECT COUNT(*) INTO v_confirmadas
      FROM dual_reservas
     WHERE id_solicitud_alumno = NEW.id_solicitud_alumno
       AND id_estado_reserva = 2
       AND id_reserva <> OLD.id_reserva;

    IF v_confirmadas > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El alumno ya tiene una reserva confirmada.';
    END IF;
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dsa_bi_reglas
DELIMITER $$
CREATE TRIGGER `trg_dsa_bi_reglas` BEFORE INSERT ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  DECLARE v_especialidad INT DEFAULT NULL;
  DECLARE v_activa TINYINT DEFAULT 0;

  SELECT id_especialidad_dual INTO v_especialidad
    FROM gf_alumnosfct
   WHERE idalumno = NEW.id_alumno;

  SELECT activa INTO v_activa
    FROM dual_convocatorias
   WHERE id_convocatoria = NEW.id_convocatoria;

  IF v_especialidad IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El alumno debe tener id_especialidad_dual antes de solicitar Dual.';
  END IF;

  IF v_activa <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo se pueden crear solicitudes en la convocatoria activa.';
  END IF;

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dsa_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dsa_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_alumno` FOR EACH ROW BEGIN
  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de alumno rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de alumno es rechazada.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dse_bi_reglas
DELIMITER $$
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

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dse_bu_reglas
DELIMITER $$
CREATE TRIGGER `trg_dse_bu_reglas` BEFORE UPDATE ON `dual_solicitudes_empresa` FOR EACH ROW BEGIN
  DECLARE v_empresa_representante INT DEFAULT NULL;
  DECLARE v_empresa_coordinador INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_legal INT DEFAULT NULL;
  DECLARE v_empresa_domicilio_trabajo INT DEFAULT NULL;

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

  IF NEW.id_estado_validacion = 3 AND (NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Una solicitud de empresa rechazada requiere motivo.';
  END IF;

  IF NEW.id_estado_validacion <> 3 AND NEW.motivo IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El motivo solo se guarda cuando la solicitud de empresa es rechazada.';
  END IF;
END$$
DELIMITER ;

-- TRIGGER trg_dual_usuarios_bi_role_links
DELIMITER $$
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
DELIMITER ;

-- TRIGGER trg_dual_usuarios_bu_role_links
DELIMITER $$
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

-- Lookup rows (fixed ids)
INSERT INTO `dual_roles` (`id_rol`, `nombre`) VALUES
  (1, 'ADMINISTRADOR'),
  (2, 'COORDINADOR'),
  (3, 'EMPRESA'),
  (4, 'ALUMNO');
INSERT INTO `dual_estados_validacion` (`id_estado_validacion`, `nombre`) VALUES
  (1, 'PENDIENTE'),
  (2, 'VALIDADO'),
  (3, 'RECHAZADO');
INSERT INTO `dual_estados_reserva` (`id_estado_reserva`, `nombre`) VALUES
  (1, 'PENDIENTE'),
  (2, 'CONFIRMADA'),
  (3, 'CANCELADA');
INSERT INTO `dual_tipos_documento` (`id_tipo_documento`, `nombre`) VALUES
  (1, 'CV'),
  (2, 'ANEXO_2'),
  (3, 'CONVENIO'),
  (4, 'ANEXO_H'),
  (5, 'OTRO'),
  (6, 'ANEXO_DGA'),
  (7, 'FORMULARIO'),
  (8, 'ANEXO_XIV'),
  (9, 'ANEXO_G'),
  (10, 'ANEXO_II'),
  (11, 'ANEXO_III'),
  (12, 'CALENDARIO'),
  (13, 'EXCEL');
INSERT INTO `dual_tipos_contrato` (`id_tipo_contrato`, `nombre`, `nombre_mostrar`) VALUES
  (1, 'BECA', 'Beca'),
  (2, 'CONTRATO_DE_FORMACION_EN_ALTERNANCIA', 'Contrato de formación en alternancia'),
  (3, 'CONVENIO', 'Convenio'),
  (4, 'OTRO', 'Otro');
INSERT INTO `dual_transportes` (`id_transporte`, `nombre`, `nombre_mostrar`) VALUES
  (1, 'A_PIE', 'A pie'),
  (2, 'COCHE', 'Coche'),
  (3, 'AUTOBUS', 'Autobús'),
  (4, 'TRANVIA', 'Tranvía'),
  (5, 'TREN', 'Tren'),
  (6, 'BICICLETA', 'Bicicleta');

SET FOREIGN_KEY_CHECKS = 1;
