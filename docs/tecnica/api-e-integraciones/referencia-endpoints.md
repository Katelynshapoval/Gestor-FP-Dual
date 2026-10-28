# Referencia de endpoints

> Parte de [API e integraciones](README.md). Fuente: [`backend/src/routes/`](../../../backend/src/routes). «Personal» = ADMINISTRADOR o COORDINADOR. «Propiedad» = el servicio comprueba además que el recurso es del usuario (403 si no). Los efectos y reglas detallados están en los documentos de [lógica de negocio](../logica-de-negocio/README.md).

## Autenticación y cuentas — `authRoute`

| Método y ruta | Acceso | Entrada | Salida / efecto |
| --- | --- | --- | --- |
| `POST /auth/login` | Público | `{ username | email, password }` | `{ token, user }` · 400 · 401 · 403 · 429 |
| `POST /auth/forgotPassword` | Público | `{ username }` | 200 si se envía el enlace · 404 `CUENTA_NO_ENCONTRADA` · 403 `CUENTA_DESACTIVADA` · 400 `SIN_CORREO` · 429 |
| `POST /auth/resetPassword` | Público | `{ token, newPassword }` | 200 · 400 `ENLACE_NO_VALIDO` |
| `GET /auth/me` | Autenticado (aunque deba cambiar contraseña) | — | Usuario con `cif`/`dni` |
| `POST /auth/changePassword` | Autenticado (ídem) | `{ currentPassword?, newPassword }` | 200 · 400 · 401 |
| `GET /usuarios` | ADMINISTRADOR | — | Lista de todos los usuarios (sin hash). Ninguna pantalla la usa |
| `GET /usuarios/personal` | ADMINISTRADOR | — | Solo administradores y coordinadores |
| `POST /usuarios/personal` | ADMINISTRADOR | `{ nombre, email, rol }` | 201 `{ usuario, newPassword }` · 400 · 409 `EMAIL_DUPLICADO` |
| `PATCH /usuarios/personal/:id` | ADMINISTRADOR | `{ nombre?, email?, rol? }` | 400 `ROL_PROPIO`, `ULTIMO_ADMINISTRADOR` |
| `POST /usuarios/personal/:id/baja` | ADMINISTRADOR | — | `activo = 0` · 400 `BAJA_PROPIA`, `ULTIMO_ADMINISTRADOR` |
| `POST /usuarios/personal/:id/reactivar` | ADMINISTRADOR | — | `activo = 1` |
| `POST /usuarios/:id/resetPassword` | ADMINISTRADOR | — | `{ newPassword }` temporal · `must_change_password = 1`. Si el destino es personal, evento `USUARIO` |

## Convocatorias — `convocatoriasRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /convocatorias/activa` | Público | Sincroniza; 404 si no hay |
| `GET /convocatorias/estado` | Público | `{ abierta, activa, proxima }` |
| `GET /convocatorias` | Personal | Todas |
| `POST /convocatorias` | ADMINISTRADOR | `{ nombre, fecha_inicio, fecha_fin }` · 400 · 409 solape/duplicado |
| `PUT /convocatorias/:id` | ADMINISTRADOR | Igual; 400 si está activa |

## Ayuda — `ayudaRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /ayuda/manual` | Público | `{ markdown }` con [`docs/MANUAL_DE_USUARIO.md`](../../MANUAL_DE_USUARIO.md) tal cual; 404 si no se puede leer. La página `/ayuda` lo divide en capítulos en el navegador |
| `GET /ayuda/imagenes/:file` | Público | Captura de `docs/manual/imagenes/`. Solo nombres simples `png`, `jpg`, `jpeg`, `webp` o `gif` (400 si no, sin rutas); 404 si no existe |

## Catálogos públicos

| Método y ruta | Notas |
| --- | --- |
| `GET /especialidades` | Solo activas, con `turno` como texto |
| `GET /transportes` | Catálogo completo |
| `GET /tiposContrato` | Catálogo completo |
| `GET /preferencias?id_especialidad=` | 400 sin parámetro |

## Solicitudes de alumno — `solicitudesAlumnoRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `POST /solicitudes/alumno` | Público | `multipart`: campos + `cv` + `anexoDga` (PDF ≤ 10 MB) + `password` · 201 · 400 · 401 `CUENTA_EXISTENTE` · 403 · 409 · 429 |
| `GET /solicitudes/alumno/mia` | ALUMNO | Solicitud actual o más reciente · 404 `SIN_SOLICITUD` |
| `GET /solicitudes/alumno?estado=&convocatoria=&include=full` | Personal | Lista con documentos (y reservas con `include=full`) |
| `GET /solicitudes/alumno/:id` | Personal | Detalle |
| `GET /solicitudes/alumno/:id/documentos` | Personal | Todos sus documentos |
| `POST /solicitudes/alumno/:id/validar` | Personal | Exige CV y Anexo DGA validados |
| `POST /solicitudes/alumno/:id/rechazar` | Personal | `{ motivo }` |
| `POST /solicitudes/alumno/:id/reabrir` | Personal | `{ motivo? }` · solo convocatoria activa |
| `GET /solicitudes/alumno/:id/baja` | ADMINISTRADOR | Reservas que se cancelarían |
| `POST /solicitudes/alumno/:id/baja` | ADMINISTRADOR | `{ motivo }` → `{ canceladas, pendientes }` |
| `POST /solicitudes/alumno/:id/reactivar` | ADMINISTRADOR | `{ motivo? }` → `{ estado }` |

## Solicitudes de empresa — `solicitudesEmpresaRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `POST /solicitudes/empresa` | Público | JSON completo del alta · 201 · 400 · 409 |
| `POST /solicitudes/empresa/reapply` | EMPRESA | `{ nombreCoordinador?, emailCoordinador?, telefonoCoordinador?, descripcion_puesto?, especialidades[], transportes[] }` |
| `GET /solicitudes/empresa/mia[?incluir_anteriores=1]` | EMPRESA | Con el parámetro: última solicitud + `puede_reaplicar`, `convocatoria_abierta` |
| `GET /solicitudes/empresa/todas` | Personal | Todas, enriquecidas (pantalla Empresas) |
| `GET /solicitudes/empresa?estado=&convocatoria=` | Personal | Lista simple |
| `GET /solicitudes/empresa/:id` | Personal, EMPRESA (propiedad) | Datos + ofertas |
| `GET /solicitudes/empresa/:id/especialidades` | Personal, EMPRESA (propiedad) | Ofertas con plazas |
| `POST /solicitudes/empresa/:id/especialidades` | Personal, EMPRESA (propiedad) | `{ id_especialidad, cantidad }` · convocatoria activa |
| `PUT /solicitudes/empresa/:id/especialidades/:idOferta/cantidad` | Personal, EMPRESA (propiedad) | `{ cantidad, confirmar_cancelaciones?, ids_reservas_cancelar? }` · 409 `requires_selection` |
| `GET /solicitudes/empresa/:id/documentos` | Personal, EMPRESA (propiedad) | |
| `GET /solicitudes/empresa/:id/datos` | Personal, EMPRESA (propiedad) | |
| `PUT /solicitudes/empresa/:id/datos` | Personal | Edición directa (incluido CIF) · convocatoria activa |
| `GET /solicitudes/empresa/:id/cambios` | Personal, EMPRESA (propiedad) | `{ pending, ultimo }` con `diff` |
| `POST /solicitudes/empresa/:id/cambios` | EMPRESA (propiedad) | Crea o sustituye la pendiente · 403 si incluye `cif` |
| `POST /solicitudes/empresa/:id/cambios/:idCambio/aprobar` | Personal | `{ confirmar_conflicto? }` · 409 conflictos |
| `POST /solicitudes/empresa/:id/cambios/:idCambio/rechazar` | Personal | `{ motivo }` |
| `POST /solicitudes/empresa/:id/validar` · `/rechazar` · `/reabrir` | Personal | Como en alumno |
| `GET|POST /solicitudes/empresa/:id/baja` · `POST …/reactivar` | ADMINISTRADOR | Como en alumno |

## Reservas — `reservasRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /alumnos/disponibles` | EMPRESA | Candidatos de sus ciclos en la convocatoria activa |
| `GET /cupos/empresa` | EMPRESA | Ofertas validadas de la activa con plazas |
| `GET /reservas` | Personal | Todas |
| `GET /reservas/empresa` | EMPRESA | Las suyas |
| `GET /reservas/alumno` | ALUMNO | Las suyas, sin motivo |
| `GET /reservas/:id/detalle` | Todos los roles (propiedad) | Ficha completa con acciones |
| `GET /reservas/ofertas-elegibles?id_solicitud_alumno=[&reasignar_desde=]` | Personal | |
| `GET /reservas/alumnos-elegibles?id_solicitud_empresa_especialidad=` | Personal | |
| `POST /reservas` | EMPRESA | `{ id_solicitud_alumno, id_solicitud_empresa_especialidad }` |
| `POST /reservas/admin` | Personal | Ídem, sin exigir convocatoria activa |
| `POST /reservas/:id/cancelar` | EMPRESA (propiedad) | `{ motivo }` · solo PENDIENTE |
| `POST /reservas/:id/cancelar-admin` | Personal | `{ motivo }` |
| `POST /reservas/:id/reasignar` | Personal | `{ id_solicitud_empresa_especialidad, motivo }` |
| `POST /reservas/:id/tipo-contrato` | Personal | `{ id_tipo_contrato }` |
| `POST /reservas/:id/confirmar` | Personal | `{ id_tipo_contrato? }` |

## Tutores — `empresaTutoresRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET|POST /tutores/empresa` | EMPRESA | Propios |
| `GET|POST /tutores/empresa/:idEmpresa` | Personal, EMPRESA (solo la suya) | `?activo=1` en GET |
| `PATCH /tutores/:id` | Personal, EMPRESA (propiedad) | Campos parciales · 403 `COORDINADOR_PRINCIPAL` |
| `POST /tutores/:id/desactivar` | Personal, EMPRESA (propiedad) | Idempotente |
| `PATCH /reservas/:id/tutor` | Personal, EMPRESA (propiedad) | `{ id_empresa_tutor | null }` |

## Documentos — `documentosRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `POST /documentos/alumno/:idSolicitud/:tipo` | Personal, ALUMNO (propiedad) | `multipart` `archivo` |
| `GET /documentos/alumno/mios` | ALUMNO | Lista proyectada |
| `GET /documentos/empresa` | EMPRESA | Lista proyectada |
| `GET /documentos/seguimiento?page=&pageSize=&search=&convocatoria=&documento=&estado=&accionPendiente=&alumno=&empresa=&especialidad=&contexto=` | Personal | Página + resumen + opciones de filtro |
| `POST /documentos/generar` | Personal | `{ clave, id_solicitud_empresa | id_reserva, regenerar? }` · 409 `SIN_PLANTILLA` |
| `POST /documentos/subir` | Todos (catálogo + propiedad) | `multipart`: `archivo`, `clave`, id del padre |
| `POST /documentos/firmar` | Todos (catálogo + propiedad) | `{ clave, id_reserva }` |
| `POST /documentos/:id/firmar` | Todos (catálogo + propiedad) | |
| `POST /documentos/empresa/:idSolicitud/convenio` | Personal, EMPRESA | `multipart` |
| `POST /documentos/reserva/:idReserva/anexo` | Personal, EMPRESA | `multipart`; familia según el tipo guardado |
| `GET /documentos/:id/descargar` | Autenticado (permisos por rol y propiedad) | PDF `inline` |
| `POST /documentos/:id/validar` | Personal | Cascada a empresa si es convenio |
| `POST /documentos/:id/rechazar` | Personal | `{ motivo }` |
| `GET /documentos/plantillas` | Personal | Plantillas por tipo y versiones |
| `POST /documentos/plantillas` | ADMINISTRADOR | `multipart`: `archivo` (.docx), `clave` |
| `GET /documentos/plantillas/:id/descargar` | Personal | DOCX `attachment` |

Atención al orden de rutas en Express: `GET /solicitudes/alumno/mia` se declara antes que `GET /solicitudes/alumno/:id` (lo indica un comentario en la ruta), y `GET /solicitudes/empresa/mia` y `/todas` antes que `GET /solicitudes/empresa/:id`. Invertir ese orden haría que `mia`/`todas` se interpretaran como ids. En `documentosRoute` y `reservasRoute` no hay colisiones porque las rutas con `:id` tienen un segmento más (`/:id/descargar`, `/:id/detalle`…).

## Panel — `panelRoute`

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /panel/resumen?convocatoria=` | Personal | Contadores |
