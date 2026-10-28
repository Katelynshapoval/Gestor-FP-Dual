# API e integraciones

> Parte de la [documentación técnica](../README.md). Documentos: [referencia de endpoints](referencia-endpoints.md) · [correo electrónico](correo-electronico.md).

## 1. Convenciones de la API

- **Base**: la API se sirve en la raíz del servidor Node (sin prefijo `/api`). En desarrollo el frontend llama a rutas relativas y el *proxy* de CRA las reenvía a `http://localhost:3001`.
- **Formato**: JSON (`express.json`, cuerpos de 100 KB como máximo), salvo subidas `multipart/form-data` (`multer` en memoria, 10 MB por fichero) y descargas binarias (PDF/DOCX, siempre como `attachment`).
- **Cabeceras de seguridad** en todas las respuestas: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP restrictiva y HSTS cuando la petición llega por HTTPS; sin `X-Powered-By` (SEC-007).
- **Autenticación**: `Authorization: Bearer <JWT>`. Ver [seguridad y permisos](../seguridad-y-permisos.md).
- **Identificadores** en la URL: enteros; `parseInt` inválido suele dar 400 «… no válido/a».
- **Fechas**: columnas `DATE` como `'AAAA-MM-DD'`; `DATETIME` como ISO 8601 UTC.
- **Booleanos de BD** (`activa`, `activo`, `tiene_archivo`…) llegan como `0/1` salvo donde el servicio los convierte (`convocatoria_activa`, `transportes_conocidos`).
- **Nombres de campo heterogéneos**: algunas respuestas mezclan `snake_case` y `camelCase` y alias para compatibilidad del frontend (p. ej. `razonSocial`/`empresa`, `idAuxEmpresa`, `fechaPeticion` en `/solicitudes/empresa/todas`).

## 2. Formato de error

```json
{ "error": "Mensaje legible en español.", "code": "CODIGO_ESTABLE" }
```

`code` falta en algunos errores antiguos y en el manejador global. Algunos errores añaden datos (`requires_confirm`, `requires_selection`, `conflictos`, `pendientes`…). El frontend (`utils/api.js`) usa `status` y `code`, nunca el texto; si no hay `code` asigna uno genérico por estado (`VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_ATTEMPTS`, `SERVER`, `NETWORK`).

### Códigos HTTP usados

| Estado | Uso |
| --- | --- |
| 200 / 201 | Éxito (201 en creaciones) |
| 400 | Validación, regla de negocio (incluidos los `SIGNAL 45000` de BD), `CHECK` |
| 401 | Sin token, token inválido, cuenta desactivada, sesión obsoleta (rol o contraseña cambiados), credenciales incorrectas, contraseña actual incorrecta, `IDENTIDAD_NO_VERIFICADA` |
| 403 | Rol no permitido, recurso de otra empresa/alumno, cambio de contraseña obligatorio, cuenta desactivada al hacer login, `REQUIERE_CENTRO` (empresa validada que intenta ampliar) |
| 404 | No existe (o no hay convocatoria activa en `/convocatorias/activa`) |
| 409 | Duplicados, concurrencia, conflictos de datos, selección requerida, ya validado/de baja, sin plantilla, convocatoria cerrada en altas, `RESERVAS_ACTIVAS` |
| 429 | Limitador de login, de recuperación o de altas públicas (`Retry-After`) |
| 500 | Error no previsto (`INTERNAL` o sin código); procedimiento de reservas llamado sin transacción (`SQLSTATE 45001`) |
| 503 | Baja sin la migración 016 |

### Mapeo de errores SQL

[`dbHelpers.mapSqlError`](../../../backend/src/helpers/dbHelpers.js):

| Error de MySQL | HTTP | `code` | Mensaje |
| --- | --- | --- | --- |
| `SQLSTATE 45000` (procedimientos y triggers) | 400 | `REGLA_NEGOCIO` | El texto del `SIGNAL` |
| `ER_DUP_ENTRY` en `uq_dd_actual` | 409 | `DOCUMENTO_CONCURRENTE` | «Este documento se acaba de guardar desde otra sesión…» |
| Otro `ER_DUP_ENTRY` | 409 | `DUPLICADO` | «Ya existe un registro con esos datos.» |
| `ER_LOCK_DEADLOCK`, `ER_LOCK_WAIT_TIMEOUT` | 409 | `CONCURRENCIA` | «Otra operación estaba modificando los mismos datos…» |
| `ER_CHECK_CONSTRAINT_VIOLATED` | 400 | `RESTRICCION` | Texto de MySQL |
| Cualquier otro | 500 | `INTERNAL` | «Error interno del servidor.» (y `console.error`) |

Varios servicios capturan antes casos concretos (p. ej. CIF duplicado en el alta → 409 con mensaje propio; `ER_DUP_ENTRY` al confirmar → 409 «El alumno ya tiene otra reserva confirmada.»).

### Códigos de negocio más frecuentes

| `code` | Origen |
| --- | --- |
| `AUTH_REQUIRED`, `TOKEN_INVALID`, `ACCOUNT_DISABLED`, `SESSION_STALE`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `TOO_MANY_ATTEMPTS` | Autenticación |
| `ENLACE_NO_VALIDO` | Recuperación de contraseña |
| `CUENTA_EXISTENTE` | Alta de alumno con cuenta y contraseña incorrecta |
| `CIF_INVALIDO`, `DNI_INVALIDO`, `PASSWORD_CORTA` | Alta de empresa |
| `SIN_CONVOCATORIA`, `SOLICITUD_EXISTENTE`, `SIN_SOLICITUD` | Reaplicación / consulta de solicitud propia |
| `ESTADO_NO_PERMITE`, `CONVOCATORIA_CERRADA`, `NO_ENCONTRADA`, `ACCION_DESCONOCIDA` | Transiciones de solicitud |
| `YA_DE_BAJA`, `MOTIVO_OBLIGATORIO`, `MIGRACION_PENDIENTE` | Baja |
| `NO_ENCONTRADO`, `TIPO_NO_VALIDABLE`, `SIN_REVISION`, `VERSION_ANTERIOR`, `SIN_ARCHIVO`, `RESERVA_CANCELADA`, `YA_VALIDADO`, `RECHAZADO`, `YA_RECHAZADO`, `FIRMAS_PENDIENTES`, `SIN_FIRMA`, `ROL_NO_FIRMA`, `SIN_PLANTILLA` | Documentos |
| `RESERVA_CONFIRMADA`, `ANEXO_EXISTENTE`, `NO_PENDIENTE`, `SIN_TIPO_CONTRATO`, `TIPO_DISTINTO`, `ANEXO_FALTA`, `ANEXO_SIN_VALIDAR`, `NOT_FOUND`, `VALIDATION` | Reservas |
| `COORDINADOR_PRINCIPAL` | Tutores |

## 3. Integraciones externas

| Integración | Uso | Configuración | Reintentos / timeouts | Si falla |
| --- | --- | --- | --- | --- |
| **MySQL 8** | Persistencia | `DBHOST`, `DBUSER`, `DBPASS`, `DBNAME`, `DBSSL`, `DBSSL_CA` | Pool sin reintentos de conexión; `inTransaction` repite la operación tras un interbloqueo (máx. 2); espera de bloqueo de InnoDB (50 s en desarrollo); `queueLimit: 0` (cola ilimitada de peticiones de conexión) | Errores mapeados (§ 2); con la BD caída, 500 |
| **Gmail SMTP** (`nodemailer`, `service: 'gmail'`) | Notificaciones, confirmaciones, convenio adjunto, recuperación | `MAIL_MODE`, `EMAIL_USER`, `EMAIL_PASS`, `MAIL_REDIRECT_TO`, `APP_URL` | Ninguno | Se registra y se pierde ([correo](correo-electronico.md)) |
| **Chromium** (`puppeteer`) | DOCX→HTML→PDF | Navegador descargado por `puppeteer`; sin JavaScript y sin red (solo `data:`) | Ninguno; `waitUntil: 'load'` sin timeout propio | Error en la petición de generación; consola en el alta de empresa |
| **`docx-templates` / `mammoth`** | Relleno de plantillas y conversión | Plantilla activa en BD | — | Ídem |

No hay integraciones con servicios externos del centro (secretaría, Gobierno de Aragón u otros): los documentos oficiales (Anexo DGA, Anexo XIV…) se intercambian como PDF subidos por los usuarios 🔶. `google-auth-library` se quitó del backend (SEC-005); `@react-oauth/google` sigue instalado en el frontend pero **no se usa**.
