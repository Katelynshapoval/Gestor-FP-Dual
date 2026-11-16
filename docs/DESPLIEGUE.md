# Despliegue con Docker

Todo se ejecuta con `docker-compose.yml`, en la raíz del repositorio, y se maneja con un único script: `./deploy/fpdual.sh`.

| Servicio | Imagen | Para qué |
| --- | --- | --- |
| `caddy` | `caddy:2.8-alpine` | Única entrada (puertos 80/443). Sirve HTTPS con su propio certificado (intranet) o con Let's Encrypt (dominio público). |
| `web` | `frontend/Dockerfile` | nginx con la compilación de React. Las páginas reciben `index.html` y el resto de peticiones van a la API (la API no tiene prefijo `/api`). Configuración: `deploy/nginx.conf`. |
| `backend` | `backend/Dockerfile` | API en Node 24, con Chromium para generar los PDF. Incluye `db/` (migraciones), `docs/` (manual de `/ayuda`), los scripts y las plantillas de partida. Se ejecuta como usuario `node`. |
| `db` | `mysql:8.4` | Base de datos, en el volumen `db-data`. No se publica fuera del servidor. |
| `mailpit` | `axllent/mailpit` | Opcional. Recoge todos los correos en una bandeja web (puerto 8025). Ninguno llega a buzones reales. |

## Requisitos del servidor

- Linux con Docker Engine y el plugin Compose (`docker compose version`).
- Un usuario sin privilegios de administración que pertenezca al grupo `docker` (si no, cada orden de Docker pide `sudo`).
- 2 GB de RAM o más (MySQL y Chromium mientras genera un PDF).
- Para un nombre de intranet (`fpdual.centro.local`): nada más. Para un dominio público: un registro DNS que apunte al servidor y los puertos 80 y 443 abiertos.

## Instalación (la primera vez)

```bash
ssh usuario@servidor
git clone <URL_DEL_REPO> ~/fpdual
cd ~/fpdual
git checkout v1.0.0            # la versión que se despliega
cp .env.example .env
chmod 600 .env
nano .env
```

En `.env` hay que rellenar como mínimo:

| Variable | Valor |
| --- | --- |
| `SITE_ADDRESS` | El nombre con el que se abre la aplicación, p. ej. `fpdual.centro.local`. |
| `APP_URL` | El mismo con `https://` delante. Se usa en los enlaces de los correos. |
| `CADDY_TLS` | `internal` en una intranet (certificado propio de Caddy). Un correo electrónico para usar Let's Encrypt con un dominio público. |
| `DBADMIN_PASS`, `DBPASS`, `DB_ROOT_PASSWORD` | Tres contraseñas largas distintas: `openssl rand -base64 33`. `DBADMIN_USER` (por defecto `fpdual_admin`) es la cuenta dueña del esquema, con la que se aplican las migraciones; `DBUSER` (por defecto `fpdual_app`) es la de la API, que `instalar` y `migrar` crean con solo los permisos que usa. |
| `JWT_SECRET` | 32 caracteres o más: `openssl rand -base64 48`. |
| `MAIL_MODE` | `mailpit` para la demo (con `COMPOSE_PROFILES=mailpit`), `smtp` para enviar de verdad, `log` para no enviar nada. |

`NODE_ENV=production` ya lo fija `docker-compose.yml`. Después:

```bash
./deploy/fpdual.sh instalar                              # imágenes, MySQL, migraciones, todo arriba
./deploy/fpdual.sh admin tu@correo.es "Tu nombre"         # primera cuenta de Administración
```

`instalar` construye las imágenes, arranca MySQL, crea el esquema completo (`db/000_baseline.sql` y todas las migraciones) y arranca el resto. Termina cuando todos los servicios están en marcha y sanos.

`admin` muestra **una sola vez** una contraseña temporal: al entrar por primera vez la aplicación obliga a cambiarla. Con `admin-restablecer <email>` se genera otra si se pierde.

Las plantillas `.docx` del convenio y los anexos II y III no van en el repositorio: súbelas desde *Documentos › Plantillas* con la cuenta de Administración. Sin ellas no se pueden generar esos documentos.

Los ciclos (`dual_especialidades`) y la convocatoria se crean después desde la aplicación, o los crea `demo` (abajo).

### Datos de demostración

```bash
./deploy/fpdual.sh demo --conservar-personal
```

**Borra todos los datos** (solicitudes, empresas, alumnos, reservas, documentos y cuentas) y carga ciclos, 12 empresas, 36 alumnos y reservas en varios estados, todo ficticio. Pide escribir `BORRAR` para confirmar. Con `--conservar-personal` se mantienen las cuentas de Administración y Coordinación ya creadas. Si no hay convocatoria activa, crea la del curso actual (1 de septiembre – 31 de agosto).

Al terminar muestra en pantalla todos los usuarios y contraseñas: el personal entra con su correo, las empresas con el CIF y los alumnos con el DNI/NIE. No se guardan en ningún sitio: apúntalos.

### Correo para la demo: Mailpit

Con `MAIL_MODE=mailpit` y `COMPOSE_PROFILES=mailpit` en `.env`, cada correo que envía la aplicación aparece en la bandeja de Mailpit:

```
http://<servidor>:8025
```

No hace falta ninguna cuenta de correo real y nada sale del servidor. Esa bandeja no tiene contraseña: si se quiere protegerla, añade `MAILPIT_UI_AUTH=usuario:contraseña` en `.env`. Desde *Correos* en la aplicación se puede enviar un correo de prueba de cada plantilla.

Para enviar correo real: `MAIL_MODE=smtp` y `COMPOSE_PROFILES=` vacío. Por defecto se usa Gmail con `EMAIL_USER` y `EMAIL_PASS` (una contraseña de aplicación). Para otro servidor de correo, rellena `SMTP_HOST`, `SMTP_PORT` y, si usa el puerto 465, `SMTP_SECURE=true`. Con `MAIL_REDIRECT_TO` todos los correos van a una sola dirección, para un ensayo.

Cualquier cambio en `.env` se aplica con `docker compose up -d`.

### HTTPS en una intranet

Con `CADDY_TLS=internal`, Caddy firma el certificado con una autoridad propia. Los navegadores avisan («la conexión no es privada») y basta con aceptar el aviso. Para que no aparezca:

```bash
./deploy/fpdual.sh certificado        # crea ./fpdual-ca.crt
```

Instala ese archivo en cada equipo como entidad de certificación raíz de confianza (Windows: doble clic › *Instalar certificado* › *Equipo local* › *Entidades de certificación raíz de confianza*).

Si la red no tiene un DNS interno que resuelva `SITE_ADDRESS`, cada equipo que vaya a abrir la aplicación añade una línea a su archivo `hosts` (`C:\Windows\System32\drivers\etc\hosts` en Windows, `/etc/hosts` en Linux y macOS):

```
192.168.1.50   fpdual.centro.local
```

## Comprobar que funciona

```bash
./deploy/fpdual.sh estado      # contenedores (todos running / healthy) y migraciones
./deploy/fpdual.sh logs        # registro de todos los servicios (Ctrl+C para salir)
./deploy/fpdual.sh logs backend
```

Desde otro equipo de la red:

1. Abrir `https://<SITE_ADDRESS>` y aceptar el aviso del certificado.
2. Entrar con la cuenta de Administración (o con las de la demo).
3. Presentar una solicitud de alumno desde la página de inicio y validarla.
4. Generar un convenio o un anexo (comprueba Chromium y las plantillas).
5. Ver los correos en `http://<servidor>:8025` (Mailpit).

## Ensayo de reinicio

```bash
./deploy/fpdual.sh reiniciar
```

Para y vuelve a arrancar los contenedores; los datos siguen en los volúmenes. **Nunca** `docker compose down -v`: `-v` borra los volúmenes, es decir, la base de datos.

## Copias de seguridad

```bash
./deploy/fpdual.sh copia                                   # backups/fpdual_AAAAMMDD_HHMMSS.sql.gz
./deploy/fpdual.sh restaurar backups/fpdual_....sql.gz     # SUSTITUYE los datos actuales
```

`copia` hace un volcado completo (estructura, datos, procedimientos, disparadores) y comprueba que ha terminado bien. Contiene datos personales: guárdala fuera del servidor. Con `BACKUP_DIR=/ruta` se guarda en otra carpeta. Haz una antes de la demo y antes de cada actualización.

### Traer la base de datos de desarrollo

En el equipo de desarrollo, `npm run db:backup` (en `backend/`) y `npm run db:backup -- verify <fichero>`. Copia el `.sql` al servidor **fuera del repositorio** y:

```bash
./deploy/fpdual.sh restaurar /ruta/proyecto_dual_AAAAMMDD_HHMMSS.sql
./deploy/fpdual.sh migrar
```

Revisa antes las cuentas que lleva: una cuenta de desarrollo con una contraseña fácil sería una puerta abierta en el servidor. Si el volcado tiene cláusulas `DEFINER=` de un usuario que no existe en el servidor, las vistas y procedimientos fallan: sustitúyelo por la cuenta dueña (`DBADMIN_USER`) antes de importarlo. Borra la copia del servidor al terminar.

## Actualizar a una versión nueva

```bash
./deploy/fpdual.sh copia
git fetch --tags
git checkout v1.1.0
docker compose build
./deploy/fpdual.sh migrar         # aplica las migraciones pendientes y reinicia la API
docker compose up -d
```

Lee antes `db/README.md` («Order of deployment»): alguna migración debe aplicarse antes de arrancar el backend nuevo.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `instalar` dice que faltan valores | Rellena en `.env` las variables que indica. `JWT_SECRET` necesita 32 caracteres o más. |
| `permission denied ... docker.sock` | El usuario no está en el grupo `docker`. Lo añade Informática (`usermod -aG docker <usuario>`) y hay que volver a entrar por SSH. |
| Un contenedor se reinicia en bucle | `./deploy/fpdual.sh logs <servicio>` dice por qué. En `backend`, casi siempre es `.env` (contraseña de MySQL o `JWT_SECRET`). |
| El navegador no encuentra `SITE_ADDRESS` | Falta la línea en el archivo `hosts` del equipo, o el DNS interno. |
| Aviso de certificado | Normal con `CADDY_TLS=internal`: acéptalo o instala `./deploy/fpdual.sh certificado`. |
| Los puertos 80/443 están ocupados | `HTTP_PORT` y `HTTPS_PORT` en `.env`; `APP_URL` debe llevar el puerto (`https://fpdual.centro.local:8443`). Con otro puerto HTTPS, la redirección automática desde `http://` lleva al 443: abre directamente la dirección `https://` con su puerto. |
| No llegan los correos | Con `mailpit`: mira `http://<servidor>:8025` y comprueba `COMPOSE_PROFILES=mailpit`. Con `smtp`: `./deploy/fpdual.sh logs backend` muestra el error (Gmail necesita una contraseña de aplicación; muchas redes bloquean la salida SMTP). |
| «No hay plantilla activa» al generar un convenio | Súbela en *Documentos › Plantillas*. |
| Contraseña de Administración perdida | `./deploy/fpdual.sh admin-restablecer <email>`. |
| El PDF no se genera | `./deploy/fpdual.sh logs backend`: Chromium necesita RAM libre (2 GB o más en el servidor). |

Plan B para una presentación: ten preparada una captura o un vídeo corto del recorrido principal por si falla la red el día de la demo.

## Notas

- **Secretos**: solo en `.env` del servidor, nunca en las imágenes (`.dockerignore` deja fuera `.env`, `backups/` y los datos de prueba).
- **IP del cliente**: Caddy → nginx → API. nginx toma la dirección del cliente de Caddy y la API confía exactamente en un proxy (`TRUST_PROXY=1`), así que los límites de inicio de sesión y de alta ven al cliente real.
- **Sandbox de Chromium**: dentro de un contenedor no funciona sin privilegios extra, así que `PUPPETEER_NO_SANDBOX=true`. La página del PDF se genera con JavaScript desactivado y todas las peticiones de red bloqueadas (SEC-004).
- **Otro proxy delante** (otro nginx, Traefik…): quita el servicio `caddy`, publica `web` en un puerto local (`ports: ["127.0.0.1:8080:80"]`) y apunta tu proxy a él. Debe sobrescribir `X-Forwarded-For` con la dirección del cliente y enviar `X-Forwarded-Proto: https`.
- **Zona horaria**: los contenedores usan `Europe/Madrid`, de la que depende la comprobación diaria de la convocatoria.

## En desarrollo

Los mismos scripts funcionan en el equipo de desarrollo con `npm`, desde `backend/`:

| Orden | Para qué |
| --- | --- |
| `npm run mailpit` | Arranca Mailpit (bandeja en http://localhost:8025). Con `MAIL_MODE=mailpit` en `backend/.env`, todos los correos van ahí. |
| `npm run db:admin -- --email tu@correo.es --nombre "Tu nombre" --yes` | Crea una cuenta de Administración. |
| `npm run db:demo -- --yes` | Borra los datos y carga la demo (contraseñas en `backend/.demo.local.json`; con `--mostrar`, en pantalla). |
