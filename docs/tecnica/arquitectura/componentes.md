# Componentes

> Parte de la [documentación técnica](../README.md). Rutas relativas a la raíz del repositorio.

## 1. Backend

### 1.1 Arranque y transversales

| Fichero | Responsabilidad |
| --- | --- |
| [`src/index.js`](../../../backend/src/index.js) | Carga `.env`, **aborta el proceso** si `JWT_SECRET` falta, tiene menos de 32 caracteres o es el secreto revocado (`assertJwtConfig`). Registra `morgan('dev')`, `express.urlencoded`, `express.json` (límite por defecto de Express, 100 kB 🔶) y las rutas. Al escuchar arranca `startConvocatoriaScheduler()`. |
| [`src/routes/index.js`](../../../backend/src/routes/index.js) | Monta los 11 routers y el **manejador global de errores**: cualquier excepción no capturada → `500 {"error":"Error interno del servidor."}` (sin `code`). |
| [`src/middleware/asyncHandler.js`](../../../backend/src/middleware/asyncHandler.js) | Envuelve los handlers `async` para que un `reject` llegue al manejador global. |
| [`src/middleware/auth.js`](../../../backend/src/middleware/auth.js) | `signToken` (JWT de 8 h), `requireAuth` (verifica firma **y** relee `activo`, `must_change_password` y rol de BD en cada petición), `requireAuthAllowPasswordChange`, `requireRole(...)`. |
| [`src/middleware/loginRateLimit.js`](../../../backend/src/middleware/loginRateLimit.js) | Limitador en memoria de fallos (ventana deslizante de 15 min): 5 por IP+identificador, 30 por IP. Fábrica `createLoginRateLimiter` reutilizada por la recuperación de contraseña (3/20). |
| [`src/helpers/dbHelpers.js`](../../../backend/src/helpers/dbHelpers.js) | `normalizeCif`/`normalizeDni` (trim + mayúsculas), `cifValido`, `dniNieValido`, `getActiveConvocatoria` (lee el indicador `activa`, **sin** sincronizar fechas), `getStudentIdFromUser`, `getCompanyIdFromUser`, `callProcedure`, `callProcedureWithResult`, **`mapSqlError`**. |
| [`src/db/pool.js`](../../../backend/src/db/pool.js) | Pool `mysql2/promise`: 10 conexiones, `utf8mb4`, `dateStrings: ['DATE']` (las columnas `DATE` llegan como `'AAAA-MM-DD'`; las `DATETIME` siguen siendo objetos `Date`). |
| [`src/mail/config.js`](../../../backend/src/mail/config.js) | Objeto `transporter` único: modo `log` (no envía, registra destinatario enmascarado) o `smtp` (Gmail), con redirección opcional `MAIL_REDIRECT_TO`. |
| [`src/services/auditLog.js`](../../../backend/src/services/auditLog.js) | `recordEvent(conn, …)` dentro de la transacción del llamante; `recordEventAfterCommit(…)` para cambios hechos por procedimientos que confirman solos (si falla, solo registra en consola). |
| [`src/services/notificaciones.js`](../../../backend/src/services/notificaciones.js) | Plantillas de correo por evento; nunca lanzan excepción; releen los datos tras el *commit*. |

### 1.2 Módulos de dominio

| Router | Servicio(s) | Dominio | Documento |
| --- | --- | --- | --- |
| `authRoute` | `authService`, `passwordResetService` | Login, `/auth/me`, cambio y recuperación de contraseña, `/usuarios` | [autenticación](../logica-de-negocio/autenticacion-y-cuentas.md) |
| `convocatoriasRoute` | `convocatoriasService` | Convocatorias y su activación por fechas | [convocatorias](../logica-de-negocio/convocatorias.md) |
| `especialidadesRoute`, `transportesRoute`, `preferencesNewRoute` | `especialidadesService`, `transportesService`, `preferencesNewService` | Catálogos públicos de solo lectura | [API](../api-e-integraciones/referencia-endpoints.md#catálogos-públicos) |
| `solicitudesAlumnoRoute` | `solicitudesAlumnoService`, `solicitudTransiciones`, `bajaService` | Solicitud de alumno, revisión, baja | [solicitudes de alumno](../logica-de-negocio/solicitudes-alumno.md) |
| `solicitudesEmpresaRoute` | `solicitudesEmpresaService`, `empresaDatos`, `solicitudTransiciones`, `bajaService` | Solicitud de empresa, reaplicación, datos, cambios, ofertas y cupos | [solicitudes de empresa](../logica-de-negocio/solicitudes-empresa.md) |
| `reservasRoute` | `reservasService` | Reservas, tipo de contrato, confirmación, reasignación | [reservas](../logica-de-negocio/reservas.md) |
| `empresaTutoresRoute` | `empresaTutoresService` | Tutores de empresa y su asignación a reservas | [tutores](../logica-de-negocio/tutores-empresa.md) |
| `documentosRoute` | `documentosService`, `documentosStore`, `documentosWorkflow`, `documentCatalogue`, `documentStaffQuery`, `documentGenerationService`, `documentGenerationConfig`, `plantillasService` | Documentos, firmas, revisión, generación, plantillas, seguimiento | [documentos y firmas](../logica-de-negocio/documentos-y-firmas.md) |
| `panelRoute` | `panelService` | Contadores del panel del personal | [panel](../logica-de-negocio/panel-y-seguimiento.md) |

### 1.3 Grafo de dependencias entre servicios

```mermaid
flowchart LR
  SA[solicitudesAlumnoService] --> DW[documentosWorkflow]
  SA --> ST[solicitudTransiciones]
  SE[solicitudesEmpresaService] --> ED[empresaDatos]
  SE --> DG[documentGenerationService]
  SE --> ST
  ST --> ER[estadoReglas]
  ST --> NO[notificaciones]
  ST --> AL[auditLog]
  RS[reservasService] --> DW
  RS --> DC[documentCatalogue]
  RS --> ER
  RS --> AL
  RS --> NO
  DS[documentosService] --> DW
  DS --> STORE[documentosStore]
  DS --> DG
  DS --> ER
  DS --> AL
  DS --> NO
  DG --> GC[documentGenerationConfig]
  DG --> STORE
  GC --> ED
  STORE --> AL
  STORE --> DW
  DW --> DC
  DW --> DQ[documentStaffQuery]
  ER --> DC
  BJ[bajaService] --> ER
  BJ --> AL
  BJ --> NO
  PR[passwordResetService] --> AU[authService]
  PR --> NO
  PS[panelService] --> DW
```

Puntos delicados de acoplamiento:

- **`documentCatalogue.js` es la fuente única** de qué documentos existen, a qué padre pertenecen, quién sube, firma o revisa y si se generan. Lo consumen reglas, listados, subidas, firmas y el panel. Pero **los triggers `trg_dd_bi_reglas` / `trg_dd_bu_reglas` duplican la lista «tipo → padre»** y `sp_confirmar_reserva` duplica la regla de familia de anexo (`'%beca%'`). Cambiar el catálogo exige revisar esas tres piezas ([decisiones técnicas](../decisiones-tecnicas.md#catálogo-de-documentos-en-código-duplicado-en-bd)).
- **`documentosWorkflow.projectItem`** proyecta cada documento para un rol (estado operativo, acción pendiente, `puede_*`). Todas las pantallas (portales, Seguimiento, panel, ficha de reserva) usan esta proyección, de modo que muestran los mismos estados.
- **`empresaDatos.js`** concentra la lectura y escritura de los datos de empresa (tablas protegidas `ge_*`) y la lógica de copia en escritura; la usan la edición directa, la aprobación de cambios, la reaplicación y la generación del convenio.

### 1.4 Patrones de código recurrentes

- **Handlers como funciones `exports.xxx = async (req, res)`**: el servicio recibe `req`/`res` directamente (no hay capa de controlador separada). Las pruebas los ejercitan con `mockReq`/`mockRes` del arnés.
- **Transacción manual**: `pool.getConnection()` → `beginTransaction()` → `SELECT … FOR UPDATE` → regla → cambios → `recordEvent(conn)` → `commit()`; en `catch`, `rollback()` y `sendSqlError`. Ejemplos: [`solicitudTransiciones.aplicarTransicion`](../../../backend/src/services/solicitudTransiciones.js), `documentosService.validar`, `reservasService.setTipoContrato`.
- **Procedimientos con transacción propia** (`sp_reservar_alumno`, `sp_reasignar_reserva`, `sp_confirmar_reserva`, `sp_cancelar_reserva_admin`): se llaman sobre el *pool*, nunca dentro de una transacción del backend, y la auditoría se escribe después con `recordEventAfterCommit` (ver [integridad y transacciones](../base-de-datos/integridad-y-transacciones.md#5-transacciones)).
- **Respuesta de denegación** `{ status, error, code }`: las reglas puras devuelven `null` (permitido) o este objeto, que el servicio traduce a HTTP.
- **SQL parametrizado** en todo el código; los nombres de tabla/columna interpolados provienen siempre de constantes internas (`cfg.table`, `cfg.pk`).

## 2. Frontend

### 2.1 Estructura

| Elemento | Responsabilidad |
| --- | --- |
| [`App.js`](../../../frontend/src/App.js) | Rutas. Las privadas se envuelven en `RequireRole` (solo redirige; la seguridad real está en el backend). Redirecciones de rutas antiguas (`/linkStudents` → `/alumnos`, `/companiesView` → `/empresas`, `/documentsView` → `/documentos`). |
| [`navigation.js`](../../../frontend/src/navigation.js) | Menú y página de inicio por rol (`homeForRole`), títulos de página. |
| [`context/UserContext.js`](../../../frontend/src/context/UserContext.js) | Sesión en `localStorage["user"] = { data, expires }`; `expires` = `exp` del JWT. Cierra la sesión al caducar, ante el evento `fpdual:session-expired` y sincroniza entre pestañas. |
| [`utils/api.js`](../../../frontend/src/utils/api.js) | `getJSON`, `postJSON`, `putJSON`, `patchJSON`, `postForm`, `getBlob`, `publicJSON`. Todo error lanza `Error` con `status`, `code` y `body`; un 401 con token (salvo `/auth/login` y `/auth/changePassword`) dispara el evento de sesión caducada. |
| `utils/labels.js`, `utils/reservaEstados.js`, `utils/documentos.js`, `utils/cupos.js` | Etiquetas en español y variantes de insignia de cada valor del backend. |
| `hooks/useUrlFilters.js` | Filtros persistidos en la URL (listas de Alumnos, Empresas, Reservas, Seguimiento). |

### 2.2 Pantallas

| Ruta | Página | Roles | Endpoints principales |
| --- | --- | --- | --- |
| `/` | `Home` | Todos | `/convocatorias/estado` |
| `/login`, `/recuperar-contrasena`, `/restablecer-contrasena`, `/cambiarPassword` | `Login`, `RecuperarPassword`, `CambiarPassword` | Público / autenticado | `/auth/*` |
| `/addDualStudent` | `AddDualStudent` (formulario en 6 pasos) | Público | `POST /solicitudes/alumno` (multipart), `/especialidades`, `/preferencias` |
| `/addCompanyRequest` | `AddCompanyRequest` (6 pasos) | Público | `POST /solicitudes/empresa`, `/especialidades`, `/transportes` |
| `/panel` | `Panel` | Personal | `/panel/resumen` |
| `/alumnos` | `LinkStudents` | Personal y EMPRESA | Personal: `/solicitudes/alumno?include=full`, validar/rechazar/reabrir, `/reservas/ofertas-elegibles`, `/reservas/admin`. Empresa: `/alumnos/disponibles`, `/cupos/empresa`, `POST /reservas` |
| `/empresas` | `AdminCompanyView` | Personal | `/solicitudes/empresa/todas`, datos, cambios, cupos, convenio, tutores, baja |
| `/reservas` | `Reservas` | Personal | `GET /reservas`; cada fila abre `ReservaDetalle` |
| `/documentos` | `AdminDocumentsView` (Seguimiento + Plantillas) | Personal | `/documentos/seguimiento`, `/documentos/plantillas` |
| `/convocatorias` | `Convocatorias` | Personal (crear/editar: ADMINISTRADOR en backend) | `/convocatorias` |
| `/companyMain` | `CompanyView` (Datos, Reservas, Documentos, Tutores) | EMPRESA | `/solicitudes/empresa/mia?incluir_anteriores=1`, `reapply`, `cambios`, cupos, `/reservas/empresa`, `/documentos/empresa`, `/tutores/empresa` |
| `/studentMain` | `StudentMain` (Datos, Reservas, Documentos) | ALUMNO | `/solicitudes/alumno/mia`, `/reservas/alumno`, `/documentos/alumno/mios` |
| `/ayuda` | `Ayuda` (buscador, guías por perfil, preguntas frecuentes, manual por capítulos) | Todos, también sin sesión | `/ayuda/manual`, `/ayuda/imagenes/:file` |

### 2.3 Componentes compartidos relevantes

- [`components/reservas/ReservaDetalle.jsx`](../../../frontend/src/components/reservas/ReservaDetalle.jsx): ciclo de vida completo de una reserva en un panel (tipo de contrato, anexo y calendario, tutor, lista de confirmación, cancelar, reasignar). Todo lo que muestra sale de `GET /reservas/:id/detalle`, que ya proyecta las acciones permitidas para el rol.
- `components/DocumentoItem.jsx`, `components/ui/PdfViewer.jsx`: visualización, subida, firma y revisión de un documento proyectado.
- `components/ui/Modal.jsx`, `MotivoDialog.jsx`: diálogos accesibles; `MotivoDialog` exige motivo cuando la acción lo requiere.
- `components/BajaControls.jsx`: «Dar de baja» / «Reactivar» (solo se muestra a ADMINISTRADOR).
- `components/CupoReductionDialog.jsx`: selección de las reservas pendientes a cancelar al reducir plazas (responde al `409 requires_selection` del backend).
- `components/portal/Pendientes.jsx`: bloque «Qué tienes pendiente» de los portales, construido con datos que ya da el backend.
- `pages/Ayuda/`: [`manual.js`](../../../frontend/src/pages/Ayuda/manual.js) divide el Markdown del manual en capítulos (cada `##` precedido de `<a id>`; el título, la versión y el «Índice» se quedan fuera), guarda qué anclas tiene cada capítulo, lo pasa a HTML con `marked` y busca en sus apartados sin tildes ni mayúsculas. [`faq.js`](../../../frontend/src/pages/Ayuda/faq.js) tiene las preguntas frecuentes y las tarjetas de perfil, que enlazan a anclas del manual. [`Ayuda.jsx`](../../../frontend/src/pages/Ayuda/Ayuda.jsx) muestra un capítulo cada vez: cualquier enlace `#ancla` (tarjetas, preguntas, resultados, enlaces del propio manual o la URL) abre el capítulo que la contiene, guarda la ancla en el historial y vuelve a desplazarse cuando cargan las capturas que hay encima. `#indice` lleva a la lista de capítulos.

El frontend **no decide reglas de negocio**: los botones se habilitan según `puede_*`, `acciones.*.permitido` o el estado recibido, y el backend vuelve a comprobarlo todo. Excepción conocida: la validación de formato del DNI/NIE del alumno y del NSS solo existe en el formulario ([comportamientos especiales](../comportamientos-especiales/solicitudes.md#dni-del-alumno-sin-validar-en-el-backend)).
