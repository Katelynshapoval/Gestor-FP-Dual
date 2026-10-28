# Configuración y variables de entorno

> Parte de la [documentación técnica](README.md). Plantilla: [`backend/.env.example`](../../backend/.env.example). El backend lee `backend/.env` con `dotenv` (en `index.js`, `db/pool.js`, `mail/config.js` y los scripts).

## 1. Backend

| Variable | Obligatoria | Por defecto | Uso |
| --- | --- | --- | --- |
| `DBHOST`, `DBUSER`, `DBPASS`, `DBNAME` | Sí | — (`.env.example` sugiere `localhost` y `proyecto_dual`) | Pool de la aplicación y scripts. Usar una cuenta con los privilegios mínimos, no `root` |
| `DBSSL`, `DBSSL_CA` | No | `false`, vacío | TLS hacia MySQL (SEC-010); obligatorio si la BD está en otra máquina. `DBSSL_CA` = ruta del certificado de la CA si no es de confianza pública |
| `PORT` | No | `3001` | Puerto HTTP. El *proxy* del frontend espera 3001 |
| `TRUST_PROXY` | No | vacío | Número de proxies inversos delante de la API (p. ej. `1` detrás de nginx); nunca `true`. Los límites por IP usan la IP que resulta |
| `SIGNUP_MAX_PER_IP_HOUR`, `SIGNUP_MAX_PER_DAY` | No | `10`, `300` | Límite de altas públicas (alumno y empresa) por IP y hora, y total al día (SEC-003) |
| `MAX_PLAZAS_POR_CICLO` | No | `20` | Máximo de plazas que una empresa puede ofrecer por ciclo (SEC-002) |
| `JWT_SECRET` | **Sí** | — | Firma de sesiones (y, derivada, de los enlaces de recuperación). ≥ 32 caracteres; el servidor no arranca sin él. **Cambiarlo cierra todas las sesiones e invalida los enlaces de recuperación pendientes** |
| `NODE_ENV` | No | — | `production` cambia el modo de correo por defecto a `smtp`, exige `APP_URL` para los enlaces de recuperación y bloquea los scripts que escriben (salvo `--allow-production`) |
| `MAIL_MODE` | No | `smtp` en producción, `log` en otro caso | Ver [correo](api-e-integraciones/correo-electronico.md) |
| `EMAIL_USER`, `EMAIL_PASS` | Con `smtp` | — | Cuenta de Gmail |
| `MAIL_REDIRECT_TO` | No | vacío | Redirige todos los correos (solo `smtp`) |
| `APP_URL` | **Sí en producción** | `http://localhost:3000` fuera de producción (solo para recuperación) | Enlaces del portal en correos. Sin ella en producción no se envían enlaces de recuperación; en las notificaciones se sustituye el enlace por un texto genérico |
| `MYSQL_BIN` | No | `C:/Program Files/MySQL/MySQL Server 8.0/bin` | Ruta de `mysqldump`/`mysql` para `backup.js` y `verifyDb.js` |
| `DB_INTEGRATION`, `KEEP_VERIFY` | No | — | Activan las pruebas contra BD y conservan la BD de verificación |
| `PRUEBA_ESPECIALIDAD` | No | `5` | Especialidad de los datos de prueba |
| `DEMO_ADMIN_EMAIL`, `DEMO_COORD_EMAIL` | No | `admin.demo@fpdual.test`, `coord.demo@fpdual.test` | Usuarios de personal de `scripts/seedDemo.js` |

Constantes en código (no configurables): caducidad del JWT 8 h (HS256); enlace de recuperación 30 min; sincronización de convocatorias 15 min; límites de intentos (5/30 en login, 3/20 en recuperación, ventana 15 min); tamaño máximo de PDF y plantillas 10 MB; cuerpos JSON y URL-encoded de 100 KB como máximo; pool de 10 conexiones; reintentos por interbloqueo en `inTransaction` 2; tamaños de página de Seguimiento 10/20/50.

`backend/src/db/config.js` está en `.gitignore` como «unused legacy DB config»; el código actual no lo importa.

## 2. Frontend

- Sin variables de entorno propias. Las llamadas son relativas (`/auth/login`…); en desarrollo, `"proxy": "http://localhost:3001"` en `frontend/package.json`.
- Compilación: `npm run build` genera `frontend/build/` (ignorado por Git). El backend **no** lo sirve: hace falta un servidor web o proxy que publique la SPA, reenvíe las rutas de la API al backend y devuelva `index.html` en las rutas de React (`BrowserRouter`) 🔶.

## 3. Base de datos

- Esquema creado con `npm run db:migrate -- up --yes` sobre una BD vacía (baseline + migraciones).
- Datos de entorno: `dual_especialidades` (obligatorio), plantillas activas (para generar), cuentas de personal (pantalla Personal, solo Administración; en desarrollo también `scripts/seedPruebas.js`) y convocatorias.
- Zona horaria del servidor MySQL: determina el cambio de convocatoria activa.

## 4. Puesta en marcha en desarrollo (resumen)

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm start
```

Con `backend/.env` relleno a partir de `.env.example` y la BD creada/migrada. Datos de prueba opcionales: `node scripts/seedPruebas.js --yes` (crea cuentas «PRUEBA»; sus contraseñas aleatorias quedan solo en `backend/.pruebas.local.json`). `node scripts/seedDemo.js --yes` **borra todos los datos** y carga una demostración ficticia (contraseñas en `backend/.demo.local.json`); solo para una BD de desarrollo desechable.
