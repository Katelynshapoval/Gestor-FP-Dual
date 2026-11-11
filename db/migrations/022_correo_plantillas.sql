-- 022_correo_plantillas.sql
-- Email texts move from the code into the database so administrators can edit
-- them. The backend only decides when an email is sent, to whom and with which
-- values; subject and body always come from these tables.
--
-- 1. dual_correo_plantillas: one row per email (clave), plus `pie`, the footer
--    added to every email. `activa` = 0 stops that email; rows with
--    `desactivable` = 0 (password reset, footer) can never be switched off.
-- 2. dual_correo_variables: the variables each email may use, with the label,
--    description and example the editor shows on its clickable chips.
--    tipo TEXTO = escaped text, ENLACE = http(s) URL, LISTA = one item per
--    line. `fragmento` is what a chip inserts (default {{variable}}).
--    `obligatoria` = the template must use it; `opcional` = may be empty.
-- 3. dual_correo_plantillas_historial: every saved version. Version 1 is the
--    text below, which is the text the code sent until this migration
--    («Restaurar original» goes back to it).
-- 4. dual_eventos accepts entidad = 'CORREO' (id_entidad = id_historial), so
--    each edit is audited in the same transaction.
--
-- Template syntax (validated by the backend on save):
--   {{variable}}                 value, HTML-escaped
--   {{#variable}} … {{/variable}} shown only when the value is not empty
--   {{^variable}} … {{/variable}} shown only when the value is empty
--   **texto**                    bold
--   [texto](https://… or {{enlace}})  link
--   blank line = new paragraph; a paragraph that is only a LISTA variable
--   becomes a bulleted list.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS and upserts that keep existing rows
-- (a re-run never overwrites an administrator's edit). The CHECK of
-- dual_eventos is dropped and re-added, as in 019.
--
-- Deploy together with the backend that reads these tables: the previous
-- backend ignores them, the new one sends nothing without them.
--
-- Rollback: db/rollback/022_correo_plantillas.down.sql
-- It stops, changing nothing, while any CORREO event exists (i.e. once an
-- administrator has edited an email).

CREATE TABLE IF NOT EXISTS `dual_correo_plantillas` (
  `clave` varchar(60) NOT NULL,
  `grupo` varchar(30) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `destinatario` varchar(80) NOT NULL,
  `cuando` varchar(255) NOT NULL,
  `orden` smallint unsigned NOT NULL DEFAULT '0',
  `asunto` varchar(200) NOT NULL,
  `cuerpo` text NOT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  `desactivable` tinyint(1) NOT NULL DEFAULT '1',
  `version` int unsigned NOT NULL DEFAULT '1',
  `id_usuario_actualiza` int DEFAULT NULL,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`),
  KEY `ix_dcp_usuario` (`id_usuario_actualiza`),
  CONSTRAINT `fk_dcp_usuario` FOREIGN KEY (`id_usuario_actualiza`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dcp_grupo` CHECK (`grupo` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'DOCUMENTOS', 'RESERVAS', 'CUENTA', 'GENERAL')),
  CONSTRAINT `chk_dcp_activa` CHECK (`activa` IN (0, 1) AND `desactivable` IN (0, 1)),
  CONSTRAINT `chk_dcp_siempre_activa` CHECK (`activa` = 1 OR `desactivable` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_correo_variables` (
  `clave_plantilla` varchar(60) NOT NULL,
  `variable` varchar(40) NOT NULL,
  `tipo` varchar(10) NOT NULL DEFAULT 'TEXTO',
  `etiqueta` varchar(80) NOT NULL,
  `descripcion` varchar(255) NOT NULL,
  `ejemplo` varchar(500) NOT NULL,
  `fragmento` varchar(300) DEFAULT NULL,
  `opcional` tinyint(1) NOT NULL DEFAULT '0',
  `obligatoria` tinyint(1) NOT NULL DEFAULT '0',
  `orden` smallint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`clave_plantilla`, `variable`),
  CONSTRAINT `fk_dcv_plantilla` FOREIGN KEY (`clave_plantilla`) REFERENCES `dual_correo_plantillas` (`clave`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_dcv_tipo` CHECK (`tipo` IN ('TEXTO', 'ENLACE', 'LISTA')),
  CONSTRAINT `chk_dcv_nombre` CHECK (REGEXP_LIKE(`variable`, '^[a-z][a-z0-9_]*$', 'c')),
  CONSTRAINT `chk_dcv_flags` CHECK (`opcional` IN (0, 1) AND `obligatoria` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `dual_correo_plantillas_historial` (
  `id_historial` int NOT NULL AUTO_INCREMENT,
  `clave_plantilla` varchar(60) NOT NULL,
  `version` int unsigned NOT NULL,
  `asunto` varchar(200) NOT NULL,
  `cuerpo` text NOT NULL,
  `activa` tinyint(1) NOT NULL,
  `id_usuario` int DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_historial`),
  UNIQUE KEY `uq_dcph_version` (`clave_plantilla`, `version`),
  KEY `ix_dcph_usuario` (`id_usuario`),
  CONSTRAINT `fk_dcph_plantilla` FOREIGN KEY (`clave_plantilla`) REFERENCES `dual_correo_plantillas` (`clave`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_dcph_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `dual_usuarios` (`id_usuario`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Version 1 of every email: the text the backend sent before this migration.
INSERT INTO `dual_correo_plantillas`
  (`clave`, `grupo`, `nombre`, `destinatario`, `cuando`, `orden`, `asunto`, `cuerpo`, `activa`, `desactivable`)
VALUES
  ('solicitud_alumno_recibida', 'SOLICITUD_ALUMNO', 'Solicitud recibida', 'Alumno', 'Al enviar el formulario público de solicitud de alumno.', 10, 'Solicitud Dual recibida', 'Hola **{{alumno}}**:\n\nHemos recibido tu solicitud para la convocatoria **{{convocatoria}}**.\n\nEn los próximos días revisaremos tu documentación y te informaremos del resultado.\n\nPuedes consultar el estado de tu solicitud iniciando sesión con tu DNI/NIE{{#enlace_portal}} en {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('solicitud_alumno_validada', 'SOLICITUD_ALUMNO', 'Solicitud validada', 'Alumno', 'Cuando el centro valida la solicitud del alumno.', 20, 'Tu solicitud de FP Dual ha sido validada', 'Hola {{alumno}}:\n\nTu solicitud para la convocatoria **{{convocatoria}}** ({{ciclo}}) ha sido **validada**.\n\nA partir de ahora las empresas colaboradoras pueden reservar tu candidatura. Te avisaremos cuando haya una reserva.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('solicitud_alumno_rechazada', 'SOLICITUD_ALUMNO', 'Solicitud no aceptada', 'Alumno', 'Cuando el centro rechaza la solicitud del alumno.', 30, 'Tu solicitud de FP Dual no ha sido aceptada', 'Hola {{alumno}}:\n\nTu solicitud para la convocatoria **{{convocatoria}}** no ha sido aceptada.\n\n{{#motivo}}Motivo indicado por el centro: {{motivo}}\n\n{{/motivo}}Si crees que se trata de un error o puedes corregirlo, ponte en contacto con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('ciclo_corregido', 'SOLICITUD_ALUMNO', 'Ciclo corregido', 'Alumno', 'Cuando el centro cambia el ciclo de la solicitud (edición directa o petición aprobada).', 40, 'Hemos corregido el ciclo de tu solicitud de FP Dual', 'Hola {{alumno}}:\n\nEl centro ha corregido el ciclo de tu solicitud para la convocatoria **{{convocatoria}}**. Ahora figura como **{{ciclo}}**.\n\nSi no es correcto, ponte en contacto con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('cambio_datos_aprobado', 'SOLICITUD_ALUMNO', 'Corrección de datos aprobada', 'Alumno', 'Cuando el centro aprueba la petición de corrección de datos del alumno.', 50, 'Hemos corregido tus datos de FP Dual', 'Hola {{alumno}}:\n\nEl centro ha aprobado la corrección de datos que pediste para la convocatoria **{{convocatoria}}**.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('cambio_datos_rechazado', 'SOLICITUD_ALUMNO', 'Corrección de datos rechazada', 'Alumno', 'Cuando el centro rechaza la petición de corrección de datos del alumno.', 60, 'Tu petición de corrección de datos no se ha aplicado', 'Hola {{alumno}}:\n\nEl centro no ha aplicado la corrección de datos que pediste para la convocatoria **{{convocatoria}}**.\n\n{{#motivo}}Motivo indicado por el centro: {{motivo}}\n\n{{/motivo}}Puedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('solicitud_empresa_recibida_convenio', 'SOLICITUD_EMPRESA', 'Solicitud recibida (con convenio adjunto)', 'Empresa (coordinador)', 'Al enviar o volver a presentar la solicitud de empresa, cuando el convenio se ha generado: el PDF va adjunto.', 70, 'Solicitud Dual Empresa recibida', 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\nAdjuntamos el convenio generado. La firma y la validación se registran en el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('solicitud_empresa_recibida', 'SOLICITUD_EMPRESA', 'Solicitud recibida (sin convenio)', 'Empresa (coordinador)', 'Al enviar o volver a presentar la solicitud de empresa, cuando el convenio aún no se ha podido generar.', 80, 'Solicitud Dual Empresa recibida', 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\nEl convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('convenio_disponible_adjunto', 'SOLICITUD_EMPRESA', 'Convenio disponible (PDF adjunto)', 'Empresa (coordinador)', 'Cuando el centro genera o regenera el convenio y el PDF va adjunto.', 90, 'Tu convenio está disponible', 'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\nLo adjuntamos a este correo. Descargadlo, firmadlo y subidlo firmado desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('convenio_disponible', 'SOLICITUD_EMPRESA', 'Convenio disponible (sin adjunto)', 'Empresa (coordinador)', 'Cuando el centro genera el convenio pero el PDF no se puede adjuntar.', 100, 'Tu convenio está disponible', 'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\nDescargadlo desde el portal, firmadlo y subidlo firmado.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('solicitud_empresa_validada', 'SOLICITUD_EMPRESA', 'Solicitud validada', 'Empresa (coordinador)', 'Cuando el centro valida la solicitud de la empresa (también al validar el convenio).', 110, 'Vuestra solicitud de FP Dual ha sido validada', 'Estimado/a {{coordinador}}:\n\nLa solicitud de **{{empresa}}** para la convocatoria **{{convocatoria}}** ha sido **validada**.\n\nYa podéis consultar los alumnos disponibles de vuestros ciclos y reservar candidaturas desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('solicitud_empresa_rechazada', 'SOLICITUD_EMPRESA', 'Solicitud no aceptada', 'Empresa (coordinador)', 'Cuando el centro rechaza la solicitud de la empresa.', 120, 'Vuestra solicitud de FP Dual no ha sido aceptada', 'Estimado/a {{coordinador}}:\n\nLa solicitud de **{{empresa}}** para la convocatoria **{{convocatoria}}** no ha sido aceptada.\n\n{{#motivo}}Motivo indicado por el centro: {{motivo}}\n\n{{/motivo}}Para cualquier aclaración, contactad con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('documento_rechazado_alumno', 'DOCUMENTOS', 'Documento rechazado (solicitud de alumno)', 'Alumno', 'Cuando el centro rechaza un documento de la solicitud del alumno.', 130, 'Documento rechazado: {{documento}}', 'Hola {{alumno}}:\n\nEl centro ha rechazado el documento **{{documento}}** de tu solicitud ({{convocatoria}}).\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}Sube una versión corregida desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('documento_rechazado_empresa', 'DOCUMENTOS', 'Documento rechazado (solicitud de empresa)', 'Empresa (coordinador)', 'Cuando el centro rechaza un documento de la solicitud de la empresa.', 140, 'Documento rechazado: {{documento}}', 'Estimado/a {{coordinador}}:\n\nEl centro ha rechazado el documento **{{documento}}** de {{empresa}} ({{convocatoria}}).\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}Sube una versión corregida desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('documento_rechazado_reserva', 'DOCUMENTOS', 'Documento rechazado (reserva)', 'Empresa (coordinador)', 'Cuando el centro rechaza un documento de una reserva (Anexo II/III, calendario), que sube la empresa.', 150, 'Documento rechazado: {{documento}}', 'Estimado/a {{coordinador}}:\n\nEl centro ha rechazado el documento **{{documento}}** de la reserva de {{alumno}} ({{ciclo}}).\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}Sube una versión corregida desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('reserva_creada_alumno', 'RESERVAS', 'Reserva creada', 'Alumno', 'Cuando una empresa (o el centro) reserva la candidatura del alumno.', 160, 'Una empresa ha reservado tu candidatura', 'Hola {{alumno}}:\n\n**{{empresa}}** ha reservado tu candidatura para **{{ciclo}}** (convocatoria {{convocatoria}}).\n\nLa plaza no es definitiva hasta que el centro la confirme, una vez firmado y validado el Anexo II o III.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('reserva_creada_empresa', 'RESERVAS', 'Alumno asignado por el centro', 'Empresa (coordinador)', 'Cuando el centro crea una reserva para la empresa o le reasigna un alumno.', 170, 'El centro ha asignado un alumno a vuestra empresa', 'Estimado/a {{coordinador}}:\n\nEl centro ha creado una reserva de **{{alumno}}** para **{{ciclo}}** en {{empresa}}.\n\nConsultad la reserva en el portal para completar su documentación.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('reserva_cancelada_alumno', 'RESERVAS', 'Reserva cancelada', 'Alumno', 'Cuando se cancela una reserva del alumno (empresa, centro, reducción de plazas o baja de la empresa).', 180, 'Una reserva de tu candidatura se ha cancelado', 'Hola {{alumno}}:\n\nLa reserva de **{{empresa}}** para {{ciclo}} ha sido cancelada.\n\nTu solicitud sigue activa: otras empresas pueden reservar tu candidatura.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('reserva_cancelada_empresa', 'RESERVAS', 'Reserva cancelada por el centro', 'Empresa (coordinador)', 'Cuando el centro cancela una reserva de la empresa (cancelación, reasignación, confirmación en otra empresa o baja del alumno).', 190, 'Una reserva de vuestra empresa se ha cancelado', 'Estimado/a {{coordinador}}:\n\nLa reserva de **{{alumno}}** para {{ciclo}} en {{empresa}} ha sido cancelada por el centro.\n\nLa plaza vuelve a estar disponible. Para más información, contactad con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('reserva_confirmada_alumno', 'RESERVAS', 'Plaza confirmada', 'Alumno', 'Cuando el centro confirma la reserva del alumno.', 200, 'Tu plaza de FP Dual está confirmada', 'Hola {{alumno}}:\n\nEl centro ha confirmado tu plaza en **{{empresa}}** para **{{ciclo}}** (convocatoria {{convocatoria}}).\n\nTus otras reservas pendientes, si las había, se han cancelado.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('reserva_confirmada_empresa', 'RESERVAS', 'Reserva confirmada', 'Empresa (coordinador)', 'Cuando el centro confirma la reserva de la empresa.', 210, 'Reserva confirmada', 'Estimado/a {{coordinador}}:\n\nEl centro ha confirmado la plaza de **{{alumno}}** en {{empresa}} para {{ciclo}}.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1, 1),
  ('cupo_reducido_empresa', 'RESERVAS', 'Reducción de plazas', 'Empresa (coordinador)', 'Cuando se reduce el número de plazas de un ciclo y se cancelan reservas pendientes.', 220, 'Reservas pendientes canceladas por reducción de plazas', 'Estimado/a coordinador/a de **{{empresa}}**:\n\nSe ha reducido el número de plazas de **{{ciclo}}** de {{plazas_antes}} a {{plazas_despues}}.\n\nSe han cancelado las siguientes reservas pendientes:\n\n{{reservas_canceladas}}\n\nLas reservas confirmadas no se han modificado.', 1, 1),
  ('restablecer_contrasena', 'CUENTA', 'Recuperar contraseña', 'Quien lo pide (personal, alumno o empresa)', 'Cuando alguien pide restablecer su contraseña desde «¿Has olvidado tu contraseña?».', 230, 'Restablece tu contraseña del portal FP Dual', 'Hola{{#nombre}} {{nombre}}{{/nombre}}:\n\nHemos recibido una solicitud para restablecer la contraseña de tu cuenta del portal FP Dual.\n\n[Elegir una contraseña nueva]({{enlace}})\n\nEl enlace caduca en 30 minutos y solo se puede usar una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.', 1, 0),
  ('pie', 'GENERAL', 'Pie de todos los correos', 'Todos los correos', 'Se añade al final de cada correo.', 240, 'Pie de los correos', 'Salesianos Zaragoza — Departamento FP Dual', 1, 0)
AS nueva ON DUPLICATE KEY UPDATE `clave` = nueva.`clave`;

INSERT INTO `dual_correo_variables`
  (`clave_plantilla`, `variable`, `tipo`, `etiqueta`, `descripcion`, `ejemplo`, `fragmento`, `opcional`, `obligatoria`, `orden`)
VALUES
  ('solicitud_alumno_recibida', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('solicitud_alumno_recibida', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 2),
  ('solicitud_alumno_recibida', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 3),
  ('solicitud_alumno_validada', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('solicitud_alumno_validada', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 2),
  ('solicitud_alumno_validada', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo de la solicitud. Si aún no tiene ciclo, «FP Dual».', 'Mecatrónica Industrial', NULL, 0, 0, 3),
  ('solicitud_alumno_validada', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('solicitud_alumno_rechazada', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('solicitud_alumno_rechazada', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 2),
  ('solicitud_alumno_rechazada', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo de la solicitud. Si aún no tiene ciclo, «FP Dual».', 'Mecatrónica Industrial', NULL, 0, 0, 3),
  ('solicitud_alumno_rechazada', 'motivo', 'TEXTO', 'Motivo', 'Motivo escrito por el centro. Puede estar vacío: el chip lo inserta dentro de un bloque que solo aparece si hay motivo.', 'Falta la firma en la página 2.', '{{#motivo}}Motivo indicado por el centro: {{motivo}}{{/motivo}}', 1, 0, 4),
  ('solicitud_alumno_rechazada', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 5),
  ('ciclo_corregido', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('ciclo_corregido', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 2),
  ('ciclo_corregido', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo de la solicitud. Si aún no tiene ciclo, «FP Dual».', 'Mecatrónica Industrial', NULL, 0, 0, 3),
  ('ciclo_corregido', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('cambio_datos_aprobado', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('cambio_datos_aprobado', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 2),
  ('cambio_datos_aprobado', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 3),
  ('cambio_datos_rechazado', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('cambio_datos_rechazado', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 2),
  ('cambio_datos_rechazado', 'motivo', 'TEXTO', 'Motivo', 'Motivo escrito por el centro. Puede estar vacío: el chip lo inserta dentro de un bloque que solo aparece si hay motivo.', 'Falta la firma en la página 2.', '{{#motivo}}Motivo indicado por el centro: {{motivo}}{{/motivo}}', 1, 0, 3),
  ('cambio_datos_rechazado', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('solicitud_empresa_recibida_convenio', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('solicitud_empresa_recibida_convenio', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('solicitud_empresa_recibida_convenio', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('solicitud_empresa_recibida_convenio', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('solicitud_empresa_recibida', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('solicitud_empresa_recibida', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('solicitud_empresa_recibida', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('solicitud_empresa_recibida', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('convenio_disponible_adjunto', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('convenio_disponible_adjunto', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('convenio_disponible_adjunto', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('convenio_disponible_adjunto', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('convenio_disponible', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('convenio_disponible', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('convenio_disponible', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('convenio_disponible', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('solicitud_empresa_validada', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('solicitud_empresa_validada', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('solicitud_empresa_validada', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('solicitud_empresa_validada', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 4),
  ('solicitud_empresa_rechazada', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('solicitud_empresa_rechazada', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('solicitud_empresa_rechazada', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('solicitud_empresa_rechazada', 'motivo', 'TEXTO', 'Motivo', 'Motivo escrito por el centro. Puede estar vacío: el chip lo inserta dentro de un bloque que solo aparece si hay motivo.', 'Falta la firma en la página 2.', '{{#motivo}}Motivo indicado por el centro: {{motivo}}{{/motivo}}', 1, 0, 4),
  ('solicitud_empresa_rechazada', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 5),
  ('documento_rechazado_alumno', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('documento_rechazado_alumno', 'documento', 'TEXTO', 'Documento', 'Nombre del documento rechazado.', 'Anexo II', NULL, 0, 0, 2),
  ('documento_rechazado_alumno', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 3),
  ('documento_rechazado_alumno', 'motivo', 'TEXTO', 'Motivo', 'Motivo escrito por el centro. Puede estar vacío: el chip lo inserta dentro de un bloque que solo aparece si hay motivo.', 'Falta la firma en la página 2.', '{{#motivo}}Motivo: {{motivo}}{{/motivo}}', 1, 0, 4),
  ('documento_rechazado_alumno', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 5),
  ('documento_rechazado_empresa', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('documento_rechazado_empresa', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('documento_rechazado_empresa', 'documento', 'TEXTO', 'Documento', 'Nombre del documento rechazado.', 'Anexo II', NULL, 0, 0, 3),
  ('documento_rechazado_empresa', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 4),
  ('documento_rechazado_empresa', 'motivo', 'TEXTO', 'Motivo', 'Motivo escrito por el centro. Puede estar vacío: el chip lo inserta dentro de un bloque que solo aparece si hay motivo.', 'Falta la firma en la página 2.', '{{#motivo}}Motivo: {{motivo}}{{/motivo}}', 1, 0, 5),
  ('documento_rechazado_empresa', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('documento_rechazado_reserva', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('documento_rechazado_reserva', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('documento_rechazado_reserva', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 3),
  ('documento_rechazado_reserva', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 4),
  ('documento_rechazado_reserva', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 5),
  ('documento_rechazado_reserva', 'documento', 'TEXTO', 'Documento', 'Nombre del documento rechazado.', 'Anexo II', NULL, 0, 0, 6),
  ('documento_rechazado_reserva', 'motivo', 'TEXTO', 'Motivo', 'Motivo escrito por el centro. Puede estar vacío: el chip lo inserta dentro de un bloque que solo aparece si hay motivo.', 'Falta la firma en la página 2.', '{{#motivo}}Motivo: {{motivo}}{{/motivo}}', 1, 0, 7),
  ('documento_rechazado_reserva', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 8),
  ('reserva_creada_alumno', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('reserva_creada_alumno', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('reserva_creada_alumno', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 3),
  ('reserva_creada_alumno', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 4),
  ('reserva_creada_alumno', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 5),
  ('reserva_creada_alumno', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('reserva_creada_empresa', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('reserva_creada_empresa', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('reserva_creada_empresa', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 3),
  ('reserva_creada_empresa', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 4),
  ('reserva_creada_empresa', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 5),
  ('reserva_creada_empresa', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('reserva_cancelada_alumno', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('reserva_cancelada_alumno', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('reserva_cancelada_alumno', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 3),
  ('reserva_cancelada_alumno', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 4),
  ('reserva_cancelada_alumno', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 5),
  ('reserva_cancelada_alumno', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('reserva_cancelada_empresa', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('reserva_cancelada_empresa', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('reserva_cancelada_empresa', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 3),
  ('reserva_cancelada_empresa', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 4),
  ('reserva_cancelada_empresa', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 5),
  ('reserva_cancelada_empresa', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('reserva_confirmada_alumno', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 1),
  ('reserva_confirmada_alumno', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('reserva_confirmada_alumno', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 3),
  ('reserva_confirmada_alumno', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 4),
  ('reserva_confirmada_alumno', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 5),
  ('reserva_confirmada_alumno', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('reserva_confirmada_empresa', 'coordinador', 'TEXTO', 'Coordinador de la empresa', 'Nombre del coordinador de la empresa. Si no consta, «coordinador/a».', 'Luis Martín Gil', NULL, 0, 0, 1),
  ('reserva_confirmada_empresa', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 2),
  ('reserva_confirmada_empresa', 'alumno', 'TEXTO', 'Nombre del alumno', 'Nombre y apellidos del alumno.', 'Ana García López', NULL, 0, 0, 3),
  ('reserva_confirmada_empresa', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 4),
  ('reserva_confirmada_empresa', 'convocatoria', 'TEXTO', 'Convocatoria', 'Nombre de la convocatoria.', '2026/2027', NULL, 0, 0, 5),
  ('reserva_confirmada_empresa', 'enlace_portal', 'ENLACE', 'Enlace al portal', 'Dirección de acceso al portal (APP_URL). Vacía si no está configurada: úsala dentro de un bloque opcional.', 'https://fpdual.ejemplo.es/login', '{{#enlace_portal}}{{enlace_portal}}{{/enlace_portal}}', 1, 0, 6),
  ('cupo_reducido_empresa', 'empresa', 'TEXTO', 'Empresa', 'Nombre de la empresa.', 'Talleres Ebro S.L.', NULL, 0, 0, 1),
  ('cupo_reducido_empresa', 'ciclo', 'TEXTO', 'Ciclo', 'Ciclo formativo (especialidad).', 'Mecatrónica Industrial', NULL, 0, 0, 2),
  ('cupo_reducido_empresa', 'plazas_antes', 'TEXTO', 'Plazas antes', 'Número de plazas antes de la reducción.', '3', NULL, 0, 0, 3),
  ('cupo_reducido_empresa', 'plazas_despues', 'TEXTO', 'Plazas ahora', 'Número de plazas después de la reducción.', '1', NULL, 0, 0, 4),
  ('cupo_reducido_empresa', 'reservas_canceladas', 'LISTA', 'Reservas canceladas', 'Lista con una línea por reserva: número, alumno, DNI/NIE y ciclo. Obligatoria. Escríbela sola en su párrafo para que se vea como lista.', 'Reserva #12 — Ana García López (12345678Z) · Mecatrónica Industrial\nReserva #15 — Pablo Ruiz Sanz (X1234567L) · Mecatrónica Industrial', NULL, 0, 1, 5),
  ('restablecer_contrasena', 'nombre', 'TEXTO', 'Nombre', 'Nombre de la cuenta que pide el cambio. Puede estar vacío.', 'María López', '{{#nombre}} {{nombre}}{{/nombre}}', 1, 0, 1),
  ('restablecer_contrasena', 'enlace', 'ENLACE', 'Enlace para elegir contraseña', 'Enlace de un solo uso que caduca en 30 minutos. Obligatorio: sin él no se puede cambiar la contraseña.', 'https://fpdual.ejemplo.es/restablecer-contrasena?token=ejemplo', '[Elegir una contraseña nueva]({{enlace}})', 0, 1, 2)
AS nueva ON DUPLICATE KEY UPDATE `variable` = nueva.`variable`;

INSERT INTO `dual_correo_plantillas_historial`
  (`clave_plantilla`, `version`, `asunto`, `cuerpo`, `activa`)
VALUES
  ('solicitud_alumno_recibida', 1, 'Solicitud Dual recibida', 'Hola **{{alumno}}**:\n\nHemos recibido tu solicitud para la convocatoria **{{convocatoria}}**.\n\nEn los próximos días revisaremos tu documentación y te informaremos del resultado.\n\nPuedes consultar el estado de tu solicitud iniciando sesión con tu DNI/NIE{{#enlace_portal}} en {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('solicitud_alumno_validada', 1, 'Tu solicitud de FP Dual ha sido validada', 'Hola {{alumno}}:\n\nTu solicitud para la convocatoria **{{convocatoria}}** ({{ciclo}}) ha sido **validada**.\n\nA partir de ahora las empresas colaboradoras pueden reservar tu candidatura. Te avisaremos cuando haya una reserva.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('solicitud_alumno_rechazada', 1, 'Tu solicitud de FP Dual no ha sido aceptada', 'Hola {{alumno}}:\n\nTu solicitud para la convocatoria **{{convocatoria}}** no ha sido aceptada.\n\n{{#motivo}}Motivo indicado por el centro: {{motivo}}\n\n{{/motivo}}Si crees que se trata de un error o puedes corregirlo, ponte en contacto con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('ciclo_corregido', 1, 'Hemos corregido el ciclo de tu solicitud de FP Dual', 'Hola {{alumno}}:\n\nEl centro ha corregido el ciclo de tu solicitud para la convocatoria **{{convocatoria}}**. Ahora figura como **{{ciclo}}**.\n\nSi no es correcto, ponte en contacto con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('cambio_datos_aprobado', 1, 'Hemos corregido tus datos de FP Dual', 'Hola {{alumno}}:\n\nEl centro ha aprobado la corrección de datos que pediste para la convocatoria **{{convocatoria}}**.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('cambio_datos_rechazado', 1, 'Tu petición de corrección de datos no se ha aplicado', 'Hola {{alumno}}:\n\nEl centro no ha aplicado la corrección de datos que pediste para la convocatoria **{{convocatoria}}**.\n\n{{#motivo}}Motivo indicado por el centro: {{motivo}}\n\n{{/motivo}}Puedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('solicitud_empresa_recibida_convenio', 1, 'Solicitud Dual Empresa recibida', 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\nAdjuntamos el convenio generado. La firma y la validación se registran en el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('solicitud_empresa_recibida', 1, 'Solicitud Dual Empresa recibida', 'Estimado/a {{coordinador}}:\n\nHemos recibido la solicitud de participación de **{{empresa}}** en la convocatoria **{{convocatoria}}**.\n\nEl convenio estará disponible en el portal en cuanto el centro lo genere. Os avisaremos por correo.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('convenio_disponible_adjunto', 1, 'Tu convenio está disponible', 'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\nLo adjuntamos a este correo. Descargadlo, firmadlo y subidlo firmado desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('convenio_disponible', 1, 'Tu convenio está disponible', 'Estimado/a {{coordinador}}:\n\nEl centro ha generado el convenio de **{{empresa}}** para la convocatoria **{{convocatoria}}**.\n\nDescargadlo desde el portal, firmadlo y subidlo firmado.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('solicitud_empresa_validada', 1, 'Vuestra solicitud de FP Dual ha sido validada', 'Estimado/a {{coordinador}}:\n\nLa solicitud de **{{empresa}}** para la convocatoria **{{convocatoria}}** ha sido **validada**.\n\nYa podéis consultar los alumnos disponibles de vuestros ciclos y reservar candidaturas desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('solicitud_empresa_rechazada', 1, 'Vuestra solicitud de FP Dual no ha sido aceptada', 'Estimado/a {{coordinador}}:\n\nLa solicitud de **{{empresa}}** para la convocatoria **{{convocatoria}}** no ha sido aceptada.\n\n{{#motivo}}Motivo indicado por el centro: {{motivo}}\n\n{{/motivo}}Para cualquier aclaración, contactad con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('documento_rechazado_alumno', 1, 'Documento rechazado: {{documento}}', 'Hola {{alumno}}:\n\nEl centro ha rechazado el documento **{{documento}}** de tu solicitud ({{convocatoria}}).\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}Sube una versión corregida desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('documento_rechazado_empresa', 1, 'Documento rechazado: {{documento}}', 'Estimado/a {{coordinador}}:\n\nEl centro ha rechazado el documento **{{documento}}** de {{empresa}} ({{convocatoria}}).\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}Sube una versión corregida desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('documento_rechazado_reserva', 1, 'Documento rechazado: {{documento}}', 'Estimado/a {{coordinador}}:\n\nEl centro ha rechazado el documento **{{documento}}** de la reserva de {{alumno}} ({{ciclo}}).\n\n{{#motivo}}Motivo: {{motivo}}\n\n{{/motivo}}Sube una versión corregida desde el portal.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('reserva_creada_alumno', 1, 'Una empresa ha reservado tu candidatura', 'Hola {{alumno}}:\n\n**{{empresa}}** ha reservado tu candidatura para **{{ciclo}}** (convocatoria {{convocatoria}}).\n\nLa plaza no es definitiva hasta que el centro la confirme, una vez firmado y validado el Anexo II o III.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('reserva_creada_empresa', 1, 'El centro ha asignado un alumno a vuestra empresa', 'Estimado/a {{coordinador}}:\n\nEl centro ha creado una reserva de **{{alumno}}** para **{{ciclo}}** en {{empresa}}.\n\nConsultad la reserva en el portal para completar su documentación.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('reserva_cancelada_alumno', 1, 'Una reserva de tu candidatura se ha cancelado', 'Hola {{alumno}}:\n\nLa reserva de **{{empresa}}** para {{ciclo}} ha sido cancelada.\n\nTu solicitud sigue activa: otras empresas pueden reservar tu candidatura.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('reserva_cancelada_empresa', 1, 'Una reserva de vuestra empresa se ha cancelado', 'Estimado/a {{coordinador}}:\n\nLa reserva de **{{alumno}}** para {{ciclo}} en {{empresa}} ha sido cancelada por el centro.\n\nLa plaza vuelve a estar disponible. Para más información, contactad con el centro.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('reserva_confirmada_alumno', 1, 'Tu plaza de FP Dual está confirmada', 'Hola {{alumno}}:\n\nEl centro ha confirmado tu plaza en **{{empresa}}** para **{{ciclo}}** (convocatoria {{convocatoria}}).\n\nTus otras reservas pendientes, si las había, se han cancelado.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('reserva_confirmada_empresa', 1, 'Reserva confirmada', 'Estimado/a {{coordinador}}:\n\nEl centro ha confirmado la plaza de **{{alumno}}** en {{empresa}} para {{ciclo}}.\n\nPuedes consultarlo en el portal FP Dual{{#enlace_portal}}: {{enlace_portal}}{{/enlace_portal}}.', 1),
  ('cupo_reducido_empresa', 1, 'Reservas pendientes canceladas por reducción de plazas', 'Estimado/a coordinador/a de **{{empresa}}**:\n\nSe ha reducido el número de plazas de **{{ciclo}}** de {{plazas_antes}} a {{plazas_despues}}.\n\nSe han cancelado las siguientes reservas pendientes:\n\n{{reservas_canceladas}}\n\nLas reservas confirmadas no se han modificado.', 1),
  ('restablecer_contrasena', 1, 'Restablece tu contraseña del portal FP Dual', 'Hola{{#nombre}} {{nombre}}{{/nombre}}:\n\nHemos recibido una solicitud para restablecer la contraseña de tu cuenta del portal FP Dual.\n\n[Elegir una contraseña nueva]({{enlace}})\n\nEl enlace caduca en 30 minutos y solo se puede usar una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.', 1),
  ('pie', 1, 'Pie de los correos', 'Salesianos Zaragoza — Departamento FP Dual', 1)
AS nueva ON DUPLICATE KEY UPDATE `version` = nueva.`version`;
-- Audit: edits of email templates (accion EDITAR / RESTAURAR, detalle {clave, version}).
-- The previous values are kept, as in 019.
ALTER TABLE `dual_eventos` DROP CHECK `chk_de_entidad`;

ALTER TABLE `dual_eventos`
  ADD CONSTRAINT `chk_de_entidad` CHECK (`entidad` IN
    ('SOLICITUD_ALUMNO', 'SOLICITUD_EMPRESA', 'RESERVA', 'DOCUMENTO', 'OFERTA', 'TUTOR', 'USUARIO', 'CORREO'));

-- Check after applying (expected: 24, 110, 24):
--   SELECT COUNT(*) FROM dual_correo_plantillas;
--   SELECT COUNT(*) FROM dual_correo_variables;
--   SELECT COUNT(*) FROM dual_correo_plantillas_historial;
