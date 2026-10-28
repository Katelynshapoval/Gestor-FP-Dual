# Autenticación y cuentas

> Código: [`authService.js`](../../../backend/src/services/authService.js), [`personalService.js`](../../../backend/src/services/personalService.js), [`passwordResetService.js`](../../../backend/src/services/passwordResetService.js), [`middleware/auth.js`](../../../backend/src/middleware/auth.js), [`middleware/loginRateLimit.js`](../../../backend/src/middleware/loginRateLimit.js). Frontend: [`Login.js`](../../../frontend/src/pages/Login.js), [`Personal.jsx`](../../../frontend/src/pages/Personal/Personal.jsx), [`UserContext.js`](../../../frontend/src/context/UserContext.js). Pruebas: `backend/test/auth.test.js`, `personal.test.js`, `phase5.test.js`.

## 1. Creación de cuentas

No hay registro de usuarios como tal. Las cuentas nacen así:

| Rol | Cómo se crea | `email` | `must_change_password` |
| --- | --- | --- | --- |
| ALUMNO | Primer envío del formulario público de solicitud (la contraseña la elige el alumno) | NULL | 0 |
| EMPRESA | Alta pública de la empresa (contraseña elegida; ligada al **coordinador principal**) | NULL | 0 |
| ADMINISTRADOR, COORDINADOR | `POST /usuarios/personal` (solo ADMINISTRADOR). En desarrollo también `scripts/seedPruebas.js` | obligatorio (trigger); es el usuario de acceso | 1 (contraseña temporal) |

Una empresa tiene, en la práctica, **un único usuario EMPRESA** (el del coordinador del alta). No hay endpoint para crear más usuarios de empresa.

## 2. Inicio de sesión — `POST /auth/login`

| Aspecto | Comportamiento |
| --- | --- |
| Entrada | `{ username | email, password }`. El campo se recorta. |
| Resolución del identificador (`findUserByIdentifier`) | En este orden: (1) email **exacto** de un usuario ADMINISTRADOR/COORDINADOR (la colación hace la comparación insensible a mayúsculas); (2) CIF normalizado → usuario EMPRESA cuyo contacto pertenece a esa empresa; (3) DNI/NIE normalizado → usuario ALUMNO. Un identificador nunca sirve para otro rol. |
| Limitador | Antes de buscar: si hay ≥ 5 fallos del par IP+identificador o ≥ 30 de la IP en 15 min → **429 `TOO_MANY_ATTEMPTS`** con `Retry-After`. |
| Usuario no encontrado / contraseña incorrecta | 401 «Credenciales incorrectas.» y se cuenta un fallo. |
| Cuenta inactiva | Solo **después** de comprobar la contraseña: 403 «La cuenta está desactivada…». Así no se revela si existe una cuenta desactivada a quien no sabe la contraseña. No cuenta como fallo. |
| Éxito | Borra el contador del identificador (no el de la IP). Devuelve `{ token, user: { id, nombre, email, rol, must_change_password, cif, dni } }`. |
| Token | JWT HS256 con `JWT_SECRET`, caducidad **8 h**. Carga útil: `id, email, nombre, rol, id_contacto, id_alumno`. |

En el frontend, si `must_change_password` es verdadero, el token se guarda solo en memoria y se muestra el cambio de contraseña obligatorio; la sesión se persiste en `localStorage` después del cambio.

## 3. Validación de cada petición — `requireAuth`

1. Cabecera `Authorization: Bearer …` ausente → 401 `AUTH_REQUIRED`.
2. Firma inválida o caducada → 401 `TOKEN_INVALID`.
3. Relee `activo`, `must_change_password` y rol **de la base de datos**:
   - usuario inexistente o inactivo → 401 `ACCOUNT_DISABLED`;
   - rol distinto del del token → 401 `SESSION_STALE`;
   - `must_change_password = 1` → 403 `PASSWORD_CHANGE_REQUIRED`, salvo en `/auth/me` y `/auth/changePassword` (`requireAuthAllowPasswordChange`).
4. `req.user` = carga útil del token con el **rol de BD**.

Efecto: desactivar una cuenta (p. ej. por una baja) o cambiar su rol expulsa al usuario en su siguiente petición, aunque su token siga sin caducar. **Cambiar la contraseña no invalida los tokens ya emitidos** (no hay versión de sesión): siguen siendo válidos hasta su caducidad (salvo tras una contraseña temporal, que deja `must_change_password = 1` y bloquea las sesiones abiertas con 403 `PASSWORD_CHANGE_REQUIRED`). Para expulsar a alguien de inmediato hay que desactivar la cuenta; rotar `JWT_SECRET` expulsa a todos.

## 4. Cambio de contraseña — `POST /auth/changePassword`

- Nueva contraseña ≥ 8 caracteres y distinta de la actual (comparada con bcrypt).
- La contraseña actual es **obligatoria**, salvo si `must_change_password = 1` en BD (cambio forzado tras una contraseña temporal). Si se envía, se comprueba (401 si es incorrecta).
- Guarda el nuevo hash (bcrypt coste 10) y pone `must_change_password = 0`.

## 5. Recuperación de contraseña

### `POST /auth/forgotPassword { username }`
- Limitador propio: 3 peticiones por IP+identificador y 20 por IP en 15 min. **Cada petición cuenta**, exista o no la cuenta.
- Si no hay ninguna cuenta con ese identificador: **404 `CUENTA_NO_ENCONTRADA`** y no se envía nada.
- Si la cuenta existe pero está desactivada: **403 `CUENTA_DESACTIVADA`** y no se envía nada.
- Si está activa pero no hay correo de destino (personal sin email, alumno sin email personal, empresa sin email de coordinador): **400 `SIN_CORREO`**.
- Si está activa y hay correo, se envía un enlace `APP_URL/restablecer-contrasena?token=…`:
  - personal → `dual_usuarios.email`;
  - alumno → `gf_alumnosfct.email` (correo personal);
  - empresa → email del contacto ligado al usuario (coordinador principal).
- Sin `APP_URL` (obligatoria con `NODE_ENV=production`; en desarrollo vale `http://localhost:3000`) responde 500 y no se envía nada.

### `POST /auth/resetPassword { token, newPassword }`
- Token JWT firmado con `JWT_SECRET + ':password-reset'` (no sirve como token de sesión y viceversa), `purpose: 'reset'`, caducidad **30 min**, y `fp` = huella SHA-256 (22 caracteres) del hash actual.
- Se rechaza (400 `ENLACE_NO_VALIDO`) si: firma o caducidad inválidas, propósito incorrecto, usuario inexistente o inactivo, o la huella ya no coincide (la contraseña cambió desde que se emitió).
- `UPDATE … WHERE password_hash = <hash anterior>`: si dos peticiones usan el mismo enlace a la vez, solo una gana. **Cada enlace sirve una vez** y cualquier cambio de contraseña invalida los enlaces anteriores. Pone `must_change_password = 0`.
- No hay tabla de tokens.

## 6. Contraseña temporal — `POST /usuarios/:id/resetPassword` (ADMINISTRADOR)

- Genera 16 caracteres hexadecimales aleatorios, guarda el hash y pone `must_change_password = 1`.
- Devuelve la contraseña **una sola vez** en la respuesta (`newPassword`); no se guarda en claro ni se envía por correo.
- No comprueba el rol ni el estado de la cuenta destino (puede aplicarse a cualquier usuario, incluido otro administrador).
- Si el destino es ADMINISTRADOR o COORDINADOR, el reseteo se audita (`USUARIO` / `RESETEAR_PASSWORD`) en la misma transacción. El de un alumno o una empresa **no** se audita.
- Desde la interfaz se usa en la pestaña «Cuenta» de las tarjetas de alumno y empresa y en la pantalla Personal (`ResetPasswordButton`).

## 7. Personal del centro — solo ADMINISTRADOR

Pantalla **Personal** (`/personal`). Coordinación no ve el menú y las rutas responden 403. No crea alumnos ni empresas, y no borra cuentas.

| Acción | Ruta | Efecto |
| --- | --- | --- |
| Listar | `GET /usuarios/personal` | Solo ADMINISTRADOR y COORDINADOR, activos y de baja. Sin hash |
| Alta | `POST /usuarios/personal` `{ nombre, email, rol }` | 201 `{ usuario, newPassword }`. Email recortado, en minúsculas y único (409 `EMAIL_DUPLICADO`). Rol solo esos dos (400 `ROL_INVALIDO`). `id_contacto` e `id_alumno` quedan NULL. Contraseña temporal de 16 hex y `must_change_password = 1`. Evento `ALTA` |
| Editar | `PATCH /usuarios/personal/:id` `{ nombre?, email?, rol? }` | Cambia nombre, email o rol entre administrador y coordinador. Evento `CAMBIAR_ROL` o `CAMBIAR_DATOS` |
| Baja | `POST /usuarios/personal/:id/baja` | `activo = 0`. La sesión abierta cae en la siguiente petición (`ACCOUNT_DISABLED`). Evento `BAJA` |
| Reactivar | `POST /usuarios/personal/:id/reactivar` | `activo = 1`. Evento `REACTIVAR` |

Protecciones, dentro de una transacción:

- No puedes darte de baja (400 `BAJA_PROPIA`) ni cambiar tu propio rol (400 `ROL_PROPIO`). Sí puedes cambiar tu nombre y tu email.
- No se puede dejar el centro sin ningún administrador activo (400 `ULTIMO_ADMINISTRADOR`), ni por baja ni por cambio de rol. Antes de decidir se bloquean las filas de los administradores activos, en orden de id, para que dos cambios simultáneos no dejen cero.
- Un id que no es personal responde 404 `NOT_FOUND`.
- El evento guarda el id, el rol y `activo`. Puede anotar que el nombre o el email cambiaron, pero no guarda el valor. Nunca la contraseña.
- Sin la migración 019 el `INSERT` del evento incumple el `CHECK` y la operación se deshace (503 `MIGRACION_PENDIENTE`).

## 8. Listado de usuarios — `GET /usuarios` (ADMINISTRADOR)

Devuelve todos los usuarios sin hash, alumnos y empresas incluidos. Ninguna pantalla lo usa: Personal llama a `GET /usuarios/personal`. El comentario del servicio dice «admin/coordinador», pero la ruta exige ADMINISTRADOR.

## 9. Sesión en el navegador

- `localStorage["user"] = { data: {…usuario, token}, expires }`, con `expires` = `exp` del JWT.
- Al cargar, si la sesión ha caducado se borra. Un temporizador cierra la sesión exactamente al caducar.
- Cualquier 401 de una llamada autenticada (excepto login y cambio de contraseña) emite `fpdual:session-expired`; `UserContext` borra la sesión y la página de login muestra el motivo (`ACCOUNT_DISABLED`, `SESSION_STALE` o caducada).
- Iniciar o cerrar sesión en una pestaña se refleja en las demás (evento `storage`).
- `RequireRole` solo redirige: sin sesión → `/login`; con rol no permitido → la página de inicio de su rol.

## 10. Casos límite

- **Limitador en memoria**: los contadores viven en un `Map` del proceso; se pierden al reiniciar y no se comparten entre procesos. La clave usa `req.ip` y Express no tiene `trust proxy`, así que detrás de un proxy inverso todas las peticiones compartirían IP y el límite por IP se alcanzaría entre todos los usuarios 🔶.
- **Formulario público de alumno**: un alumno con cuenta que reenvía la solicitud con contraseña incorrecta cuenta como login fallido (clave IP + DNI); tras 5 fallos, 429. Un acierto borra el contador.
- **Recuperación sin envío**: sin `APP_URL` en producción, o con una cuenta sin email, no se manda enlace pero la respuesta es la genérica de éxito; solo queda un aviso en consola.
- **Emails**: `dual_usuarios.email` es NULL para EMPRESA y ALUMNO. Las notificaciones y la recuperación usan el email del coordinador (`ge_contactos`) o de la ficha del alumno (`gf_alumnosfct`); cambiar el del coordinador cambia también dónde llega la recuperación de la empresa.
