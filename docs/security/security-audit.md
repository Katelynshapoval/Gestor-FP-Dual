# Auditoría de seguridad de la aplicación FP Dual

**Fecha:** 28 de octubre de 2026  
**Alcance:** código del repositorio (API Express, SPA React, esquema y migraciones SQL, configuración versionada y dependencias bloqueadas).  
**Método:** revisión estática del recorrido de los datos, de los controles de acceso y de la lógica de negocio. Se consultó el registro de avisos de npm el mismo día. No se modificó código, no se ejecutaron migraciones, no se alteró la base de datos y no se enviaron pruebas de explotación contra ningún servicio.

Las puntuaciones CVSS 3.1 de este informe son una estimación de la auditoría para orientar la prioridad. No sustituyen un cálculo oficial sobre un despliegue concreto.

## Resumen ejecutivo

La aplicación tiene una base de controles sólida en lo que más suele fallar en un portal de este tipo: las consultas SQL observadas van parametrizadas, el rol se vuelve a leer en cada petición, la descarga de documentos comprueba la propiedad del recurso y el restablecimiento de contraseña liga el enlace al hash vigente.

Eso no cubre el alta pública ni el perímetro. El defecto de mayor impacto está en el formulario de alumno: si el DNI ya existe en `gf_alumnosfct` pero todavía no hay fila en `dual_usuarios`, cualquiera que conozca ese DNI puede crear la cuenta, elegir la contraseña y, al entrar, leer los datos que ya estaban guardados (número de la Seguridad Social, tutor legal, domicilio, documentos de la solicitud que acabe de abrir). El propio código describe ese caso como una ficha importada. La protección que impide machacar los campos rellenos no se aplica a la creación de la cuenta.

Una empresa ya validada puede, además, añadir cualquier ciclo activo y subir el cupo sin un nuevo visto bueno del centro. A partir de ahí ve el DNI, el correo, el teléfono y el CV de los alumnos validados de ese ciclo, y puede reservarlos. Los formularios públicos no tienen límite de ritmo: permiten altas masivas, correo a direcciones arbitrarias y escritura de PDF de hasta 10 MB en la base.

Las plantillas DOCX, restringidas al administrador, se ejecutan como JavaScript dentro del proceso de Node. `node:vm` no es un aislamiento de seguridad. Un administrador comprometido, o una plantilla maliciosa subida con esa cuenta, alcanza el servidor y, a través de Chromium, puede provocar peticiones salientes.

No se ha confirmado inyección SQL ni XSS almacenado a partir de datos introducidos por un usuario. La ausencia de esos hallazgos no equivale a una revisión dinámica completa.

**Prioridad inmediata:** cerrar la creación de cuenta sobre fichas ya existentes, exigir aprobación del centro para ciclos y cupos nuevos, y limitar las altas públicas.

## Inventario de hallazgos

Ordenado por prioridad de corrección.

| ID | Vulnerabilidad | Gravedad | Estado | Componente | Prioridad |
|---|---|---|---|---|---|
| SEC-001 | Alta de cuenta sobre una ficha de alumno que aún no tiene usuario | Crítica | Confirmado | Solicitudes de alumno | 1 |
| SEC-002 | Una empresa validada amplía ciclos y cupos sin nueva aprobación | Alta | Confirmado | Solicitudes de empresa y reservas | 2 |
| SEC-003 | Altas públicas sin límite de ritmo, con cuenta activa al momento | Alta | Confirmado | Formularios públicos | 3 |
| SEC-004 | Las plantillas DOCX ejecutan código en el servidor | Alta | Confirmado | Generación de documentos | 4 |
| SEC-005 | Dependencias directas dentro de rangos con avisos publicados | Alta | Probable | Cadena de suministro | 5 |
| SEC-006 | El JWT sigue siendo válido después de cambiar la contraseña | Media | Confirmado | Sesión | 6 |
| SEC-007 | La aplicación no envía cabeceras de seguridad ni ajusta la IP del proxy | Media | Confirmado | Servidor HTTP | 7 |
| SEC-008 | Los PDF se aceptan por el tipo MIME declarado y se sirven en línea | Media | Confirmado | Documentos | 8 |
| SEC-009 | El restablecimiento de contraseña y el alta distinguen si la cuenta existe | Media | Confirmado | Autenticación | 9 |
| SEC-010 | Datos personales y documentos almacenados sin cifrado de aplicación | Media | Confirmado | Base de datos y ficheros | 10 |
| SEC-011 | El token de sesión se guarda en `localStorage` | Baja | Confirmado | Frontend | 11 |
| SEC-012 | El nombre de la plantilla se copia a `Content-Disposition` | Baja | Confirmado | Plantillas | 12 |
| SEC-013 | La semilla de demostración usa contraseñas iguales al identificador | Baja | Potencial | `scripts/seedDemo.js` | 13 |

Recuento: 1 crítica, 4 altas, 5 medias, 3 bajas. Por estado: 11 confirmados, 1 probable, 1 potencial.

## Mapa de superficie de ataque

Aplicación de un solo proceso Node (Express 4) y una SPA React. La sesión es un JWT de portador, caducidad 8 horas, guardado en el navegador. No hay cookies de sesión, así que el CSRF clásico no aplica a la API. MySQL se usa a través de `mysql2` con consultas parametrizadas.

| Superficie | Quién llega | Qué protege el código | Qué queda abierto |
|---|---|---|---|
| `POST /solicitudes/alumno` y `POST /solicitudes/empresa` | Cualquiera | CIF y DNI de empresa validados; alumno con cuenta debe demostrar la contraseña; la empresa existente no se reescribe | Sin límite de ritmo; ficha de alumno sin cuenta; cuenta activa antes de la validación del centro |
| `POST /auth/login`, `forgotPassword`, `resetPassword` | Cualquiera | bcrypt; límite en memoria; el enlace de restablecimiento caduca y queda ligado al hash | Mensajes que distinguen la cuenta; el JWT antiguo no se revoca |
| Rutas con `requireAuth` y `requireRole` | Según el rol | El rol y el alta de la cuenta se releen en cada petición | El identificador del token no se ata a la contraseña vigente |
| Datos y documentos de empresa o alumno | El titular, o administración | `resolveSolicitudForUser`, `getCompanyIdFromUser`, `canDownloadDocumento` | La empresa validada puede ensanchar los ciclos que «titulariza» |
| `POST /documentos/generar` y subida de plantillas | Administración; la plantilla solo el administrador | El coordinador no sube plantillas | El DOCX se ejecuta en el proceso |
| `GET /ayuda/manual` y sus imágenes | Cualquiera | El nombre de imagen se reduce al fichero y a una extensión permitida | El manual se pinta como HTML; el origen es un fichero del repositorio, no un usuario |
| `GET /especialidades`, `GET /transportes`, `GET /tiposContrato` | Cualquiera | Solo catálogos | Información de apoyo, sin datos personales |

Límites de confianza: el navegador no es un control (el frontend solo oculta pantallas); el administrador de la aplicación es, hoy, administrador del proceso Node; la base de datos ejecuta rutinas y vistas `SQL SECURITY DEFINER`.

## Análisis técnico detallado

### SEC-001 — Alta de cuenta sobre una ficha de alumno que aún no tiene usuario

**Gravedad:** crítica.  
**Estado:** confirmado.  
**Categoría:** CWE-287 (autenticación incorrecta), CWE-306 (falta de autenticación en una función crítica). OWASP Top 10 A07:2021. OWASP API Security API2:2023.  
**Componente afectado:** alta pública de solicitud de alumno.  
**Ubicación:** `backend/src/services/solicitudesAlumnoService.js`, función `create`. Rama sin cuenta en el bloque que empieza hacia la línea 161; creación del usuario hacia la línea 252. Ruta pública en `backend/src/routes/solicitudesAlumnoRoute.js`.  
**CVSS 3.1 estimado:** 9,1 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`), si existe la ficha y el atacante conoce el DNI.

**Descripción.** El formulario público trata de no pisar los datos de un alumno que ya está en `gf_alumnosfct` y no tiene cuenta: solo rellena campos vacíos. Acto seguido, si no hay fila en `dual_usuarios`, crea el usuario con la contraseña que acaba de enviar el formulario, `activo = 1` y `must_change_password = 0`. No hay prueba de identidad. Quien conozca el DNI entra después con `POST /auth/login` y `GET /solicitudes/alumno/mia/datos` le devuelve la ficha, incluido el número de la Seguridad Social, la fecha de nacimiento y el DNI del tutor legal (`alumnoDatos.pickSnapshot`).

El alta de un DNI que no existe es el registro previsto. El fallo es el otro caso, el que el comentario del código llama ficha importada.

**Origen y recorrido de los datos.** `POST /solicitudes/alumno` sin sesión. El DNI se normaliza (mayúsculas y espacios) y se busca en `gf_alumnosfct`. Si hay fila y no hay usuario, los campos vacíos se actualizan con el cuerpo de la petición, se crea la solicitud, se guardan los dos PDF y se inserta `dual_usuarios` con el hash de `password`.

**Condiciones de explotación.**

1. Hay una convocatoria activa.
2. Existe `gf_alumnosfct.dni` igual al valor enviado.
3. No existe `dual_usuarios.id_alumno` para esa persona.
4. El atacante conoce el DNI. No necesita la contraseña, porque todavía no hay cuenta.

Si la cuenta ya existe, el mismo formulario exige la contraseña actual y cuenta el fallo en el limitador. Esa rama está bien cerrada. Una cuenta de baja también está cerrada: el usuario existe y, con la contraseña correcta, la respuesta es que la cuenta está desactivada.

**Impacto.** Lectura de los datos personales ya almacenados, escritura de los campos que estuvieran vacíos, apertura de una solicitud a nombre de esa persona y uso posterior del portal como ese alumno (documentos propios, reservas, firmas de atestación). En FP Dual parte del alumnado puede ser menor de edad; el tutor legal y el número de la Seguridad Social entran en ese impacto.

**Evidencia.** Tras localizar la ficha sin cuenta, el código conserva los valores no vacíos y, más abajo, crea el usuario siempre que `existingUser` siga vacío:

```sql
UPDATE gf_alumnosfct
   SET nombre = COALESCE(NULLIF(nombre, ''), ?),
       ...
 WHERE idalumno = ?
```

```sql
INSERT INTO dual_usuarios
  (nombre_mostrar, email, password_hash, id_rol, id_contacto, id_alumno, activo, must_change_password)
VALUES (?, NULL, ?, ?, NULL, ?, 1, 0)
```

`getMisDatos` devuelve `dni` y el snapshot de `CAMPOS`, que incluye `numeroSS`, `fechaNacimiento` y `dniTutorLegal`.

**Controles que reducen el riesgo.** No afecta a quien ya tiene cuenta. No crea un segundo usuario si el alta ya existía. El DNI de una ficha con cuenta no se puede cambiar desde la corrección de datos.

**Verificación segura.** En una base local de pruebas, insertar una fila de alumno sin fila en `dual_usuarios`. Enviar el formulario público con ese DNI y una contraseña conocida. Iniciar sesión y llamar a `GET /solicitudes/alumno/mia/datos`. Comprobar que la respuesta contiene los campos que ya estaban rellenos. Borrar después las filas de prueba. No usar datos reales ni un entorno compartido.

**Solución recomendada.** Si la ficha existe y no hay cuenta, no crear el usuario desde el formulario público. Devolver un mensaje genérico y dejar el alta de la cuenta al centro, con contraseña de un solo uso y `must_change_password = 1`. No rellenar tampoco campos vacíos desde una petición anónima: esa escritura sigue sin demostrar quién envía el formulario. Aplicar en el servidor la misma validación de DNI/NIE que ya existe en `dniNieValido` (el alta pública de alumno no la llama; el alta de empresa sí).

**Prioridad de corrección:** inmediata.

**Limitaciones del análisis.** No se ha consultado la base para contar fichas sin usuario. El defecto está en el código con independencia de cuántas filas haya hoy; el impacto real depende de que existan importaciones o altas legacy.

### SEC-002 — Una empresa validada amplía ciclos y cupos sin nueva aprobación

**Gravedad:** alta.  
**Estado:** confirmado.  
**Categoría:** CWE-285 (control de acceso incorrecto), CWE-639 (autorización basada solo en la pertenencia, no en el alcance aprobado). OWASP A01:2021. API5:2023. API3:2023 por la exposición de datos que provoca.  
**Componente afectado:** ciclos y cupos de la solicitud de empresa; listado de alumnos disponibles; descarga del CV.  
**Ubicación:** `addEspecialidad` y `updateCupoEspecialidad` en `backend/src/services/solicitudesEmpresaService.js`. Lectura en `getAlumnosDisponibles` (`backend/src/services/reservasService.js`, hacia la línea 96) y `empresaMayViewStudentDocument` (`backend/src/services/documentosService.js`, hacia la línea 246).  
**CVSS 3.1 estimado:** 7,1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N`).

**Descripción.** El centro valida la solicitud de empresa, no cada ciclo por separado. Después, la empresa (y también el coordinador) puede insertar cualquier especialidad activa y fijar `cantidad_alumnos` sin tope de negocio. El único límite de esquema revisado es `cantidad_alumnos >= 0`. `addEspecialidad` no comprueba que la solicitud esté validada ni que el ciclo figurara en el alta original: basta con que la convocatoria siga activa y la solicitud sea de esa empresa.

`GET /alumnos/disponibles` devuelve, para cada ciclo de una solicitud validada, el nombre, el DNI, el correo, el teléfono y si el alumno tiene carnet o coche. El CV de esos alumnos es visible para la empresa (`actor.EMPRESA = "view"`). El Anexo DGA permanece oculto. Con el cupo ampliado, la empresa puede reservar a esos alumnos.

Añadir ciclos mientras la solicitud aún está pendiente tiene el mismo efecto en cuanto el centro pulse validar: la validación cubre la solicitud entera, ciclos incluidos.

**Origen y recorrido de los datos.** Cuenta `EMPRESA` cuya solicitud de la convocatoria activa acaba en estado `VALIDADO`. `POST /solicitudes/empresa/:id/especialidades` con `id_especialidad` de otro ciclo activo y una cantidad alta. La consulta de alumnos filtra por las especialidades de las ofertas validadas de esa empresa, así que el ciclo nuevo entra en el filtro sin otro paso.

**Condiciones de explotación.** Cuenta de empresa con la solicitud validada (o pendiente, si el centro la valida después). El identificador de especialidad sale del catálogo público `GET /especialidades`.

**Impacto.** Acceso al identificador nacional, al contacto y al CV de alumnos que el centro no había ofrecido a esa empresa, y posibilidad de reservarlos. Ver a los candidatos del ciclo que el centro sí aprobó es el funcionamiento previsto del emparejamiento; el fallo es poder aprobarse ciclos nuevos.

**Evidencia.** `addEspecialidad` resuelve la propiedad y la convocatoria activa, comprueba que la especialidad exista y esté activa, e inserta la oferta. No hay lectura de `id_estado_validacion` ni un máximo de plazas. `updateCupoEspecialidad` acepta cualquier entero `>= 0`. El `SELECT` de alumnos disponibles incluye `a.dni`, `a.email` y `a.telalumno`.

**Controles que reducen el riesgo.** Una empresa no validada recibe una lista vacía. No puede reservar con una oferta que no esté en una solicitud `VALIDADO`. No ve el Anexo DGA ni el número de la Seguridad Social en ese listado. No accede a la solicitud de otra empresa (`resolveSolicitudForUser`).

**Verificación segura.** Con una empresa de pruebas ya validada para un solo ciclo, añadir otro ciclo activo y llamar a `GET /alumnos/disponibles`. La respuesta no debería incluir alumnos de un ciclo no aprobado; con el código actual, los incluye. Usar solo datos de prueba.

**Solución recomendada.** Separar el ciclo solicitado del ciclo aprobado. La empresa puede pedir un ciclo o un cupo mayor; el listado, la reserva y la descarga del CV deben usar solo ciclos en estado aprobado. Poner un máximo de plazas acorde al convenio. Mientras la solicitud no esté validada, rechazar el alta de ciclos o dejarlos en estado «solicitado».

**Prioridad de corrección:** alta, justo después de SEC-001. Es el camino con el que una empresa pasa de su convenio a datos de otro grupo de alumnos.

**Limitaciones del análisis.** No se ha medido cuántos alumnos devolvería un ciclo real. La reserva concurrente de cupos está protegida en los procedimientos con lecturas `FOR UPDATE`; no se han lanzado pruebas de carrera.

### SEC-003 — Altas públicas sin límite de ritmo, con cuenta activa al momento

**Gravedad:** alta.  
**Estado:** confirmado.  
**Categoría:** CWE-770 (asignación de recursos sin límite), CWE-799 (control de interacción insuficiente). OWASP API4:2023.  
**Componente afectado:** `POST /solicitudes/alumno`, `POST /solicitudes/empresa`, envío de correo y almacenamiento de PDF.  
**Ubicación:** rutas públicas en `solicitudesAlumnoRoute.js` y `solicitudesEmpresaRoute.js`. El limitador solo se usa en el login, en el alumno que ya tiene cuenta y en el restablecimiento (`loginRateLimit.js`, `passwordResetService.js`). Alta de empresa con `activo = 1` hacia la línea 462 de `solicitudesEmpresaService.js`.  
**CVSS 3.1 estimado:** 7,5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`) para la saturación. La integridad del censo (altas falsas) es adicional.

**Descripción.** El alta de un alumno nuevo y el alta de empresa no pasan por el limitador. Cada alta de alumno admite dos PDF de 10 MB, los guarda en la base y puede enviar un correo de confirmación a la dirección del formulario. El alta de empresa crea usuario `EMPRESA` activo antes de que el centro valide la solicitud, con la contraseña elegida por quien rellena el formulario.

El limitador que sí existe es un `Map` en memoria: 5 fallos por identificador y 30 por IP en 15 minutos en el login; 3 y 20 en el restablecimiento. Se pierde al reiniciar y no se comparte entre procesos. `index.js` no llama a `trust proxy`, así que detrás de un proxy inverso todas las peticiones pueden contarse como la IP del proxy, o el atacante no queda aislado por la suya.

El alta de alumno tampoco usa `dniNieValido`. El DNI del formulario de empresa sí se valida. Un identificador arbitrario puede convertirse en usuario alumno.

**Origen y recorrido de los datos.** Peticiones anónimas repetidas. El cuerpo y los ficheros entran en memoria (`multer.memoryStorage`) y después en tablas y BLOB. El correo usa la dirección recibida como destinatario.

**Condiciones de explotación.** Convocatoria activa y acceso de red al API. No hace falta cuenta.

**Impacto.** Censo de alumnos y empresas falseado, buzones ajenos usados como destino del correo de confirmación, crecimiento de la base y presión de memoria por subidas concurrentes. La cuenta de empresa recién creada no ve alumnos hasta que el centro valida (eso sí está comprobado); el daño previo es el volumen y el hecho de que la validación posterior activa de golpe los ciclos que se hayan añadido mientras tanto (SEC-002).

**Evidencia.** Las rutas de alta no montan `loginRateLimiter`. El de login documenta que el estado es local al proceso. `express.urlencoded({ extended: false })` y `express.json()` están activos; el JSON usa el límite por defecto de Express (100 KB), insuficiente para frenar las subidas multipart.

**Controles que reducen el riesgo.** La empresa con CIF ya registrado recibe 409 y no se reescribe. El alumno con cuenta y contraseña incorrecta sí entra en el limitador. En modo distinto de `smtp` el correo no sale (`mail/config.js`); en producción el modo previsto es enviar.

**Verificación segura.** Contra una instancia local, enviar varias altas de alumno con DNI de prueba distintos y observar que ninguna responde 429. No apuntar el correo a buzones reales: dejar `MAIL_MODE=log`.

**Solución recomendada.** Un límite por IP y por identificador delante de las dos altas, compartido si hay más de un proceso (o, como mínimo, coherente con `trust proxy` cuando el despliegue tenga proxy). Tope diario de altas. No crear la cuenta de empresa como activa hasta la validación del centro, o crearla sin acceso a nada que no sea el estado de su propia solicitud. Validar DNI/NIE, correo y un tamaño global de la petición. Valorar un reto anti-automatización en los dos formularios.

**Prioridad de corrección:** alta. Es el multiplicador de SEC-001 y de la basura de datos que luego hay que revisar a mano.

**Limitaciones del análisis.** No se ha medido el caudal que aguanta el proceso. No se ha visto la configuración real del proxy.

### SEC-004 — Las plantillas DOCX ejecutan código en el servidor

**Gravedad:** alta.  
**Estado:** confirmado.  
**Categoría:** CWE-94 (inyección de código). Relacionado con CWE-918 si el HTML resultante hace que Chromium pida URLs. OWASP A03:2021.  
**Componente afectado:** subida de plantillas y `POST /documentos/generar`.  
**Ubicación:** `backend/src/services/documentGenerationService.js` (`createReport` y `docxBufferToPdf`). Motor en `docx-templates` 4.14.1, `lib/jsSandbox.js`: sin `runJs` propio y sin `noSandbox`, el código de la plantilla corre con `vm.Script` y `runInContext`. Ruta de subida limitada a `ADMINISTRADOR` en `documentosRoute.js`.  
**CVSS 3.1 estimado:** 7,2 (`AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H`). Sube si se considera que el salto al sistema operativo cambia el alcance.

**Descripción.** Generar un documento rellena la plantilla activa con `createReport` y delimitadores `<< >>`. Esa biblioteca ejecuta fragmentos JavaScript de la plantilla. La llamada de la aplicación no sustituye el evaluador ni activa un aislamiento propio. El camino por defecto usa `node:vm`. La documentación de Node indica que `node:vm` no es un mecanismo de seguridad: no sirve para ejecutar código que no sea de confianza.

Después, Mammoth convierte el DOCX a HTML y Puppeteer hace `page.setContent(html, { waitUntil: "networkidle0" })`. El navegador del servidor espera a que la red quede en reposo, así que un HTML con recursos remotos provoca peticiones desde el servidor. No se ha ejecutado un escape del contexto `vm` durante esta auditoría; el defecto confirmado es que el código de la plantilla se evalúa dentro del proceso y que el HTML se carga con red.

**Origen y recorrido de los datos.** Un administrador sube el DOCX (`POST /documentos/plantillas`). El binario se guarda y queda como plantilla activa. Un administrador o un coordinador llama a `POST /documentos/generar`. Ahí se ejecuta la plantilla y se lanza Chromium.

**Condiciones de explotación.** Sesión de `ADMINISTRADOR`, o uso de una plantilla que esa cuenta haya dejado activa. El coordinador no puede subirla; sí puede disparar la generación de la que esté activa.

**Impacto.** Ejecución en el servidor con los privilegios del proceso Node (secreto JWT, credenciales de base de datos, lectura de ficheros del usuario del servicio). Las peticiones de Chromium amplían el efecto a la red interna alcanzable desde ese host.

**Evidencia.** `generateDocument` llama a `createReport` solo con `template`, `data` y `cmdDelimiter`. `docxBufferToPdf` lanza Puppeteer sin desactivar la red y usa `networkidle0`. En `jsSandbox.js`, si no hay `runJs` ni `noSandbox`, se construye un `vm.Script` con el código de la plantilla.

**Controles que reducen el riesgo.** La subida está limitada al administrador. El coordinador y el resto de roles no pueden cambiar la plantilla. Es un control de privilegio, no de aislamiento: la cuenta de aplicación más alta equivale al proceso del servidor.

**Verificación segura.** En local, con un administrador de prueba, generar un documento cuya plantilla solo contenga un comando que devuelva una cadena fija (sin acceso a `process`, sin URL y sin efectos). Comprobar que el valor aparece en el PDF. Con eso basta para ver que la plantilla no es datos pasivos. No hace falta un escape del sandbox para confirmar el hallazgo, y no debe probarse contra un servidor compartido.

**Solución recomendada.** No evaluar JavaScript de ficheros subidos. Sustituir el motor por un rellenado de campos sin intérprete, o generar los PDF con una plantilla fijada en el despliegue y revisada como código. Si se mantiene el motor, procesarlo en un proceso desechable, sin red, sin secreto JWT y sin acceso a la base más allá de los datos ya extraídos. Desactivar la carga de recursos remotos en Puppeteer (`setContent` sin espera de red, o intercepción que aborte cualquier URL).

**Prioridad de corrección:** alta. Por debajo de SEC-001 porque exige la cuenta de administrador, y por encima del endurecimiento general porque el impacto es el servidor entero.

**Limitaciones del análisis.** No se ha desarrollado ni ejecutado un escape de `node:vm`. No se ha comprobado qué URLs conserva Mammoth a partir de un DOCX con imágenes externas; el `networkidle0` deja ese canal abierto.

### SEC-005 — Dependencias directas dentro de rangos con avisos publicados

**Gravedad:** alta.  
**Estado:** probable.  
**Categoría:** CWE-1395 (dependencia con vulnerabilidad conocida). OWASP A06:2021.  
**Componente afectado:** dependencias de producción del backend, según `backend/package-lock.json`.  
**CVSS:** el de cada aviso; no se reutiliza aquí como si la explotación en esta aplicación estuviera demostrada.

**Descripción.** El 28 de octubre de 2026, `npm audit --omit=dev` en `backend` informó de 33 avisos de producción (7 críticos, 19 altos, 3 medios, 4 bajos). El frontend informó de 64, en gran parte de la cadena de `react-scripts`, que afecta sobre todo al entorno de construcción y al servidor de desarrollo. Esos 64 no se tratan como vulnerabilidades de ejecución de la SPA: no se ha unido cada uno a un sumidero del código de producción.

Versiones instaladas y avisos que el registro asocia a ese rango (identificadores tomados de la salida de npm, no calculados a mano):

| Paquete | Versión instalada | Gravedad que asigna npm | Avisos citados por npm | Relación con este código |
|---|---|---|---|---|
| `mysql2` | 3.9.2 | Crítica (rango `<=3.23.0`) | GHSA-fpw7-j2hg-69v5, GHSA-4rch-2fh8-94vw, y otros de integridad y de contraseña en claro | Cliente de todas las consultas. El pool no activa `multipleStatements`, `typeCast` ni `localInfile`, y no fija TLS |
| `multer` | 2.0.0 | Alta (`<=2.4.0`) | Varios GHSA de denegación de servicio por multipart malformado, entre ellos GHSA-g5hg-p3ph-g8qg | Hay subidas públicas y autenticadas |
| `body-parser` | 1.20.2 | Alta | GHSA-qwcr-r2fm-qrc7 (DoS con URL-encoding), GHSA-27r3-jxmh-p828 | `express.urlencoded({ extended: false })` está activo |
| `nodemailer` | 7.0.3 | Alta (`<=10.1.3`) | Varios GHSA sobre el analizador de direcciones y DoS | El destinatario de los correos de alta sale del formulario |
| `express` | 4.18.3 | Alta en el paquete; los dos avisos listados son bajo y medio | GHSA-qw6h-vgh9-j6wx, GHSA-rv95-896h-c2vc | No se ha visto `res.redirect` con una URL del cliente |
| `puppeteer` | 24.38.0 | Alta | Cadena `@puppeteer/browsers`, `extract-zip`, `tar` | Usado al generar PDF. Ver SEC-004 |
| `morgan` | 1.10.0 | Media | GHSA de inyección en el registro | El formato es `dev` y no registra el cuerpo; el riesgo práctico es bajo |

`google-auth-library`, `crypto-browserify` y `soffice` figuran en `backend/package.json` y no aparecen usados por `backend/src`. Amplían la superficie de instalación sin aportar una función visible.

**Origen y recorrido.** El atacante no elige la versión. El efecto, si el aviso es explotable, entra por el mismo sitio que usa la aplicación: consultas SQL, cuerpos `urlencoded`, multipart, direcciones de correo o la generación de PDF.

**Condiciones de explotación.** Dependen de cada aviso. Varios de `mysql2` publicados para este rango se describen como fallo del cliente frente a un servidor MySQL malicioso o frente a opciones que este pool no configura. No se ha reproducido ninguno. Por eso el estado es probable y no confirmado: el rango coincide con el aviso; el camino desde un cliente HTTP no se ha cerrado.

Los de `multer` y `body-parser` encajan mejor con el código actual, porque las altas públicas aceptan multipart y URL-encoding sin el límite de SEC-003. Siguen sin reproducirse en esta auditoría.

**Impacto.** En el peor aviso de `mysql2`, ejecución de código en el proceso del API, si el vector del aviso es alcanzable. En `multer` y `body-parser`, denegación de servicio. En `nodemailer`, denegación de servicio o entrega a un destinatario distinto del que el texto sugiere, si la dirección del formulario dispara el analizador afectado.

**Evidencia.** Versiones leídas de `backend/package-lock.json`. Títulos y URL de aviso leídos de `npm audit --omit=dev --json` ejecutado en esta máquina contra el registro público.

**Controles que reducen el riesgo.** Consultas parametrizadas, sin sentencias múltiples. El correo de desarrollo no sale si `MAIL_MODE` no es `smtp`. No hay `res.redirect` alimentado por el usuario en las rutas revisadas, así que el aviso de redirección de Express no tiene un sumidero localizado.

**Verificación segura.** Repetir `npm audit --omit=dev` en `backend` y abrir los GHSA citados. Actualizar en una rama y pasar la batería `npm test` del backend. No hace falta lanzar los exploits.

**Solución recomendada.** Subir `mysql2`, `multer`, `body-parser` / `express` y `nodemailer` por encima del rango que marca cada aviso, con el changelog a la vista. Activar TLS hacia MySQL. Quitar las dependencias que `src` no importa. Tratar los avisos de `react-scripts` como deuda de construcción, no como XSS de la SPA, salvo que un aviso describa el paquete que el navegador acaba ejecutando.

**Prioridad de corrección:** alta para `mysql2` y para las subidas, en paralelo con SEC-003. No desplegar un parche a ciegas el mismo día sin la batería de pruebas.

**Limitaciones del análisis.** No se han leído los commits de corrección de cada GHSA ni se ha intentado la explotación. Un aviso puede no aplicar a la forma en que esta aplicación llama a la biblioteca. El recuento caduca en cuanto se vuelva a ejecutar npm.

### SEC-006 — El JWT sigue siendo válido después de cambiar la contraseña

**Gravedad:** media.  
**Estado:** confirmado.  
**Categoría:** CWE-613 (sesión no invalidada tras un cambio de credencial). OWASP A07:2021. ASVS V3.3.  
**Componente afectado:** `requireAuth` y los tres caminos que cambian `password_hash`.  
**Ubicación:** `backend/src/middleware/auth.js` (`loadAccountState`, `signToken` con `expiresIn: '8h'`). Cambios de clave en `authService.changePassword`, `authService.resetPassword` y `passwordResetService.restablecer`.  
**CVSS 3.1 estimado:** 6,5 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`), supuesto un token ya obtenido.

**Descripción.** Cada petición autenticada comprueba que la cuenta siga activa y que el rol del token coincida con el de la base. No comprueba ningún identificador de la contraseña ni una versión de sesión. Cambiar la contraseña, restablecerla con el enlace o recibir una contraseña temporal de un administrador actualiza el hash y, en su caso, `must_change_password`. Los JWT ya emitidos siguen verificando la firma hasta las 8 horas.

Quien haya copiado el token (equipo compartido, copia de `localStorage`, proxy con registro de la cabecera `Authorization`) mantiene la sesión después de que la persona legítima crea haberla cerrado por la vía de la contraseña. El enlace de restablecimiento sí queda invalidado, porque lleva una huella del hash; la sesión no.

**Origen y recorrido.** El token sale de `signToken` en el login y se envía como `Authorization: Bearer`. `jwt.verify` solo comprueba firma y caducidad. `loadAccountState` lee `activo`, `must_change_password` y el rol.

**Condiciones de explotación.** Disponer de un JWT válido de la víctima y usarlo después del cambio de clave, dentro de las 8 horas. No sirve un token de restablecimiento como sesión: va firmado con otra clave (`JWT_SECRET` más el sufijo `password-reset`) y `requireAuth` lo rechaza.

**Impacto.** La recuperación de cuenta no expulsa al otro poseedor del token. Con SEC-011, cualquier script que lea `localStorage` obtiene una sesión que sobrevive al cambio de contraseña.

**Evidencia.** `loadAccountState` no selecciona `password_hash` ni una columna de versión. `changePassword` y `restablecer` hacen `UPDATE` del hash y no mantienen una lista de tokens. El comentario de `requireAuth` describe desactivación, cambio de rol y cambio de contraseña obligatorio; no describe la revocación.

**Controles que reducen el riesgo.** Desactivar la cuenta corta el acceso en la petición siguiente. Cambiar el rol también. La caducidad máxima es 8 horas. `must_change_password` bloquea el resto de rutas, pero un token robado de una cuenta que ya no tiene ese flag no pasa por ese bloqueo. El algoritmo `none` no es aceptable en `jsonwebtoken` 9 cuando la clave es un secreto de aplicación; aun así, `jwt.verify` no fija `algorithms: ['HS256']`.

**Verificación segura.** En local, iniciar sesión, copiar el token, cambiar la contraseña con otro cliente y repetir `GET /auth/me` con el token antiguo. Debe seguir respondiendo 200 hasta que caduque. No usar una cuenta real.

**Solución recomendada.** Guardar en el token una huella corta del hash, del mismo modo que ya se hace en el enlace de restablecimiento, y rechazar el token si no coincide. Como alternativa, una columna `session_version` incrementada en cada cambio de clave. Mantener la caducidad corta. Fijar `algorithms: ['HS256']` en `jwt.verify` y en la firma.

**Prioridad de corrección:** media. Necesaria antes de dar por bueno el restablecimiento de contraseña como respuesta a un robo de sesión.

**Limitaciones del análisis.** No se ha medido el reloj del servidor ni se ha visto si un proxy guarda la cabecera `Authorization`.

### SEC-007 — La aplicación no envía cabeceras de seguridad ni ajusta la IP del proxy

**Gravedad:** media.  
**Estado:** confirmado en el código de la aplicación. El efecto en producción depende del proxy, que no está en el repositorio.  
**Categoría:** CWE-693 (protección insuficiente en el perímetro), CWE-348 (confianza en la IP de origen). OWASP A05:2021.  
**Componente afectado:** `backend/src/index.js`.  
**Ubicación:** `app.use(morgan("dev"))`, `express.urlencoded`, `express.json`, `app.listen(PORT)` sin `trust proxy`, sin `helmet` y sin cabeceras propias.  
**CVSS 3.1 estimado:** 5,3 (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`) solo por el límite de ritmo agregado; el resto es endurecimiento con impacto variable.

**Descripción.** La respuesta de la API no establece `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` o `frame-ancestors`, ni `Strict-Transport-Security`. Tampoco hay una lista CORS: el navegador bloquea las lecturas cruzadas, lo cual es seguro por defecto, pero tampoco hay una política explícita que impida abrir `origin: true` más adelante.

`morgan("dev")` registra método, URL y estado en cualquier entorno. No registra el cuerpo. Un identificador en la query quedaría en el registro. El formato no es el de producción.

Sin `trust proxy`, `req.ip` es el socket. Detrás de un reverse proxy, el limitador de SEC-003 y del login ve una sola IP.

El proceso escucha en todas las interfaces (`app.listen(PORT)`). Es normal si delante hay un proxy; no lo es si el puerto 3001 queda publicado.

**Condiciones de explotación.** Dependen del despliegue. El defecto de código (no fijar cabeceras ni la confianza en el proxy) es independiente.

**Impacto.** El navegador no recibe instrucciones de la aplicación para negar MIME sniffing, marcos o filtrado de referer. El límite de ritmo puede ser global o evadible según cómo se publique el servicio. HSTS y TLS, si existen, están fuera de este repositorio.

**Evidencia.** `index.js` solo monta dotenv, la comprobación del JWT, Morgan, los dos parsers y las rutas.

**Controles que reducen el riesgo.** No hay cookie de sesión, así que la falta de `SameSite` no abre CSRF. El manejador de errores global responde «Error interno del servidor» y deja la traza en el registro del proceso, no en el JSON.

**Verificación segura.** `curl -D -` contra una instancia local a cualquier ruta y comprobar la ausencia de esas cabeceras. Repetir contra el entorno publicado antes de dar el hallazgo por corregido allí.

**Solución recomendada.** Fijar las cabeceras en la aplicación, no solo en un proxy que el repositorio no describe. `nosniff` es la pareja de SEC-008. Configurar `trust proxy` con el número de saltos real, no con `true`. Cambiar Morgan a un formato que no incluya query de tokens y que escape saltos de línea. Publicar solo el puerto del proxy.

**Prioridad de corrección:** media, junto con el despliegue. No sustituye a SEC-001.

**Limitaciones del análisis.** No hay Dockerfile, nginx ni manifiesto de producción. No se ha inspeccionado un servidor en marcha.

### SEC-008 — Los PDF se aceptan por el tipo MIME declarado y se sirven en línea

**Gravedad:** media.  
**Estado:** confirmado el control insuficiente. La ejecución del contenido como HTML en el navegador queda en potencial: no se ha demostrado con un cliente concreto.  
**Categoría:** CWE-434 (subida de tipo no restringido), CWE-79 si el navegador llega a interpretar el cuerpo. OWASP A04:2021 / A03:2021.  
**Componente afectado:** subidas de `documentosRoute.js` y `solicitudesAlumnoRoute.js`; descarga en `documentosService.descargar`.  
**Ubicación:** `fileFilter` que solo compara `file.mimetype` con `application/pdf`. `descargar` envía `Content-Type: application/pdf` y `Content-Disposition: inline`.  
**CVSS 3.1 estimado:** 4,3 si solo se considera el fichero mal clasificado (`AV:N/AC:L/PR:L/UI:R/S:U/C:N/I:L/A:N`). Subiría si, en el origen publicado, el navegador ejecutara el cuerpo y leyera el token de SEC-011.

**Descripción.** El filtro de Multer cree al cliente. No se comprueba la cabecera `%PDF`. El fichero se guarda como BLOB y, al descargarlo, se anuncia como PDF y se pide al navegador que lo muestre en línea. No hay `X-Content-Type-Options: nosniff` (SEC-007). Un poliglota HTML/PDF puede quedar almacenado y ser abierto por un administrador, un coordinador o la otra parte de la reserva, según `canDownloadDocumento`.

Los navegadores actuales suelen respetar `application/pdf` y no pasar a HTML. Por eso no se marca un XSS confirmado. El control sigue sin existir, y el visor o un cliente antiguo no están cubiertos por esa suposición.

**Origen y recorrido.** El alumno anónimo en el alta, o un usuario autenticado en `POST /documentos/subir` y las rutas de convenio y anexo, envía el multipart. `assertCanUpload` controla rol, propiedad y estado; no controla el contenido. `descargar` lee el BLOB y lo envía.

**Condiciones de explotación.** Poder subir un documento que otra persona abra en el mismo origen que la SPA. En desarrollo, API y SPA van en puertos distintos y el `localStorage` de la SPA no lo lee un documento del API. Si en producción ambos comparten origen, el impacto de un XSS aquí se junta con SEC-011. Ese emparejamiento de orígenes no está en el repositorio.

**Impacto confirmado.** La base almacena como «PDF» contenido que no lo es, y el centro lo abre al revisar la solicitud. Impacto potencial: script en el origen de la aplicación.

**Evidencia.** El `fileFilter` mira `file.mimetype`. `descargar` fija el tipo y `inline` sin mirar los primeros bytes.

**Controles que reducen el riesgo.** Tamaño máximo 10 MB. La autorización de descarga sí distingue empresa, alumno y personal. El Anexo DGA no lo descarga la empresa. Las plantillas DOCX son otro camino (SEC-004) y no pasan por este filtro.

**Verificación segura.** Subir en local un fichero pequeño cuyo tipo declarado sea `application/pdf` y cuyos bytes no empiecen por `%PDF`. Comprobar que el servidor responde 201 o 200 y que `descargar` lo devuelve con `Content-Type: application/pdf`. No incrustar script ni abrirlo en un navegador con sesión real.

**Solución recomendada.** Rechazar lo que no empiece por la firma PDF y, si se quiere más rigor, pasar un validador de estructura. Servir los ficheros con `nosniff` y `Content-Disposition: attachment` cuando no haga falta el visor embebido. Si el visor se mantiene, aislarlo en otro origen.

**Prioridad de corrección:** media.

**Limitaciones del análisis.** No se ha abierto un poliglota en Chrome, Firefox ni Edge, ni se conoce el origen público de la SPA.

### SEC-009 — El restablecimiento de contraseña y el alta distinguen si la cuenta existe

**Gravedad:** media.  
**Estado:** confirmado.  
**Categoría:** CWE-204 (respuesta observable distinta). OWASP A07:2021.  
**Componente afectado:** `POST /auth/forgotPassword`, el alta de alumno cuando el DNI ya tiene cuenta, y el alta de empresa cuando el CIF ya existe.  
**Ubicación:** `passwordResetService.solicitar` (mensajes `NOT_FOUND`, `DISABLED`, `NO_EMAIL`). `solicitudesAlumnoService.create`, respuesta `CUENTA_EXISTENTE`. `solicitudesEmpresaService.create`, respuesta 409 si el CIF existe.  
**CVSS 3.1 estimado:** 5,3 (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`).

**Descripción.** El login de una contraseña incorrecta responde igual si el usuario no existe o si la clave no coincide. El restablecimiento no: 404 si no hay cuenta, 403 si está desactivada, 400 si no hay correo, 200 si el enlace se envía. Con el DNI, el CIF o el correo de personal se puede saber si esa persona está en el portal y en qué estado. El alta de alumno, cuando la cuenta existe y la contraseña falla, lo dice de forma explícita e indica que hay que usar la contraseña del portal. El alta de empresa confirma que el CIF ya está registrado.

El restablecimiento cuenta cada petición, también la que acaba enviando el correo, con un máximo de 3 por identificador y 20 por IP en 15 minutos, en memoria. La enumeración cabe en esos tres intentos. El alta de empresa no tiene ese límite.

El login de una cuenta desactivada, después de una contraseña correcta, responde 403 y no 401. Solo distingue la cuenta a quien ya conoce la clave.

**Origen y recorrido.** El identificador del cuerpo se busca en personal (correo), empresa (CIF) y alumno (DNI), en ese orden. La respuesta HTTP sale antes de enviar el correo y depende de la rama.

**Condiciones de explotación.** Acceso anónimo al API. Para el alumno, conocer o probar un DNI. El limitador frena el volumen, no la diferencia entre mensajes.

**Impacto.** Confirmación de que un alumno, una empresa o un miembro del personal tiene cuenta, de que está de baja o de que no hay correo de recuperación. En un centro, el DNI no es público, pero tampoco es un secreto de alta entropía, y SEC-002 lo entrega a las empresas de un ciclo. Combinado con SEC-001, la respuesta `CUENTA_EXISTENTE` separa «hay que adivinar la clave» de «puedo crear la cuenta».

**Evidencia.** Constantes `NOT_FOUND`, `DISABLED` y `NO_EMAIL` con códigos HTTP distintos. El alta de alumno devuelve `code: 'CUENTA_EXISTENTE'` y un texto que reconoce la cuenta.

**Controles que reducen el riesgo.** El login ordinario no distingue usuario inexistente y clave mala. El restablecimiento está limitado. No se envía el enlace a una cuenta de baja ni a una cuenta sin correo. El token de restablecimiento no revela en la respuesta el valor del enlace.

**Verificación segura.** En local, `POST /auth/forgotPassword` con un identificador que no exista y con uno de una cuenta de prueba. Comparar el código HTTP. No hacerlo contra el padrón real.

**Solución recomendada.** Respuesta única y el mismo tiempo de proceso aproximado: «Si la cuenta existe y tiene correo, enviaremos un enlace». Registrar el detalle solo en el servidor. En el alta de alumno, no explicar que la cuenta existe; pedir la contraseña o remitir al centro con el mismo texto en todos los rechazos por identidad. El 409 del CIF puede quedarse si el centro acepta que el formulario sirva para no duplicar empresas; si no, el mismo mensaje genérico.

**Prioridad de corrección:** media. Conviene cerrarlo en el mismo cambio que SEC-001, porque los mensajes orientan al atacante hacia la rama vulnerable.

**Limitaciones del análisis.** No se ha medido la diferencia de tiempo entre las ramas. La enumeración por tiempo es posible y no está cuantificada.

### SEC-010 — Datos personales y documentos almacenados sin cifrado de aplicación

**Gravedad:** media.  
**Estado:** confirmado para la aplicación. El cifrado de disco o de tablespace del servidor no se ha podido ver.  
**Categoría:** CWE-311 (ausencia de cifrado de datos sensibles). OWASP A02:2021.  
**Componente afectado:** `gf_alumnosfct` (`numeroSS`, `fechaNacimiento`, `dniTutorLegal`, domicilio, teléfono) y los BLOB de `dual_documentos` (CV, Anexo DGA, convenios, anexos firmados).  
**Ubicación:** modelo de datos y `backend/src/db/pool.js`, que abre la conexión sin opción `ssl`.  
**CVSS 3.1 estimado:** 6,5 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`) para quien ya tenga acceso de lectura a la base o a una copia de seguridad. No es un fallo remoto por sí solo.

**Descripción.** La aplicación guarda esos datos en claro. Las copias de `scripts/backup.js` salen en SQL también en claro; el directorio `backups/` está en `.gitignore`, el contenido no está cifrado por el script. Las rutinas y vistas del esquema usan `SQL SECURITY DEFINER`. La documentación del propio proyecto indica que en desarrollo la conexión es `root`. Este análisis no ha leído `backend/.env` ni ha imprimido usuarios ni claves. `.env` está ignorado por Git y no aparece entre los ficheros versionados.

La contraseña de las cuentas sí va con bcrypt de coste 10. El secreto JWT no está en el código y el servidor no arranca si falta, si tiene menos de 32 caracteres o si es el valor que en su día estuvo en el repositorio.

**Origen y recorrido.** Los formularios y las correcciones de administración escriben las columnas. Los PDF se insertan como BLOB. Quien lee la tabla, una réplica o un backup lee el dato.

**Condiciones de explotación.** Acceso a la base, a un volcado o al disco del servidor. No hace falta un fallo de la API. SEC-001 y SEC-002 son caminos de API hacia una parte de esos mismos datos.

**Impacto.** Exposición del número de la Seguridad Social, de documentos de identidad y de contratos si la base o el backup salen del entorno. La conexión sin TLS, si el servidor de bases no está en el mismo host, permite lectura en la red interna.

**Evidencia.** `CAMPOS` en `alumnoDatos.js` incluye `numeroSS` y `dniTutorLegal` sin transformación reversible de cifrado. `pool.js` no define `ssl`. El baseline marca vistas `SQL SECURITY DEFINER`. `.gitignore` excluye `.env`, `backups/` y `.pruebas.local.json`.

**Controles que reducen el riesgo.** bcrypt en las contraseñas. El listado de alumnos hacia la empresa no incluye el número de la Seguridad Social. `GET /solicitudes/alumno/:id/datos` es solo de administrador. Los correos escapan HTML y, según el diseño, no incluyen DNI ni teléfonos.

**Verificación segura.** Revisar el esquema y un backup de pruebas (no uno real) y comprobar que `numeroSS` se lee sin descifrar. Comprobar en el servidor de producción, cuando exista, TLS de MySQL, cuenta distinta de `root` y cifrado de disco. No copiar el contenido del backup a este informe.

**Solución recomendada.** Cuenta de base de privilegio mínimo, sin `DEFINER` de administrador. TLS hacia MySQL. Cifrar los BLOB y las columnas de secreto operativo con una clave fuera de la base, si el requisito del centro lo exige; como mínimo, cifrado de disco y de los backups, acceso restringido y un plazo de conservación. La falta de borrado (claves `RESTRICT` y auditoría inmutable) es una decisión de integridad ya documentada: hay que acompañarla de una base legal y de un acceso muy cerrado, no de más copias.

**Prioridad de corrección:** media. Es deuda de diseño, no un exploit de un formulario. Sube de prioridad si los backups salen del servidor del centro.

**Limitaciones del análisis.** No se ha entrado en el servidor MySQL ni se ha abierto un backup. No se afirma que la cuenta de producción sea `root`.

### SEC-011 — El token de sesión se guarda en `localStorage`

**Gravedad:** baja, como defecto aislado. El impacto pasa a ser el de la cuenta si aparece un XSS en el origen de la SPA.  
**Estado:** confirmado.  
**Categoría:** CWE-922 (almacenamiento inseguro de credenciales en un entorno expuesto a script). OWASP A07:2021.  
**Componente afectado:** `frontend/src/context/UserContext.js` y `frontend/src/utils/api.js`.  
**Ubicación:** `localStorage.setItem("user", ...)` con el objeto que incluye `token`.  
**CVSS 3.1 estimado:** 3,1 en ausencia de XSS (`AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N` no encaja del todo; se deja como hallazgo de diseño, no como compromiso demostrado).

**Descripción.** Cualquier script del origen de la SPA puede leer el JWT. React escapa el texto que pinta. El único `dangerouslySetInnerHTML` está en la ayuda: `marked` convierte el Markdown de `GET /ayuda/manual` y el HTML se inserta sin un sanitizador. Ese Markdown sale de `docs/MANUAL_DE_USUARIO.md`, un fichero del repositorio, no de un usuario. Mientras solo lo edite el equipo, no es un XSS explotable por un alumno o una empresa. Sí es un sumidero listo si ese fichero pasa a incluir HTML de otra fuente, o si otro fallo de contenido (SEC-008, mismo origen) llega a ejecutar script.

No se ha encontrado un XSS reflejado o almacenado alimentado por campos de usuario. Los correos pasan por `escapeHtml`.

**Condiciones de explotación.** Un script en el origen de la SPA. No está demostrado con los datos que introduce un usuario.

**Impacto.** Robo del token y uso durante 8 horas, y más allá de un cambio de contraseña (SEC-006).

**Evidencia.** `UserContext.js` persiste `newUser` completo. `Ayuda.jsx` asigna `manualHtml(...)` a `dangerouslySetInnerHTML`. `manual.js` configura `marked` sin sanitizar.

**Controles que reducen el riesgo.** El token no viaja en una cookie, así que un sitio ajeno no lo adjunta solo. La caducidad es de 8 horas y el cliente también borra la sesión al llegar `exp`.

**Verificación segura.** Inspeccionar `localStorage` en el navegador de desarrollo tras un login de prueba. No hace falta extraer el token en un informe.

**Solución recomendada.** Cookie `HttpOnly`, `Secure`, `SameSite=Strict` (o `Lax` si el flujo lo exige), y entonces sí protección CSRF en las peticiones que cambien estado. Sanitizar el HTML del manual aunque hoy el origen sea de confianza (`DOMPurify` o no renderizar HTML crudo). Hasta entonces, no dejar que el manual incorpore HTML que no haya pasado por revisión.

**Prioridad de corrección:** baja mientras no haya un XSS de usuario. Hacerla junto con SEC-006 si se rediseña la sesión.

**Limitaciones del análisis.** No se ha auditado el paquete JavaScript construido en producción ni las extensiones del navegador de los usuarios.

### SEC-012 — El nombre de la plantilla se copia a `Content-Disposition`

**Gravedad:** baja.  
**Estado:** confirmado.  
**Categoría:** CWE-113 (inyección de cabecera HTTP).  
**Componente afectado:** descarga de plantillas.  
**Ubicación:** `backend/src/services/plantillasService.js`, función `descargar`, cabecera `filename="${row.nombre_archivo}"`. El nombre guardado es `file.originalname` en `upload`.  
**CVSS 3.1 estimado:** 3,1 (`AV:N/AC:L/PR:H/UI:R/S:U/C:N/I:L/A:N`).

**Descripción.** El nombre original del DOCX se guarda y se interpola entre comillas en `Content-Disposition`. Un nombre con comilla, retorno de carro o salto de línea rompe la cabecera. Quien sube es un administrador; quien descarga puede ser un administrador o un coordinador. El efecto es una cabecera manipulada hacia el navegador del coordinador, no un acceso anónimo.

La descarga de documentos de trámite usa un nombre fijo `documento_<id>.pdf` y no tiene este problema.

**Condiciones de explotación.** Cuenta de administrador que suba un fichero con ese nombre, y un coordinador que lo descargue.

**Impacto.** Inyección de cabeceras en la respuesta de descarga. El alcance práctico es limitado por el rol y por los navegadores, que cada vez ignoran más el salto de línea en cabeceras.

**Evidencia.** `res.setHeader("Content-Disposition", \`attachment; filename="${row.nombre_archivo || "plantilla.docx"}"\`)`.

**Controles que reducen el riesgo.** Solo el administrador escribe el nombre. La ruta exige sesión y rol.

**Verificación segura.** En local, observar la cabecera al descargar una plantilla cuyo nombre de prueba contenga un espacio o una comilla, sin caracteres de control si no hace falta. No enviar la respuesta a otro usuario.

**Solución recomendada.** Generar el nombre en el servidor (`plantilla-<clave>-v<version>.docx`) o aplicar una lista de caracteres y codificación RFC 5987 (`filename*`).

**Prioridad de corrección:** baja.

**Limitaciones del análisis.** No se ha medido el comportamiento de un navegador concreto ante el salto de línea.

### SEC-013 — La semilla de demostración usa contraseñas iguales al identificador

**Gravedad:** baja para el repositorio; el impacto sería alto si esa semilla se hubiera cargado en una base accesible.  
**Estado:** potencial. El script sí hace lo descrito; no se ha comprobado si alguna base desplegada lo ha ejecutado.  
**Categoría:** CWE-1392 (credenciales por defecto). OWASP A07:2021.  
**Componente afectado:** `backend/scripts/seedDemo.js`.  
**Ubicación:** comentarios de cabecera del script y las altas que asignan la contraseña. `must_change_password` queda en 0.  
**CVSS:** no se puntúa sobre un sistema en marcha. Si la semilla estuviera cargada y el API fuera accesible, el acceso con el identificador como clave sería trivial (`AV:N/AC:L/PR:N`).

**Descripción.** El script de demostración documenta que la contraseña del personal es el correo, la de la empresa es el CIF y la del alumno es el DNI, y crea las cuentas sin obligar al cambio. `seedPruebas.js` genera claves aleatorias y las escribe en `backend/.pruebas.local.json`, que está ignorado por Git; ese otro script no repite el mismo defecto.

El fichero de demostración incluye además direcciones de correo concretas. No se reproducen aquí. No deben permanecer en un repositorio que pueda hacerse público, aunque la contraseña no esté escrita en claro al lado: el comentario dice que la contraseña es el propio identificador.

**Condiciones de explotación.** Haber ejecutado `seedDemo.js` contra una base a la que el API apunta, y que esas cuentas sigan activas.

**Impacto.** Entrada como administrador, coordinador, empresa o alumno de demostración, con el identificador como única credencial.

**Evidencia.** La cabecera de `seedDemo.js` describe el esquema de claves y `must_change_password = 0`. No se ha consultado `dual_usuarios` para ver si esas filas existen.

**Controles que reducen el riesgo.** No forma parte del arranque del servidor. Hace falta ejecutarlo a propósito. `.env` no está versionado.

**Verificación segura.** En la base local, buscar si existe el correo de personal que cita el script, sin volcar hashes ni clonar la base a otro sitio. Si aparece en un entorno que no sea un laboratorio aislado, desactivar la cuenta y sustituir la clave.

**Solución recomendada.** Borrar el esquema «la contraseña es el identificador». Si hace falta una semilla, generar claves como `seedPruebas.js`, obligar al cambio y no dejar correos personales en el fuente. Avisar en el propio script de que no se ejecute fuera de una base desechable.

**Prioridad de corrección:** baja en el código; inmediata si la comprobación de la base local o de producción encuentra esas cuentas.

**Limitaciones del análisis.** No se ha abierto la base.

## Controles revisados que sí sujetan el ataque

Se anotan para no repetir el trabajo y para no «corregir» lo que ya está bien.

| Control | Qué se ha visto |
|---|---|
| SQL | Las consultas de los servicios usan marcadores `?`. Los nombres de columna dinámicos de `alumnoDatos`, `empresaDatos` y tutores salen de mapas fijos (`CAMPOS` y listas de columnas), no del texto del cliente. Los `CALL` usan nombres de procedimiento de constantes (`ENTIDADES`, catálogo). No se ha encontrado un `ORDER BY` construido con un parámetro de usuario. Las migraciones legacy con `PREPARE` son scripts de esquema, no rutas HTTP. |
| Sesión y clave | Secreto JWT obligatorio, de al menos 32 caracteres, con el valor histórico rechazado. Rol y baja revalidados por petición. bcrypt con coste 10. El cambio de clave pide la actual, salvo el cambio forzado leído de la base. El enlace de restablecimiento caduca a los 30 minutos, lleva `purpose: reset`, usa otra clave de firma y el `UPDATE` condiciona al hash anterior, de modo que dos usos paralelos no pasan los dos. |
| Autorización por recurso | Empresa y alumno quedan atados a su fila (`getCompanyIdFromUser`, `getStudentIdFromUser`, `resolveSolicitudForUser`, `resolveOwnedEmpresaId`). La descarga pasa por `canDownloadDocumento`. El coordinador principal no se edita desde Tutores. El último administrador no se puede degradar ni dar de baja a sí mismo. El DNI del alumno no entra en la corrección de datos. |
| Documentos y firmas | Catálogo por tipo: quién sube, firma o ve. El Anexo DGA no lo ve la empresa. La firma de la aplicación es una atestación (`CONFIRMACION_APP`), no una firma criptográfica; el proyecto ya lo documenta y no se presenta como firma electrónica. |
| Correo | Plantillas con `escapeHtml`. El modo por defecto fuera de producción no envía. |
| Ficheros de ayuda | `resolveManualImage` se queda con el nombre base y una extensión de imagen. No se ha visto un salto de directorio aprovechable. |
| Errores | El manejador global no devuelve la pila. Los `SQLSTATE 45000` sí devuelven el mensaje de negocio, que es el texto pensado para la persona usuaria. |
| CSRF | No hay cookie de sesión. Un sitio ajeno no adjunta el JWT. |
| Órdenes del sistema | `backend/src` no llama a `child_process`. `soffice` está declarado y no se usa en `src`. |

La ausencia de un hallazgo en esta tabla no demuestra que el componente sea seguro frente a pruebas dinámicas o frente a un cambio posterior.

## Riesgos arquitectónicos

1. **El administrador de la aplicación es administrador del proceso.** SEC-004 convierte la plantilla en código. Mientras eso siga así, el robo de una cuenta de administrador no se queda en los datos del centro: llega a las credenciales del proceso.

2. **La sesión es un token opaco de 8 horas, sin versión.** SEC-006 y SEC-011 se refuerzan. Cualquier lectura del origen (XSS futuro, equipo compartido, extensión) supera al cambio de contraseña.

3. **El perímetro HTTP no está en el repositorio.** Cabeceras, TLS, proxy, cuenta de MySQL y copias de seguridad quedan en la máquina que despliegue. El código asume un solo proceso Node y una IP de socket fiable.

4. **La base concentra privilegio y datos.** Vistas y rutinas `DEFINER`, datos de menores y de empresas en las mismas tablas, y una auditoría que impide borrar. Es coherente con no perder el historial y obliga a tratar la base y los backups como el activo principal, no como un almacén intercambiable.

5. **Dos canales de alta crean la cuenta antes de que el centro mire.** El alumno nuevo y la empresa nacen activos. La validación del centro es un paso de negocio posterior, no la puerta de la cuenta. SEC-001 y SEC-002 se apoyan en ese orden.

6. **El cupo y el ciclo son datos que la empresa escribe y que la autorización lee.** No hay un estado «aprobado por el centro» distinto del estado de la solicitud. Cualquier ampliación hereda la validación anterior.

## Plan de remediación

1. **SEC-001.** Dejar de crear la cuenta y de escribir campos cuando la ficha existe y nadie ha demostrado la contraseña. Validar el DNI en el servidor.
2. **SEC-002.** Ciclo y cupo aprobados por el centro, separados de la petición de la empresa. El listado, el CV y la reserva deben usar solo lo aprobado, con un máximo de plazas.
3. **SEC-003.** Límite de ritmo y de volumen en las dos altas. Cuenta de empresa inactiva, o limitada a su propia solicitud, hasta la validación. `trust proxy` acorde al despliegue.
4. **SEC-004.** Dejar de ejecutar JavaScript de las plantillas. Aislar Chromium de la red si la generación se mantiene.
5. **SEC-005.** Actualizar `mysql2`, `multer`, `express`/`body-parser` y `nodemailer` según los GHSA, y pasar los tests. Quitar dependencias no usadas. TLS hacia MySQL.
6. **SEC-006 y SEC-011.** Huella de la contraseña dentro del control de sesión. Valorar la cookie `HttpOnly` y, en ese caso, CSRF. Sanitizar el HTML del manual.
7. **SEC-007 y SEC-008.** Cabeceras, sobre todo `nosniff`, y firma PDF antes de guardar. Nombre de descarga generado por el servidor (SEC-012).
8. **SEC-009.** Una sola respuesta en el restablecimiento y en el rechazo del alta.
9. **SEC-010 y SEC-013.** Cuenta de base mínima, backups cifrados y fuera del alcance de la aplicación. Confirmar que `seedDemo.js` no se ha cargado donde el API sea accesible; quitar el esquema de claves previsibles.

## Cobertura de la auditoría

| Área | Qué se ha revisado | Resultado breve |
|---|---|---|
| Inyección SQL | Servicios de `backend/src`, helpers, procedimientos llamados desde Node, migraciones con SQL dinámico | Sin inyección confirmada en las rutas. Identificadores dinámicos acotados a listas del código |
| XSS | `dangerouslySetInnerHTML`, correos, React | Sin XSS de datos de usuario confirmado. Sumidero del manual: ver SEC-011 |
| Autenticación y sesión | Login, cambio de clave, restablecimiento, JWT, limitador | SEC-001, SEC-006, SEC-009, SEC-011, SEC-013 |
| Autorización | Rutas, propiedad de empresa y alumno, documentos, tutores, personal, reservas | SEC-002. El resto de los flujos revisados comprueba el titular |
| API, masa y CORS | Asignación de campos, métodos, tamaño, CORS, CSRF | Listas blancas en las correcciones de datos. SEC-003 y SEC-007. CSRF no aplica al portador |
| Código y plantillas | `eval` propio, `child_process`, DOCX, Puppeteer | SEC-004. Sin comando de shell en `src` |
| Ficheros y rutas | Multer, descarga, imágenes del manual, nombre de plantilla | SEC-008 y SEC-012. El manual no permite salto de directorio |
| SSRF y redirecciones | URLs de usuario, `APP_URL`, Puppeteer | Sin redirección abierta desde el cliente. SSRF ligado a SEC-004, no reproducido |
| Criptografía | bcrypt, JWT, cifrado en reposo, aleatoriedad de la clave temporal | bcrypt y `crypto.randomBytes` correctos en lo revisado. SEC-010. Algoritmo JWT no fijado de forma explícita (recomendación dentro de SEC-006) |
| Lógica de negocio | Alta, validación, cupos, reservas, firmas, baja | SEC-001 y SEC-002. Las reservas usan bloqueos; no se probaron carreras |
| Errores y registros | Manejador global, Morgan, mensajes SQL de negocio | Sin pila hacia el cliente. Morgan en formato `dev`: SEC-007 |
| Dependencias | `npm audit` de producción y lectura del lockfile | SEC-005 |
| Configuración | `.gitignore`, `.env.example`, `index.js`, pool, correo | SEC-007 y SEC-010. Sin Docker ni proxy en el repositorio |

Módulos de servicio recorridos con este criterio: autenticación, restablecimiento, personal, solicitudes de alumno y de empresa, datos y cambios, tutores, reservas, documentos, generación, plantillas, convocatorias, panel, ayuda, notificaciones y el catálogo de documentos. El frontend se ha revisado en sesión, ayuda, llamadas autenticadas y el uso de HTML; no página por página de maquetación.

## Aspectos pendientes de verificar

- Si en la base real hay filas de `gf_alumnosfct` sin `dual_usuarios`, y si `seedDemo.js` llegó a ejecutarse ahí.
- Cuenta MySQL, TLS, cifrado de disco y ubicación de los backups en el entorno que se use de verdad.
- Cabeceras que añada un proxy que no está en el repositorio, y si la SPA y el API comparten origen.
- Número de saltos de ese proxy, para configurar `trust proxy` sin fiarse de cualquier `X-Forwarded-For`.
- Reproducción, en un laboratorio, de los GHSA de `mysql2`, `multer` y `body-parser` contra la forma concreta de llamar a esas bibliotecas.
- Escape de `node:vm` y peticiones salientes de Puppeteer con una plantilla de prueba aislada.
- Carreras de reserva y de cupo bajo carga. El código bloquea filas; no se ha medido.
- Diferencia de tiempo entre las ramas de `forgotPassword`.
- Comportamiento de los navegadores del centro ante un PDF que no lo sea, servido en línea.
- Avisos de `npm audit` en el frontend asociados al JavaScript que realmente se entrega al navegador, uno por uno.
- Pruebas dinámicas autenticadas (manipulación de peticiones en un entorno con datos sintéticos) sobre todos los identificadores de reserva, documento y cambio. La revisión estática no sustituye ese pase.

## Referencia de método

Se han usado como guía OWASP Top 10 2021, OWASP API Security Top 10 2023, las secciones de autenticación, sesión, acceso y datos de ASVS, y las CWE citadas en cada ficha. La evidencia preferente ha sido el código de este repositorio. Donde el hallazgo ya estaba descrito en `docs/tecnica/seguridad-y-permisos.md` (token en `localStorage`, cabeceras, proxy, PDF por MIME, plantillas, datos en claro), se ha vuelto a contrastar con el fuente y se mantiene solo si el recorrido sigue abierto. SEC-001 y SEC-002 no estaban formulados ahí como fallos explotables.
