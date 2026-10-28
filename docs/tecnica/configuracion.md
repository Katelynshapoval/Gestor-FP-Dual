# Configuración y variables de entorno

> Parte de la [documentación técnica](README.md). Plantilla: [`backend/.env.example`](../../backend/.env.example). El backend lee `backend/.env` con `dotenv` (en `index.js`, `db/pool.js`, `mail/config.js` y los scripts).

## 1. Backend

| Variable | Obligatoria | Por defecto | Uso |
| --- | --- | --- | --- |
| `DBHOST`, `DBUSER`, `DBPASS`, `DBNAME` | Sí | — (`.env.example` sugiere `localhost` y `proyecto_dual`) | Pool de la aplicación y scripts |
| `PORT` | No | `3001` | Puerto HTTP. El *proxy* del frontend espera 3001 |
| `JWT_SECRET` | **Sí** | — | Firma de sesiones (y, derivada, de los enlaces de recuperación). ≥ 32 caracteres; el servidor no arranca sin él. **Cambiarlo cierra todas las sesiones e invalida los enlaces de recuperación pendientes** |
| `NODE_ENV` | No | — | `production` cambia el modo de correo por defecto a `smtp`, exige `APP_URL` para los enlaces de recuperación y bloquea los scripts que escriben (salvo `--allow-production`) |
| `MAIL_MODE` | No | `smtp` en producción, `log` en otro caso | Ver [correo](api-e-integraciones/correo-electronico.md) |
| `EMAIL_USER`, `EMAIL_PASS` | Con `smtp` | — | Cuenta de Gmail |
| `MAIL_REDIRECT_TO` | No | vacío | Redirige todos los correos (solo `smtp`) |
| `APP_URL` | **Sí en producción** | `http://localhost:3000` fuera de producción (solo para recuperación) | Enlaces del portal en correos. Sin ella en producción no se envían enlaces de recuperación; en las notificaciones se sustituye el enlace por un texto genérico |
| `MYSQL_BIN` | No | `C:/Program Files/MySQL/MySQL Server 8.0/bin` | Ruta de `mysqldump`/`mysql` para `backup.js` y `verifyDb.js` |
| `DB_INTEGRATION`, `KEEP_VERIFY` | No | — | Activan las pruebas contra BD y conservan la BD de verificación |
| `PRUEBA_ESPECIALIDAD` | No | `5` | Especialidad de los datos de prueba |

Constantes en código (no configurables): caducidad del JWT 8 h; enlace de recuperación 30 min; sincronización de convocatorias 15 min; límites de intentos (5/30 en login, 3/20 en recuperación, ventana 15 min); tamaño máximo de PDF y plantillas 10 MB; pool de 10 conexiones; tamaños de página de Seguimiento 10/20/50.

`backend/src/db/config.js` está en `.gitignore` como «unused legacy DB config»; el código actual no lo importa.

## 2. Frontend

- Sin variables de entorno propias. Las llamadas son relativas (`/auth/login`…); en desarrollo, `"proxy": "http://localhost:3001"` en `frontend/package.json`.
- Compilación: `npm run build` genera `frontend/build/` (ignorado por Git). El backend **no** lo sirve: hace falta un servidor web o proxy que publique la SPA, reenvíe las rutas de la API al backend y devuelva `index.html` en las rutas de React (`BrowserRouter`) 🔶.

## 3. Base de datos

- Esquema creado con `npm run db:migrate -- up --yes` sobre una BD vacía (baseline + migraciones).
- Datos de entorno: `dual_especialidades` (obligatorio), `dual_preferencias` (opcional), plantillas activas (para generar), cuentas de personal (pantalla Personal, solo Administración; en desarrollo también `scripts/seedPruebas.js`) y convocatorias.
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

Con `backend/.env` relleno a partir de `.env.example` y la BD creada/migrada. Datos de prueba opcionales: `node scripts/seedPruebas.js --yes`.
