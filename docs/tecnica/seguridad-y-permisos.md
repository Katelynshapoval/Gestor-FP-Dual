# Seguridad y permisos

> Parte de la [documentación técnica](README.md). Flujo de autenticación en [autenticación y cuentas](logica-de-negocio/autenticacion-y-cuentas.md). Auditoría de seguridad del 28/10/2026 y sus correcciones (SEC-001 a SEC-013): [informe](../security/security-audit.md) · [corrección](../security/remediation.md).

## 1. Capas de control de acceso

1. **`requireAuth`**: token HS256 válido, cuenta activa con el mismo rol en BD y la misma contraseña con la que se emitió el token; bloqueo por cambio de contraseña pendiente.
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
| Cambio de contraseña seguro | Contraseña actual obligatoria salvo cambio forzado leído de BD; devuelve un token nuevo y cierra las demás sesiones | `authService.changePassword` |
| Contraseñas | bcrypt coste 10; mínimo 8 caracteres en todos los caminos | `authService`, altas, recuperación |
| Limitación de intentos | Login, formulario de alumno (cuenta existente o ficha sin cuenta), recuperación | `loginRateLimit.js` |
| Límite de altas públicas | 10 por IP y hora y 300 al día (configurables), para alumno y empresa (SEC-003) | `signupRateLimit` |
| Recuperación de contraseña | Misma respuesta exista o no la cuenta (SEC-009). Solo envía el enlace a cuentas activas con correo. El enlace es de un solo uso y va ligado al hash; la clave es distinta de la de sesión | `passwordResetService.js` |
| Formulario público sin sobrescritura | Alumno existente con cuenta: prueba su contraseña; ficha sin cuenta: se rechaza sin escribir nada (SEC-001); un único mensaje para todos los rechazos de identidad. DNI/NIE validado en el servidor. Empresa existente: 409 | `solicitudesAlumnoService`, `solicitudesEmpresaService` |
| Ampliación de plazas | Una empresa validada solo puede reducir plazas; máximo `MAX_PLAZAS_POR_CICLO` por ciclo (SEC-002) | `solicitudesEmpresaService` |
| Correcciones de datos con revisión | Empresa y alumno proponen; el centro aprueba. El DNI/NIE y el CIF no se cambian | `alumnoCambiosService`, `solicitudesEmpresaService` |
| Coordinador protegido | La empresa no lo edita desde Tutores | `empresaTutoresService` |
| Guarda única de subidas | Tipo, rol, propiedad, estado de reserva, familia, no reemplazar validados | `documentosService.assertCanUpload` |
| Contenido de las subidas | PDF con firma `%PDF-`; plantillas DOCX con firma ZIP (SEC-008, SEC-012) | `pdfUpload.js`, `plantillasService` |
| Descargas | PDF como `attachment`; nombre y tipo de las plantillas fijados por el servidor (SEC-008, SEC-012) | `documentosService`, `plantillasService` |
| Plantillas sin ejecución de código | Los comandos `<< >>` solo resuelven nombres de variable; Chromium sin JavaScript ni red (SEC-004). Subirlas sigue siendo solo de ADMINISTRADOR | `documentGenerationService`, `documentosRoute` |
| Cabeceras HTTP | `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP restrictiva, HSTS si la petición es HTTPS, sin `X-Powered-By`; cuerpos JSON y URL-encoded de 100 KB como máximo (SEC-007) | `index.js` |
| Registro | En producción Morgan no registra la *query* de las URL | `index.js` |
| TLS hacia MySQL | Opcional con `DBSSL` y `DBSSL_CA` (SEC-010) | `db/pool.js` |
| Manual saneado | El HTML del manual pasa por DOMPurify (SEC-011) | `pages/Ayuda/manual.js` |
| Escapado en correos | `escapeHtml` en todas las interpolaciones | `notificaciones.js` |
| Minimización | Sin DNI, teléfonos ni motivo de cancelación en correos; alumnos sin motivo libre; `/usuarios` solo admin | varios |
| Imágenes del manual sin rutas | Solo nombres de archivo de imagen dentro de `docs/manual/imagenes`; cualquier otra cosa es 400 | `ayudaRoute.resolveManualImage` |
| SQL parametrizado | En todos los servicios | — |
| Auditoría inmutable | `dual_eventos` con triggers que impiden modificarla | migración 013 |
| Credenciales fuera del repositorio | `.env` ignorado; `mail/config.js` lee del entorno; `backups/`, `.pruebas.local.json` y `.demo.local.json` ignorados. Los datos de prueba y de demostración usan contraseñas aleatorias y correos de `example.com` / `fpdual.test` (SEC-013) | `.gitignore`, `seedPruebas.js`, `seedDemo.js` |
| Dependencias | `npm audit --omit=dev` del backend sin avisos tras actualizar (SEC-005); quitadas las que no se usaban | `backend/package.json` |

## 4. Riesgos y limitaciones conocidos

| Riesgo | Situación | Dónde |
| --- | --- | --- |
| Conexión a MySQL como `root` | Confirmado en desarrollo; rutinas y vistas `SQL SECURITY DEFINER` con `root`. Pendiente fuera del código: una cuenta con privilegios mínimos (SEC-010) | BD |
| Datos personales sensibles en claro | `numeroSS`, fecha de nacimiento, DNI del tutor legal en `gf_alumnosfct` (tabla protegida); ficheros con DNI y firmas como BLOB sin cifrado a nivel de aplicación. Pendiente: cifrado del disco y de las copias, y por columna si el centro lo exige | BD |
| Sin retención ni anonimización | No se puede borrar a nadie (FK `RESTRICT` + auditoría inmutable) | BD |
| Tokens en `localStorage` | Accesibles a cualquier script de la página (riesgo XSS). Pendiente (SEC-011): llevar la sesión a una cookie `HttpOnly` con CSRF | `UserContext.js` |
| Límites en memoria | Los de login, recuperación y altas públicas viven en un proceso y se pierden al reiniciar | `loginRateLimit.js` |
| Cuenta de empresa activa desde el alta | Puede entrar antes de que el centro la valide, aunque sin ver alumnos ni ampliar después (SEC-003, en parte) | `solicitudesEmpresaService` |
| Validación de PDF por cabecera | Solo se comprueba la firma `%PDF-`, no el resto del fichero ni las firmas digitales | `pdfUpload.js` |
| CORS sin configurar | Depende del proxy de despliegue 🔶 | `index.js` |
| Contraseña temporal de alumnos y empresas sin auditoría | El reseteo de personal sí queda en `dual_eventos` (`USUARIO`). El de alumnos y empresas no. Ver [autenticación § 6](logica-de-negocio/autenticacion-y-cuentas.md#6-contraseña-temporal--post-usuariosidresetpassword-administrador) | `authService.resetPassword` |
| Avisos de dependencias del frontend | La cadena de `react-scripts` sigue con avisos de `npm audit` (deuda de construcción) | `frontend/package.json` |
| Firmas no criptográficas | `CONFIRMACION_APP` / `SUBIDA_FIRMADA` son atestaciones | migración 013 |

No se han encontrado credenciales en el código versionado; `backend/.env.example` solo contiene nombres de variables.
