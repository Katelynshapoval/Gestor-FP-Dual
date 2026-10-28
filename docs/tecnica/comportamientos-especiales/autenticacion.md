# Comportamientos especiales: autenticación y cuentas

> Volver al [índice de comportamientos especiales](README.md). Flujo normal en [autenticación y cuentas](../logica-de-negocio/autenticacion-y-cuentas.md).

### Orden de resolución del identificador de login
- **Contexto**: `POST /auth/login`, `POST /auth/forgotPassword`.
- **Condición**: cualquier inicio de sesión.
- **Comportamiento**: `findUserByIdentifier` prueba email de personal (exacto), luego CIF normalizado (solo usuarios EMPRESA), luego DNI normalizado (solo ALUMNO). Gana la primera coincidencia.
- **Motivo**: «Identifiers are never interchangeable across roles» (comentario en `authService.js`).
- **Consecuencias**: un alumno no puede entrar con su email ni una empresa con el email del coordinador. Un usuario de personal no puede entrar con DNI.
- **Referencia**: [`authService.findUserByIdentifier`](../../../backend/src/services/authService.js).

### Cuenta desactivada con contraseña correcta
- **Contexto**: login.
- **Condición**: `activo = 0` (p. ej. tras una baja).
- **Comportamiento**: con contraseña incorrecta → 401 «Credenciales incorrectas» (como si no existiera); con contraseña correcta → 403 «La cuenta está desactivada…». El 403 no suma al limitador.
- **Motivo**: no revelar a terceros si existe una cuenta desactivada (comentario en el código).
- **Referencia**: `authService.loginWithCredentials`; prueba `auth.test.js`.

### El cambio de contraseña no cierra otras sesiones
- **Contexto**: `changePassword`, `resetPassword`, contraseña temporal del administrador.
- **Condición**: un usuario tiene una sesión abierta en otro navegador y cambia (o le cambian) la contraseña.
- **Comportamiento**: `requireAuth` solo comprueba firma, caducidad, `activo`, rol y `must_change_password`; **no** hay versión de sesión ligada al hash. Los tokens emitidos siguen siendo válidos hasta 8 h. Excepción: tras `POST /usuarios/:id/resetPassword` el usuario tiene `must_change_password = 1`, así que sus sesiones abiertas reciben 403 `PASSWORD_CHANGE_REQUIRED` en casi todas las rutas.
- **Motivo**: no documentado.
- **Consecuencias**: un token robado sobrevive al cambio de contraseña. Para expulsar a alguien de inmediato hay que desactivar la cuenta (o rotar `JWT_SECRET`, que expulsa a todos).
- **Referencia**: [`middleware/auth.js`](../../../backend/src/middleware/auth.js).

### Cambio de rol o desactivación con la sesión abierta
- **Comportamiento**: en la siguiente petición, 401 `SESSION_STALE` (rol distinto) o `ACCOUNT_DISABLED`; el frontend cierra la sesión y muestra el aviso correspondiente.
- **Referencia**: `requireAuth`, [`UserContext.js`](../../../frontend/src/context/UserContext.js); prueba `auth.test.js` (SEC-8).

### Limitador en memoria y despliegue tras un proxy
- **Contexto**: login, formulario público de alumno, recuperación de contraseña.
- **Condición**: reinicio del servidor, varios procesos, o servidor detrás de un proxy inverso.
- **Comportamiento**: los contadores viven en un `Map` del proceso: se pierden al reiniciar y no se comparten entre procesos. La clave usa `req.ip`; Express **no** tiene configurado `trust proxy`, por lo que detrás de un proxy todas las peticiones tendrían la IP del proxy 🔶 y el límite por IP (30 fallos/15 min en login, 20 peticiones en recuperación) se alcanzaría entre todos los usuarios.
- **Motivo**: «acceptable for the single-server setup» (comentario en `loginRateLimit.js`).
- **Referencia**: [`loginRateLimit.js`](../../../backend/src/middleware/loginRateLimit.js), [`index.js`](../../../backend/src/index.js).

### El formulario público de alumno comparte el limitador de login
- **Condición**: un alumno con cuenta vuelve a presentar la solicitud con una contraseña incorrecta.
- **Comportamiento**: cada fallo cuenta con la clave `IP + DNI`, igual que un login fallido; tras 5 → 429. Un acierto borra el contador del DNI.
- **Motivo**: SEC-3: el formulario público no debe permitir adivinar la contraseña ni sobrescribir datos ajenos.
- **Referencia**: `solicitudesAlumnoService.create`; prueba `authorization.test.js`.

### Recuperación de contraseña: cada petición cuenta y la respuesta nunca cambia
- **Comportamiento**: `limiter.recordFailure` se llama en **todas** las peticiones (no solo en las fallidas): con 3 peticiones del mismo identificador desde la misma IP en 15 min, la cuarta da 429. La respuesta exitosa es idéntica exista o no la cuenta, esté activa o no.
- **Referencia**: [`passwordResetService.solicitar`](../../../backend/src/services/passwordResetService.js); prueba `phase5.test.js`.

### Recuperación sin `APP_URL` o sin email de destino
- **Condición**: `NODE_ENV=production` sin `APP_URL`, o cuenta sin email (p. ej. contacto de empresa sin email).
- **Comportamiento**: no se envía enlace; el usuario recibe la respuesta genérica de éxito y en consola queda «[recuperar contraseña] sin correo de destino o sin APP_URL…». En desarrollo, sin `APP_URL`, el enlace apunta a `http://localhost:3000`.
- **Consecuencias**: el usuario cree que se ha enviado. Hay que vigilar el registro.

### Enlace de recuperación usado dos veces o tras otro cambio
- **Comportamiento**: la huella del hash deja de coincidir → 400 `ENLACE_NO_VALIDO`. Dos usos simultáneos: solo uno actualiza (`WHERE password_hash = <anterior>`); el otro recibe 400.
- **Referencia**: `passwordResetService.restablecer`; prueba «reset link: works once…».

### Contraseña temporal del administrador
- **Comportamiento**: puede generarse para **cualquier** usuario (incluido otro administrador o él mismo), sin auditoría; se devuelve una vez en la respuesta.
- **Consecuencias**: el administrador debe transmitirla por un canal propio; no queda constancia en `dual_eventos`.
- **Referencia**: `authService.resetPassword`.

### Empresas y alumnos sin email de usuario
- **Comportamiento**: `dual_usuarios.email` es NULL para EMPRESA y ALUMNO (el login es CIF o DNI). Las notificaciones y la recuperación usan `ge_contactos.email` del coordinador o `gf_alumnosfct.email`.
- **Consecuencias**: cambiar el email del coordinador (edición de datos) cambia también a dónde llega la recuperación de contraseña de la empresa.
