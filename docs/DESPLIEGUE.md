# Despliegue

Esta guía explica, paso a paso, cómo poner el portal FP Dual en un servidor, cómo enseñarlo con datos de prueba, cómo pasarlo a uso real y cómo mantenerlo. Todo se hace con un solo script, `./deploy/fpdual.sh`, desde la carpeta del proyecto en el servidor. No hace falta instalar Node ni MySQL: todo corre dentro de contenedores Docker.

**Cómo leer los bloques de órdenes**: cada línea se copia y se pega en la terminal del servidor, una detrás de otra. Lo que va después de `#` es una explicación y no hace falta copiarlo.

## Índice

1. [Antes de empezar](#1-antes-de-empezar)
2. [Qué se instala](#2-qué-se-instala)
3. [Chuleta: las órdenes del script](#3-chuleta-las-órdenes-del-script)
4. [Primera instalación, paso a paso](#4-primera-instalación-paso-a-paso)
5. [Situaciones habituales](#5-situaciones-habituales)
6. [Problemas frecuentes](#6-problemas-frecuentes)
7. [Notas técnicas](#7-notas-técnicas)
8. [En el equipo de desarrollo](#8-en-el-equipo-de-desarrollo)

---

## 1. Antes de empezar

Reúne esto antes de tocar el servidor:

| Qué | Para qué | Quién lo da |
| --- | --- | --- |
| Un servidor Linux con Docker y el plugin Compose, y 2 GB de RAM o más | Donde corre todo. Se comprueba con `docker compose version` | Informática del centro |
| Un usuario del servidor que pertenezca al grupo `docker` | Para ejecutar el script sin `sudo` | Informática (`usermod -aG docker <usuario>`) |
| La dirección de la aplicación | Un nombre de la red del centro (p. ej. `fpdual.centro.local`) o un dominio público (p. ej. `dual.salesianoszaragoza.com`) | Informática |
| Para un dominio público: el DNS apuntando al servidor y los puertos 80 y 443 abiertos desde Internet | Para que el certificado HTTPS se emita solo | Informática |
| Una cuenta de correo para enviar avisos (para el uso real) | Los correos a alumnos, empresas y personal. Gmail necesita una «contraseña de aplicación» | El centro |
| Las plantillas `.docx` del convenio, el Anexo II y el Anexo III | Para generar esos documentos. No están en el repositorio | El centro |
| La imagen de la firma y el sello del centro | Se estampa en los documentos que firma el centro | El centro |
| La versión que se va a desplegar (una etiqueta de git, p. ej. `v1.0.0`) | Para instalar siempre una versión conocida | Quien mantiene el código |

> **Base de datos propia o compartida.** Esta instalación crea **su propia base de datos** dentro de Docker. Las tablas de empresas y alumnos (`ge_empresas`, `ge_domicilios`, `ge_contactos`, `gf_alumnosfct`) también las usan otras aplicaciones del centro, pero en esta instalación son una copia aparte: las otras aplicaciones no ven estos datos ni este portal ve los suyos. Si el centro quiere que el portal trabaje sobre la base de datos que ya usan esas aplicaciones, es otra forma de instalarlo y hay que decidirla con Informática **antes** de empezar.

---

## 2. Qué se instala

| Servicio | Qué es | Para qué |
| --- | --- | --- |
| `caddy` | La puerta de entrada (puertos 80 y 443) | Sirve la web por HTTPS: con su propio certificado en una intranet, o con uno de Let's Encrypt en un dominio público |
| `web` | nginx con la web compilada | Entrega las páginas y pasa el resto de peticiones a la API (configuración en `deploy/nginx.conf`) |
| `backend` | La API (Node 24) con Chromium | La lógica de la aplicación y la generación de PDF. Incluye las migraciones (`db/`) y el manual de ayuda (`docs/`) |
| `db` | MySQL 8.4 | La base de datos, guardada en el volumen `db-data`. No es accesible desde fuera del servidor |
| `mailpit` | Bandeja de correo de pruebas (opcional) | Recoge todos los correos en una web (puerto 8025). Ninguno llega a buzones reales |

Los datos viven en **volúmenes** de Docker: sobreviven a reinicios y actualizaciones. Solo se pierden si se borran a propósito (ver [5.2](#52-pasar-de-la-demo-al-uso-real) y [5.12](#512-desinstalar-por-completo)).

La base de datos tiene tres cuentas:

| Cuenta | Variable | Para qué |
| --- | --- | --- |
| Dueña del esquema | `DBADMIN_USER` / `DBADMIN_PASS` | Migraciones y datos de demostración |
| La de la aplicación | `DBUSER` / `DBPASS` | La usa la API. Solo puede leer, añadir y modificar datos (y borrar en tres tablas). No puede cambiar la estructura ni la auditoría. El script la crea solo |
| `root` | `DB_ROOT_PASSWORD` | Crear la cuenta de la aplicación y hacer o restaurar copias |

---

## 3. Chuleta: las órdenes del script

Todas se ejecutan desde la carpeta del proyecto (`cd ~/fpdual`).

| Orden | Qué hace | Cuándo |
| --- | --- | --- |
| `./deploy/fpdual.sh instalar` | Construye todo, crea la base de datos, aplica las migraciones, crea la cuenta de la aplicación y arranca los servicios | La primera vez |
| `./deploy/fpdual.sh admin tu@correo.es "Tu nombre"` | Crea una cuenta de Administración y muestra **una vez** su contraseña temporal. Con `COORDINADOR` al final, una de Coordinación | Después de instalar, y para cada persona del personal |
| `./deploy/fpdual.sh admin-restablecer tu@correo.es` | Nueva contraseña temporal para una cuenta del personal | Si alguien la pierde |
| `./deploy/fpdual.sh estado` | Muestra los contenedores y las migraciones aplicadas | Para comprobar que todo va |
| `./deploy/fpdual.sh logs` | Muestra lo que van escribiendo los servicios (`Ctrl+C` para salir). `logs backend` solo la API | Cuando algo falla |
| `./deploy/fpdual.sh reiniciar` | Para y vuelve a arrancar todo. Los datos se conservan | Si algo se queda colgado |
| `./deploy/fpdual.sh copia` | Copia de seguridad **cifrada** de toda la base de datos (con los documentos) en `backups/` | Antes de cada cambio y de forma periódica |
| `./deploy/fpdual.sh restaurar <fichero>` | Carga una copia. **Sustituye** todos los datos actuales | Solo para recuperar |
| `./deploy/fpdual.sh migrar` | Aplica las migraciones nuevas y actualiza la cuenta de la aplicación | En cada actualización |
| `./deploy/fpdual.sh demo --conservar-personal` | **Borra todos los datos** y carga empresas, alumnos y reservas ficticios | Solo para una demostración |
| `./deploy/fpdual.sh certificado` | Exporta el certificado HTTPS para instalarlo en los ordenadores del centro | Solo en una intranet (`CADDY_TLS=internal`) |

Las órdenes que borran o sustituyen datos (`demo`, `restaurar`) piden escribir una palabra (`BORRAR`, `RESTAURAR`) antes de hacer nada.

---

## 4. Primera instalación, paso a paso

### Paso 1. Entrar en el servidor y descargar el código

```bash
ssh usuario@servidor
git clone <URL_DEL_REPOSITORIO> ~/fpdual
cd ~/fpdual
git checkout v1.0.0      # la versión que se despliega
```

### Paso 2. Crear el fichero de configuración `.env`

```bash
cp .env.example .env
chmod 600 .env           # solo tu usuario puede leerlo: guarda contraseñas
nano .env
```

Genera cada contraseña o clave con su propia orden (cada vez sale una distinta) y pégala en su línea:

```bash
openssl rand -base64 33  # para DBADMIN_PASS, DBPASS, DB_ROOT_PASSWORD y BACKUP_KEY (una distinta para cada una)
openssl rand -base64 48  # para JWT_SECRET
```

Qué poner en cada variable:

| Variable | Qué poner |
| --- | --- |
| `SITE_ADDRESS` | La dirección sin `https://`. Intranet: `fpdual.centro.local`. Público: `dual.salesianoszaragoza.com` |
| `APP_URL` | La misma con `https://` delante. Va en los enlaces de los correos |
| `CADDY_TLS` | `internal` en una intranet. Para un dominio público, un correo electrónico (Let's Encrypt lo usa para avisos del certificado) |
| `DBADMIN_PASS`, `DBPASS`, `DB_ROOT_PASSWORD` | Tres contraseñas distintas generadas con `openssl rand -base64 33` |
| `BACKUP_KEY` | Otra clave generada igual. **Guárdala también fuera del servidor** (en el gestor de contraseñas del centro): sin ella ninguna copia se puede abrir |
| `JWT_SECRET` | Generada con `openssl rand -base64 48` |
| `MAIL_MODE` y `COMPOSE_PROFILES` | Para una demo: `MAIL_MODE=mailpit` y `COMPOSE_PROFILES=mailpit`. Para uso real: ver [5.5](#55-activar-el-correo-real) |
| `DEMO_ADMIN_EMAIL`, `DEMO_COORD_EMAIL` | Solo para la demo. Para uso real, déjalas vacías |

No cambies `DBNAME`, `DBADMIN_USER` ni `DBUSER` si no hay un motivo: los valores de ejemplo sirven.

> Las contraseñas de la base de datos (`DBADMIN_PASS`, `DB_ROOT_PASSWORD`) se fijan la **primera vez** que arranca MySQL. Cambiarlas después en `.env` no cambia las de MySQL y el script dejaría de funcionar. Ver [5.10](#510-cambiar-una-contraseña-o-clave-de-env).

Guarda el fichero en `nano` con `Ctrl+O`, `Intro` y sal con `Ctrl+X`.

### Paso 3. Instalar

```bash
./deploy/fpdual.sh instalar
```

Tarda unos minutos la primera vez (descarga y construye las imágenes). Si falta algo en `.env`, lo dice y no hace nada. Al terminar muestra la dirección de la aplicación y los siguientes pasos.

### Paso 4. Crear tu cuenta de Administración

```bash
./deploy/fpdual.sh admin tu@correo.es "Tu nombre"
```

Apunta la contraseña temporal que aparece: **solo se muestra una vez**. Al entrar por primera vez, la aplicación te pide cambiarla.

### Paso 5. Comprobar que funciona

```bash
./deploy/fpdual.sh estado
```

Todos los contenedores deben aparecer como `running` y `healthy`. Después, desde otro ordenador:

1. Abre `https://<SITE_ADDRESS>`. En una intranet el navegador avisará del certificado: acéptalo o sigue [5.3](#53-intranet-con-un-nombre-interno).
2. Entra con tu cuenta y cambia la contraseña.
3. Si usas Mailpit, abre `http://<servidor>:8025` y comprueba que llegan los correos.

### Paso 6. Preparar la aplicación

Con la cuenta de Administración, dentro del portal:

1. **Configuración › Convocatorias**: crea la convocatoria del curso (p. ej. `2026/2027`, del 1 de septiembre al 31 de agosto).
2. **Configuración › Ciclos**: añade los ciclos que ofrece el centro, con su código y su turno ([5.13](#513-añadir-o-cambiar-ciclos)). Sin ciclos activos, nadie puede presentar una solicitud.
3. **Documentos › Plantillas**: sube las plantillas del convenio, el Anexo II y el Anexo III. Sin ellas esos documentos no se generan.
4. **Configuración › Firma del centro**: sube la imagen de la firma y el sello.
5. **Configuración › Correos**: revisa los textos de los correos y envía uno de prueba.
6. **Configuración › Personal**: da de alta a las demás personas del centro (o usa `./deploy/fpdual.sh admin … COORDINADOR`).
7. Haz una prueba completa: una solicitud de alumno desde la página de inicio, valídala y genera un convenio.

### Paso 7. Programar las copias de seguridad

Haz una copia ahora y programa una cada noche. Abre el programador de tareas del usuario:

```bash
./deploy/fpdual.sh copia
crontab -e
```

Añade estas dos líneas al final (copia diaria a las 2:00 y borrado de las de más de 30 días). Cambia `usuario` por el tuyo:

```
0 2 * * * cd /home/usuario/fpdual && ./deploy/fpdual.sh copia >> backups/copias.log 2>&1
30 2 * * * find /home/usuario/fpdual/backups -name 'fpdual_*.sql.gz.enc' -mtime +30 -delete
```

Las copias deben guardarse **también fuera del servidor** (otro equipo, un disco del centro, la nube del centro). Por ejemplo, desde otro ordenador:

```bash
scp usuario@servidor:fpdual/backups/fpdual_*.sql.gz.enc /ruta/de/copias/
```

---

## 5. Situaciones habituales

### 5.1 Montar una demostración

Para enseñar el portal con datos ficticios. En `.env` deben estar `MAIL_MODE=mailpit` y `COMPOSE_PROFILES=mailpit`. Después de [instalar](#paso-3-instalar) y [crear tu cuenta](#paso-4-crear-tu-cuenta-de-administración):

```bash
./deploy/fpdual.sh demo --conservar-personal
```

- **Borra todos los datos** (solicitudes, empresas, alumnos, reservas, documentos y cuentas) y carga ciclos, 12 empresas, 36 alumnos y reservas en varios estados, todo ficticio. Pide escribir `BORRAR`.
- `--conservar-personal` mantiene las cuentas de Administración y Coordinación ya creadas.
- Si no hay convocatoria activa, crea la del curso actual.
- Al terminar muestra **todos los usuarios y contraseñas**: el personal entra con su correo, las empresas con el CIF y los alumnos con el DNI/NIE. No se guardan en ningún sitio: apúntalos.
- Todos los correos aparecen en `http://<servidor>:8025`. Para que esa bandeja pida contraseña, añade `MAILPIT_UI_AUTH=usuario:contraseña` en `.env` y aplica con `docker compose up -d`.

> `demo` vacía también las tablas de empresas y alumnos (`ge_*`, `gf_alumnosfct`). En esta instalación son una copia propia, pero **nunca** la ejecutes en una instalación conectada a la base de datos que comparten otras aplicaciones del centro.

Consejo para el día de la presentación: ten una captura o un vídeo corto del recorrido principal por si falla la red.

### 5.2 Pasar de la demo al uso real

Cuando la demo ha terminado y se va a usar con datos de verdad, lo más limpio es empezar con una base de datos vacía.

1. Si hay algo de la demo que quieras conservar, haz una copia: `./deploy/fpdual.sh copia`.
2. **Para todo mientras Mailpit sigue configurado** (si no, su contenedor se quedaría encendido):

   ```bash
   docker compose down
   ```

3. **Borra la base de datos de la demo y la bandeja de Mailpit.** Esto no se puede deshacer:

   ```bash
   docker volume rm fpdual_db-data fpdual_mailpit-data
   ```

   No uses `docker compose down -v`: borraría también los certificados de Caddy.
4. Borra las copias de la demo: `rm backups/fpdual_*.sql.gz.enc`.
5. Cambia `.env` para el uso real (`nano .env`):
   - Correo real: ver [5.5](#55-activar-el-correo-real) (`MAIL_MODE=smtp` y `COMPOSE_PROFILES=` vacío).
   - `DEMO_ADMIN_EMAIL=` y `DEMO_COORD_EMAIL=` vacíos.
   - Un `JWT_SECRET` nuevo (`openssl rand -base64 48`).
   - Si pasas a un dominio público, ver [5.4](#54-dominio-público-en-internet).
6. Instala de nuevo y crea la cuenta real:

   ```bash
   ./deploy/fpdual.sh instalar
   ./deploy/fpdual.sh admin tu@correo.es "Tu nombre"
   ```

7. Sigue desde el [Paso 6](#paso-6-preparar-la-aplicación) (preparar la aplicación) y el [Paso 7](#paso-7-programar-las-copias-de-seguridad) (copias).

### 5.3 Intranet con un nombre interno

Con `CADDY_TLS=internal`, Caddy crea su propio certificado y los navegadores avisan («la conexión no es privada»). Basta con aceptar el aviso, o quitarlo instalando el certificado en cada ordenador:

```bash
./deploy/fpdual.sh certificado      # crea ./fpdual-ca.crt
```

Copia `fpdual-ca.crt` a cada ordenador e instálalo como entidad de certificación raíz de confianza (Windows: doble clic › *Instalar certificado* › *Equipo local* › *Entidades de certificación raíz de confianza*). Ese fichero solo contiene la parte pública: se puede repartir sin riesgo.

Si la red no tiene un DNS interno que conozca `SITE_ADDRESS`, cada ordenador añade una línea a su fichero `hosts` (`C:\Windows\System32\drivers\etc\hosts` en Windows, `/etc/hosts` en Linux y macOS), con la IP del servidor:

```
192.168.1.50   fpdual.centro.local
```

### 5.4 Dominio público en Internet

1. Informática crea un registro DNS del dominio (p. ej. `dual.salesianoszaragoza.com`) que apunte a la IP pública del servidor, y abre los puertos 80 y 443.
2. En `.env`:

   ```
   SITE_ADDRESS=dual.salesianoszaragoza.com
   APP_URL=https://dual.salesianoszaragoza.com
   CADDY_TLS=informatica@salesianoszaragoza.com
   ```

3. Aplica los cambios: `docker compose up -d`. Caddy pide el certificado a Let's Encrypt y lo renueva solo. Si falla, `./deploy/fpdual.sh logs caddy` dice por qué (casi siempre, el DNS todavía no apunta al servidor o el puerto 80 está cerrado).

### 5.5 Activar el correo real

En `.env`:

```
MAIL_MODE=smtp
COMPOSE_PROFILES=
EMAIL_USER=cuenta@gmail.com
EMAIL_PASS=<contraseña de aplicación>
MAIL_FROM=FP Dual Salesianos <cuenta@gmail.com>
```

- Con Gmail, `EMAIL_PASS` es una **contraseña de aplicación** (se crea en la cuenta de Google, con la verificación en dos pasos activada), no la contraseña normal.
- Con otro servidor de correo, rellena también `SMTP_HOST`, `SMTP_PORT` y, si usa el puerto 465, `SMTP_SECURE=true`.
- Para un ensayo con correo real sin molestar a nadie, `MAIL_REDIRECT_TO=tu@correo.es` envía **todos** los correos a esa dirección. Déjalo vacío para el uso real.

Si Mailpit estaba en marcha, primero `docker compose down` (con la configuración antigua), después cambia `.env` y arranca con `docker compose up -d`. Prueba desde *Configuración › Correos* › enviar un correo de prueba.

### 5.6 Actualizar a una versión nueva

```bash
cd ~/fpdual
./deploy/fpdual.sh copia            # siempre antes de actualizar
git fetch --tags
git checkout v1.1.0                 # la versión nueva
docker compose build
./deploy/fpdual.sh migrar           # aplica las migraciones nuevas y reinicia la API
docker compose up -d
./deploy/fpdual.sh estado
```

Antes, lee las notas de la versión y `db/README.md`: algunas migraciones tienen que aplicarse antes de arrancar la API nueva (el orden de arriba ya lo hace así). Si algo sale mal, vuelve a la versión anterior (`git checkout v1.0.0`, `docker compose build`, `docker compose up -d`) y restaura la copia que acabas de hacer ([5.7](#57-copias-de-seguridad-y-restaurar)).

### 5.7 Copias de seguridad y restaurar

```bash
./deploy/fpdual.sh copia
```

Crea `backups/fpdual_AAAAMMDD_HHMMSS.sql.gz.enc`: la base de datos entera (estructura, datos, documentos, procedimientos y disparadores), comprimida y **cifrada** con AES-256 y una clave derivada de `BACKUP_KEY`. Al terminar comprueba que la copia se descifra y está completa. Con `BACKUP_DIR=/otra/carpeta ./deploy/fpdual.sh copia` se guarda en otra carpeta.

Para recuperar una copia (**sustituye todos los datos actuales**):

```bash
./deploy/fpdual.sh restaurar backups/fpdual_20270115_020000.sql.gz.enc
```

- Pide escribir `RESTAURAR`.
- Admite copias `.sql.gz.enc` (las del servidor), `.sql.gz` y `.sql`.
- Para descifrar necesita la **misma** `BACKUP_KEY` con la que se hizo la copia.

**Restaurar en un servidor nuevo** (si el servidor se estropea): instala como en la [sección 4](#4-primera-instalación-paso-a-paso) con la misma `BACKUP_KEY`, copia el fichero a `backups/` y ejecuta `restaurar` y después `./deploy/fpdual.sh migrar`.

### 5.8 Llevar al servidor la base de datos del equipo de desarrollo

En el equipo de desarrollo, dentro de `backend/`:

```bash
npm run db:backup
npm run db:backup -- verify ../backups/proyecto_dual_AAAAMMDD_HHMMSS.sql
```

Copia ese `.sql` al servidor **fuera de la carpeta del proyecto** y:

```bash
./deploy/fpdual.sh restaurar /ruta/proyecto_dual_AAAAMMDD_HHMMSS.sql
./deploy/fpdual.sh migrar
```

- Revisa antes las cuentas que lleva: una cuenta de desarrollo con una contraseña fácil sería una puerta abierta en el servidor.
- Si el volcado tiene cláusulas `DEFINER=` de un usuario que no existe en el servidor, los procedimientos fallan: cámbialo por la cuenta dueña (`DBADMIN_USER`) antes de importarlo.
- Al terminar, borra el `.sql` del servidor: no está cifrado.

### 5.9 Personal: altas y contraseñas olvidadas

| Necesito… | Orden o pantalla |
| --- | --- |
| Dar de alta a alguien de Administración | `./deploy/fpdual.sh admin correo@centro.es "Nombre"` o *Configuración › Personal* |
| Dar de alta a alguien de Coordinación | `./deploy/fpdual.sh admin correo@centro.es "Nombre" COORDINADOR` o *Configuración › Personal* |
| Recuperar el acceso de alguien del personal | `./deploy/fpdual.sh admin-restablecer correo@centro.es` (muestra una contraseña temporal) |
| Recuperar el acceso de un alumno o una empresa | Desde su ficha en el portal: pestaña *Cuenta* › contraseña temporal. También pueden usar «¿Has olvidado tu contraseña?» si tienen correo |

### 5.10 Cambiar una contraseña o clave de `.env`

| Variable | Cómo cambiarla |
| --- | --- |
| `JWT_SECRET` | Cámbiala en `.env` y aplica con `docker compose up -d`. Cierra la sesión de todo el mundo |
| `DBPASS` | Cámbiala en `.env` y ejecuta `./deploy/fpdual.sh migrar`: actualiza la cuenta de la aplicación en MySQL y reinicia la API |
| `BACKUP_KEY` | Cámbiala en `.env`. Las copias nuevas usan la nueva; las antiguas solo se abren con la antigua, así que guarda las dos |
| `DBADMIN_PASS`, `DB_ROOT_PASSWORD` | Hay que cambiarla primero dentro de MySQL y después en `.env`. Para `DBADMIN_PASS`: `docker compose exec db mysql -uroot -p -e "ALTER USER 'fpdual_admin'@'%' IDENTIFIED BY 'NUEVA'"` (pide la contraseña de root) y luego la misma en `.env` |
| Correo (`EMAIL_*`, `SMTP_*`) | Cámbialo en `.env` y aplica con `docker compose up -d` |

### 5.11 Reinicios del servidor y comprobaciones

- Los contenedores arrancan solos cuando arranca el servidor, siempre que Docker también lo haga (`sudo systemctl enable docker`, lo hace Informática una vez).
- Para comprobarlo antes de necesitarlo: `./deploy/fpdual.sh reiniciar` y, después, `./deploy/fpdual.sh estado`.
- **Nunca** ejecutes `docker compose down -v` salvo para desinstalar: `-v` borra los volúmenes, es decir, la base de datos.
- Ver qué está pasando: `./deploy/fpdual.sh logs` (todo) o `./deploy/fpdual.sh logs backend` (solo la API). `Ctrl+C` para salir.

### 5.12 Desinstalar por completo

Borra la aplicación, la base de datos, los certificados y las imágenes. **No se puede deshacer**: haz antes una copia y llévatela fuera del servidor.

```bash
cd ~/fpdual
./deploy/fpdual.sh copia
docker compose --profile mailpit down -v --rmi all
cd ~
rm -rf ~/fpdual
```

### 5.13 Añadir o cambiar ciclos

Con la cuenta de Administración, en **Configuración › Ciclos**:

1. **«Nuevo ciclo»**: escribe el **código** (p. ej. `DAM`, se guarda en mayúsculas), el **nombre** completo y elige el **turno** (diurno o vespertino). El mismo código puede existir una vez en cada turno.
2. **«Editar»**: el nombre se cambia siempre. El código y el turno solo mientras nadie use el ciclo; en cuanto tiene una solicitud, una oferta o un alumno, quedan fijos.
3. **«Desactivar»**: el ciclo deja de aparecer en las solicitudes nuevas; lo que ya lo usa se conserva. **«Activar»** lo vuelve a ofrecer. Los ciclos no se borran.

Sin ningún ciclo activo, nadie puede presentar una solicitud: la pestaña lo avisa.

---

## 6. Problemas frecuentes

| Qué pasa | Por qué y qué hacer |
| --- | --- |
| `instalar` dice que faltan valores | Rellena en `.env` las variables que nombra. `JWT_SECRET` y `BACKUP_KEY` necesitan 32 caracteres o más |
| `permission denied ... docker.sock` | Tu usuario no está en el grupo `docker`. Lo añade Informática (`usermod -aG docker <usuario>`) y hay que volver a entrar por SSH |
| Un contenedor se reinicia una y otra vez | `./deploy/fpdual.sh logs <servicio>` dice por qué. En `backend` casi siempre es `.env`: una contraseña de la base de datos o `JWT_SECRET` |
| El navegador no encuentra la dirección | Falta la línea en el fichero `hosts` del ordenador o el registro en el DNS ([5.3](#53-intranet-con-un-nombre-interno), [5.4](#54-dominio-público-en-internet)) |
| Aviso de certificado | Normal con `CADDY_TLS=internal`: acéptalo o instala el certificado ([5.3](#53-intranet-con-un-nombre-interno)) |
| Los puertos 80 y 443 están ocupados | Pon `HTTP_PORT` y `HTTPS_PORT` en `.env`; `APP_URL` debe llevar el puerto (`https://fpdual.centro.local:8443`) y hay que abrir esa dirección con su puerto |
| No llegan los correos | Con Mailpit: mira `http://<servidor>:8025` y comprueba `COMPOSE_PROFILES=mailpit`. Con correo real: `./deploy/fpdual.sh logs backend` muestra el error (Gmail pide una contraseña de aplicación; algunas redes bloquean el envío de correo) |
| «No hay plantilla activa» al generar un convenio | Sube la plantilla en *Documentos › Plantillas* |
| El PDF no se genera | `./deploy/fpdual.sh logs backend`. Chromium necesita memoria libre: 2 GB o más en el servidor |
| `copia` dice que falta `BACKUP_KEY` | Añádela en `.env` (32 caracteres o más) y guárdala también fuera del servidor |
| `restaurar` no puede descifrar una copia | La copia se hizo con otra `BACKUP_KEY`: pon la que se usó entonces |
| Nadie puede entrar tras cambiar `JWT_SECRET` | Es lo esperado: todos tienen que volver a iniciar sesión |

---

## 7. Notas técnicas

- **Secretos**: solo en el `.env` del servidor, nunca en las imágenes (`.dockerignore` deja fuera `.env`, `backups/` y los datos de prueba).
- **Sesiones**: el navegador guarda la sesión en una cookie `HttpOnly` y `Secure` (solo HTTPS), así que la aplicación tiene que abrirse siempre por `https://`.
- **IP del cliente**: Caddy → nginx → API. nginx toma la dirección del cliente que le pasa Caddy y la API confía exactamente en un proxy (`TRUST_PROXY=1`), así que los límites de intentos de inicio de sesión y de altas ven la IP real.
- **Chromium**: dentro de un contenedor funciona sin su sandbox (`PUPPETEER_NO_SANDBOX=true`). La página del PDF se genera con JavaScript desactivado y sin acceso a la red (SEC-004).
- **Otro proxy delante** (otro nginx, Traefik…): quita el servicio `caddy`, publica `web` en un puerto local (`ports: ["127.0.0.1:8080:80"]`) y apunta tu proxy a él. Debe sustituir `X-Forwarded-For` por la dirección del cliente y enviar `X-Forwarded-Proto: https`.
- **Zona horaria**: los contenedores usan `Europe/Madrid`; de ella depende qué convocatoria está activa cada día.
- **Ficheros**: los documentos se guardan dentro de la base de datos, así que una copia de `copia` lo contiene todo.

---

## 8. En el equipo de desarrollo

Los mismos scripts se usan con `npm` desde `backend/`:

| Orden | Para qué |
| --- | --- |
| `npm run mailpit` | Arranca Mailpit (bandeja en http://localhost:8025). Con `MAIL_MODE=mailpit` en `backend/.env`, todos los correos van ahí |
| `npm run db:migrate -- status` | Migraciones aplicadas y pendientes |
| `npm run db:migrate -- up --yes` | Aplica las migraciones pendientes |
| `npm run db:backup` | Copia de la base de datos de desarrollo en `backups/` |
| `npm run db:admin -- --email tu@correo.es --nombre "Tu nombre" --yes` | Crea una cuenta de Administración |
| `npm run db:demo -- --yes` | Borra los datos y carga la demo (contraseñas en `backend/.demo.local.json`; con `--mostrar`, en pantalla) |
| `DBADMIN_USER=root DBADMIN_PASS=… node scripts/cuentaApp.js --yes --pruebas` | Crea o actualiza la cuenta limitada de la aplicación (`DBUSER`) |
