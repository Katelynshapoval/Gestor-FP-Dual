# Seguridad y permisos

> Parte de la [documentación técnica](README.md). Flujo de autenticación en [autenticación y cuentas](logica-de-negocio/autenticacion-y-cuentas.md). Los identificadores SEC-001 a SEC-013 que aparecen aquí y en el código son los de la auditoría de seguridad del 28/10/2026: cada uno nombra la medida que lo cubre.

## 1. Capas de control de acceso

1. **`requireAuth`**: token HS256 válido (de la cookie `HttpOnly` del navegador o de `Authorization: Bearer`), cuenta activa con el mismo rol en BD y la misma contraseña con la que se emitió el token; con la cookie, cabecera `X-Requested-With: fpdual` en toda escritura; bloqueo mientras haya un cambio de contraseña obligatorio.
2. **`requireRole(...)`** en cada ruta: lista de roles admitidos.
3. **Propiedad en el servicio**: la empresa solo accede a lo de su empresa (`getCompanyIdFromUser`), el alumno a lo suyo (`getStudentIdFromUser`). Funciones: `resolveSolicitudForUser`, `resolveOwnedEmpresaId`, `assertCanUpload`, `canDownloadDocumento`, comprobaciones en `getDetalle`, `cancelar`, `firmarContexto`, `assignToReserva`.
4. **Catálogo de documentos**: quién sube, firma, revisa o ve cada tipo.
5. **Frontend**: `RequireRole` y menús por rol. **No es seguridad**: solo evita mostrar pantallas inútiles.

## 2. Matriz de permisos por funcionalidad

| Funcionalidad | ADMIN | COORD | EMPRESA | ALUMNO | Público |
| --- | :-: | :-: | :-: | :-: | :-: |
| Enviar solicitud de alumno / empresa | | | | | ✔ |
| Reaplicar la empresa | | | ✔ | | |
| Ver/validar/rechazar/reabrir solicitudes | ✔ | ✔ | | | |
| Dar de baja / reactivar | ✔ | | | | |
| Crear/editar convocatorias | ✔ | | | | |
| Ver convocatorias (lista) | ✔ | ✔ | | | estado y activa |
| Editar datos de empresa directamente | ✔ | ✔ | | | |
| Pedir cambio de datos de empresa | | | ✔ propia | | |
| Aprobar/rechazar cambios de empresa | ✔ | ✔ | | | |
| Editar datos de alumno directamente | ✔ | | | | |
| Pedir corrección de datos de alumno | | | | ✔ propia | |
| Aprobar/rechazar correcciones de alumno | ✔ | | | | |
| Añadir ciclos / subir cupos | ✔ | ✔ | ✔ propia, solo sin validar | | |
| Reducir cupos | ✔ | ✔ | ✔ propia | | |
| Tutores (crear, editar, desactivar) | ✔ | ✔ | ✔ propia (no el coordinador) | | |
| Asignar tutor a reserva | ✔ | ✔ | ✔ propia | | |
| Ver alumnos disponibles | | | ✔ | | |
| Reservar | ✔ (`/admin`) | ✔ (`/admin`) | ✔ ofertas propias | | |
| Cancelar reserva | ✔ (pendiente o confirmada) | ✔ | ✔ propia, pendiente | | |
| Reasignar, tipo de contrato, confirmar | ✔ | ✔ | | | |
| Ficha de reserva | ✔ | ✔ | ✔ propia | ✔ propia | |
| Subir documentos | según catálogo | según catálogo | según catálogo | CV/Anexo DGA propios | |
| Firmar | GESTOR | GESTOR | EMPRESA | ALUMNO | |
| Validar/rechazar documentos | ✔ | ✔ | | | |
| Generar documentos | ✔ | ✔ | | | |
| Subir plantillas | ✔ | | | | |
| Ver/descargar plantillas | ✔ | ✔ | | | |
| Seguimiento y panel | ✔ | ✔ | | | |
| Ayuda (manual y preguntas frecuentes) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Contraseña temporal, `/usuarios` | ✔ | | | | |
| Alta, edición, baja y reactivación de personal | ✔ | | | | |

## 3. Medidas implementadas

| Medida | Detalle | Referencia |
| --- | --- | --- |
| Secreto JWT obligatorio | ≥ 32 caracteres; se rechaza el antiguo secreto del repositorio; sin él el servidor no arranca. Algoritmo fijado a HS256 | `middleware/auth.js`, `index.js` |
| Estado de cuenta por petición | Desactivación, cambio de rol y **cambio de contraseña** efectivos en la siguiente petición (el token lleva una huella del hash, SEC-006) | `requireAuth` |
| Sesión en cookie `HttpOnly` | El token va solo en la cookie `fpdual_sesion` (`HttpOnly`, `SameSite=Strict`, `Secure` en producción, 8 h): ningún script de la página lo lee, así que un script inyectado no puede robarlo. El navegador guarda en `localStorage` solo quién está conectado y hasta cuándo. `POST /auth/logout` borra la cookie (SEC-011) | `middleware/auth.js`, `authService`, `utils/api.js` |
| Protección CSRF | Toda escritura con la cookie exige `X-Requested-With: fpdual`; sin ella, 403 `CSRF`. Otro sitio no puede añadir esa cabecera sin un permiso CORS que la API no da, y `SameSite=Strict` impide que la cookie viaje desde otro sitio | `middleware/auth.js` |
| Cambio de contraseña seguro | Contraseña actual obligatoria salvo cambio forzado leído de BD; pone una cookie de sesión nueva y cierra las demás sesiones | `authService.changePassword` |
| Contraseñas | bcrypt coste 10; mínimo 8 caracteres en todos los caminos | `authService`, altas, recuperación |
| Limitación de intentos | Login, formulario de alumno (cuenta existente o ficha sin cuenta), recuperación | `loginRateLimit.js` |
| Límite de altas públicas | 10 por IP y hora y 300 al día (configurables), para alumno y empresa (SEC-003) | `signupRateLimit` |
| Recuperación de contraseña | Misma respuesta exista o no la cuenta (SEC-009). Solo envía el enlace a cuentas activas con correo. El enlace es de un solo uso y va ligado al hash; la clave es distinta de la de sesión | `passwordResetService.js` |
| Formulario público sin sobrescritura | Alumno existente con cuenta: prueba su contraseña; ficha sin cuenta: se rechaza sin escribir nada (SEC-001); un único mensaje para todos los rechazos de identidad. DNI/NIE validado en el servidor. Empresa existente: 409 | `solicitudesAlumnoService`, `solicitudesEmpresaService` |
| Ampliación de plazas | Una empresa validada solo puede reducir plazas; máximo `MAX_PLAZAS_POR_CICLO` por ciclo (SEC-002) | `solicitudEmpresaOfertasService` |
| Correcciones de datos con revisión | Empresa y alumno proponen; el centro aprueba. El DNI/NIE y el CIF no se cambian | `alumnoCambiosService`, `solicitudEmpresaCambiosService` |
| Coordinador protegido | La empresa no lo edita desde Tutores | `empresaTutoresService` |
| Guarda única de subidas | Tipo, rol, propiedad, estado de reserva, familia, no reemplazar validados | `documentosService.assertCanUpload` |
| Contenido de las subidas | PDF con firma `%PDF-`; plantillas DOCX con firma ZIP (SEC-008, SEC-012) | `pdfUpload.js`, `plantillasService` |
| Descargas | PDF como `attachment`; nombre y tipo de las plantillas fijados por el servidor (SEC-008, SEC-012) | `documentosService`, `plantillasService` |
| Plantillas sin ejecución de código | Los comandos `<< >>` solo resuelven nombres de variable; Chromium sin JavaScript ni red (SEC-004). Subirlas sigue siendo solo de ADMINISTRADOR | `documentGenerationService`, `documentosRoute` |
| Cabeceras HTTP | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP restrictiva, HSTS si la petición es HTTPS, sin `X-Powered-By`; cuerpos JSON y URL-encoded de 100 KB como máximo (SEC-007) | `index.js` |
| Registro | En producción Morgan no registra la *query* de las URL | `index.js` |
| Cuenta de MySQL de la API | `DBUSER` solo tiene `SELECT`, `INSERT`, `UPDATE` y `EXECUTE`, y `DELETE` en tres tablas: no puede cambiar el esquema, quitar los triggers de auditoría ni leer otras bases. Migraciones, copias y datos de demostración usan la cuenta dueña (SEC-010) | `scripts/cuentaApp.js`, `scripts/lib/connect.js` |
| TLS hacia MySQL | Con `DBSSL` y `DBSSL_CA` cuando la base de datos está en otra máquina (SEC-010). En Docker, MySQL solo es accesible desde la red interna de los contenedores | `db/pool.js`, `docker-compose.yml` |
| Copias cifradas | `./deploy/fpdual.sh copia` cifra cada volcado con AES-256 y `BACKUP_KEY` antes de escribirlo | `deploy/fpdual.sh` |
| Manual saneado | El HTML del manual pasa por DOMPurify (SEC-011) | `pages/Ayuda/manual.js` |
| Escapado en correos | `escapeHtml` en todas las interpolaciones | `notificaciones.js` |
| Minimización | Sin DNI, teléfonos ni motivo de cancelación en correos; alumnos sin motivo libre; `/usuarios` solo admin | varios |
| Imágenes del manual sin rutas | Solo nombres de archivo de imagen dentro de `docs/manual/imagenes`; cualquier otra cosa es 400 | `ayudaRoute.resolveManualImage` |
| SQL parametrizado | En todos los servicios | — |
| Auditoría inmutable | `dual_eventos` con triggers que impiden modificarla; la cuenta de la API no puede quitarlos. Registra también cada contraseña temporal, de cualquier rol | migración 013, `authService.resetPassword` |
| Mensajes de error | Siempre en castellano y sin nombres de tablas, columnas ni restricciones; los detalles van solo al registro del servidor | `dbHelpers.mapSqlError` |
| Descarga después del permiso | `GET /documentos/:id/descargar` comprueba el permiso antes de leer el fichero | `documentosService.descargar` |
| Credenciales fuera del repositorio | `.env` ignorado; `mail/config.js` lee del entorno; `backups/`, `.pruebas.local.json` y `.demo.local.json` ignorados. Los datos de prueba y de demostración usan contraseñas aleatorias y correos de `example.com` / `fpdual.test` (SEC-013) | `.gitignore`, `seedPruebas.js`, `seedDemo.js` |
| Dependencias | `npm audit --omit=dev` sin avisos en el backend y en el frontend (React Router 7.18.5) (SEC-005). Todas las dependencias declaradas se usan | `backend/package.json`, `frontend/package.json` |

## 4. Límites conocidos

| Tema | Cómo es | Dónde |
| --- | --- | --- |
| Datos personales | `gf_alumnosfct` guarda `numeroSS`, fecha de nacimiento y DNI del tutor legal; los ficheros (con DNI y firmas) se guardan en la base de datos. La aplicación no cifra columnas ni ficheros; las copias del servidor sí van cifradas. `gf_alumnosfct` la comparten otras aplicaciones del centro, así que su estructura no se cambia | BD, `deploy/fpdual.sh` |
| Retención | No se borra a nadie: las claves foráneas son `RESTRICT` y la auditoría es inmutable | BD |
| Límites de intentos | Los de login, recuperación y altas públicas se cuentan en la memoria del proceso de la API. El despliegue ejecuta un solo proceso; al reiniciarlo, los contadores empiezan de cero | `loginRateLimit.js` |
| Cuenta de empresa desde el alta | Está activa desde el alta, porque la empresa necesita el portal para firmar y subir su convenio. Hasta que el centro valida la solicitud no ve alumnos ni puede reservar (SEC-003) | `solicitudesEmpresaService` |
| Contenido de los PDF | Se comprueba la firma `%PDF-`, no el resto del fichero. Los PDF se entregan siempre como descarga (`attachment`, `nosniff`), nunca se muestran desde el origen de la API | `pdfUpload.js` |
| CORS | La API no envía cabeceras CORS: solo la usa el frontend, servido desde el mismo origen por nginx. Un navegador no deja a otro sitio leer sus respuestas | `index.js`, `deploy/nginx.conf` |
| Firmas | `FIRMA_IMAGEN`, `SUBIDA_FIRMADA` y `CONFIRMACION_APP` no son firmas criptográficas: la prueba es el registro (cuenta, fecha, imagen, SHA-256 del fichero) | migraciones 013 y 027 |

No hay credenciales en el código versionado: los `.env.example` solo contienen nombres de variables y valores de ejemplo.
