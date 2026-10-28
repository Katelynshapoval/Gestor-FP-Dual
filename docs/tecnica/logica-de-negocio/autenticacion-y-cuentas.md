# Autenticación y cuentas

> Código: [`authService.js`](../../../backend/src/services/authService.js), [`passwordResetService.js`](../../../backend/src/services/passwordResetService.js), [`middleware/auth.js`](../../../backend/src/middleware/auth.js), [`middleware/loginRateLimit.js`](../../../backend/src/middleware/loginRateLimit.js). Frontend: [`Login.js`](../../../frontend/src/pages/Login.js), [`UserContext.js`](../../../frontend/src/context/UserContext.js). Pruebas: `backend/test/auth.test.js`, `phase5.test.js`.

## 1. Creación de cuentas

No hay registro de usuarios como tal. Las cuentas nacen así:

| Rol | Cómo se crea | `email` | `must_change_password` |
| --- | --- | --- | --- |
| ALUMNO | Primer envío del formulario público de solicitud (la contraseña la elige el alumno) | NULL | 0 |
| EMPRESA | Alta pública de la empresa (contraseña elegida; ligada al **coordinador principal**) | NULL | 0 |
| ADMINISTRADOR, COORDINADOR | **Fuera de la aplicación** (no hay endpoint): inserción manual en BD o `scripts/seedPruebas.js` en desarrollo | obligatorio (trigger) | según se cree |

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
- La respuesta es **siempre la misma** (mensaje genérico), para no revelar qué cuentas existen.
- Solo si la cuenta existe **y está activa** se envía un enlace `APP_URL/restablecer-contrasena?token=…`:
  - personal → `dual_usuarios.email`;
  - alumno → `gf_alumnosfct.email` (correo personal);
  - empresa → email del contacto ligado al usuario (coordinador principal).
- Si no hay email de destino o no hay `APP_URL` (obligatoria con `NODE_ENV=production`; en desarrollo vale `http://localhost:3000`), no se envía nada y se registra un aviso en consola.

### `POST /auth/resetPassword { token, newPassword }`
- Token JWT firmado con `JWT_SECRET + ':password-reset'` (no sirve como token de sesión y viceversa), `purpose: 'reset'`, caducidad **30 min**, y `fp` = huella SHA-256 (22 caracteres) del hash actual.
- Se rechaza (400 `ENLACE_NO_VALIDO`) si: firma o caducidad inválidas, propósito incorrecto, usuario inexistente o inactivo, o la huella ya no coincide (la contraseña cambió desde que se emitió).
- `UPDATE … WHERE password_hash = <hash anterior>`: si dos peticiones usan el mismo enlace a la vez, solo una gana. **Cada enlace sirve una vez** y cualquier cambio de contraseña invalida los enlaces anteriores. Pone `must_change_password = 0`.
- No hay tabla de tokens.

## 6. Contraseña temporal — `POST /usuarios/:id/resetPassword` (ADMINISTRADOR)

- Genera 16 caracteres hexadecimales aleatorios, guarda el hash y pone `must_change_password = 1`.
- Devuelve la contraseña **una sola vez** en la respuesta (`newPassword`); no se guarda en claro ni se envía por correo.
- No comprueba el rol ni el estado de la cuenta destino (puede aplicarse a cualquier usuario, incluido otro administrador) y **no se audita**.
- Desde la interfaz se usa en la pestaña «Cuenta» de las tarjetas de alumno y empresa (`ResetPasswordButton`).

## 7. Listado de usuarios — `GET /usuarios` (ADMINISTRADOR)

Devuelve todos los usuarios sin hash. Ninguna pantalla lo usa. El comentario del servicio dice «admin/coordinador», pero la ruta exige ADMINISTRADOR.

## 8. Sesión en el navegador

- `localStorage["user"] = { data: {…usuario, token}, expires }`, con `expires` = `exp` del JWT.
- Al cargar, si la sesión ha caducado se borra. Un temporizador cierra la sesión exactamente al caducar.
- Cualquier 401 de una llamada autenticada (excepto login y cambio de contraseña) emite `fpdual:session-expired`; `UserContext` borra la sesión y la página de login muestra el motivo (`ACCOUNT_DISABLED`, `SESSION_STALE` o caducada).
- Iniciar o cerrar sesión en una pestaña se refleja en las demás (evento `storage`).
- `RequireRole` solo redirige: sin sesión → `/login`; con rol no permitido → la página de inicio de su rol.

## 9. Casos límite

- **Limitador en memoria**: los contadores viven en un `Map` del proceso; se pierden al reiniciar y no se comparten entre procesos. La clave usa `req.ip` y Express no tiene `trust proxy`, así que detrás de un proxy inverso todas las peticiones compartirían IP y el límite por IP se alcanzaría entre todos los usuarios 🔶.
- **Formulario público de alumno**: un alumno con cuenta que reenvía la solicitud con contraseña incorrecta cuenta como login fallido (clave IP + DNI); tras 5 fallos, 429. Un acierto borra el contador.
- **Recuperación sin envío**: sin `APP_URL` en producción, o con una cuenta sin email, no se manda enlace pero la respuesta es la genérica de éxito; solo queda un aviso en consola.
- **Emails**: `dual_usuarios.email` es NULL para EMPRESA y ALUMNO. Las notificaciones y la recuperación usan el email del coordinador (`ge_contactos`) o de la ficha del alumno (`gf_alumnosfct`); cambiar el del coordinador cambia también dónde llega la recuperación de la empresa.
