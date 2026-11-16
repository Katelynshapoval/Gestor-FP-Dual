# FP Dual

Aplicación web de Salesianos Zaragoza para gestionar la Formación Profesional Dual: candidaturas de alumnos, solicitudes de empresas, reservas de alumnos por parte de las empresas y toda la documentación del proceso (convenio, Anexo II o III, calendario y los documentos que añada el centro), con firma dentro de la propia aplicación y avisos por correo.

## Qué hace

| Perfil | Qué puede hacer |
| --- | --- |
| Administración | Todo lo de coordinación, más convocatorias, cuentas del personal, correos automáticos, tipos de documento, plantillas y la firma del centro. |
| Coordinación | Revisa y valida alumnos y empresas, gestiona reservas, genera, firma y valida documentos. |
| Empresa | Presenta su solicitud, ofrece plazas por ciclo, reserva alumnos (eligiendo beca o contrato), gestiona sus tutores y firma el convenio y los anexos. |
| Alumno | Presenta su candidatura, sube su CV y el Anexo DGA, consulta sus reservas y firma sus documentos. |

Algunas características:

- **Documentos dinámicos.** El centro añade tipos de documento y cambia sus plantillas (.docx) sin programar. Cada documento pertenece a la solicitud del alumno, a la de la empresa o a la reserva.
- **Un convenio por empresa.** Se reutiliza en las convocatorias siguientes mientras la empresa pida los mismos ciclos.
- **Beca o contrato.** La empresa lo elige al reservar; decide si el documento es el Anexo III o el Anexo II.
- **Firmas con imagen.** Cada persona guarda su firma una vez (dibujada en pantalla o en el móvil con un código QR) y se inserta en el PDF en su sitio. El centro firma con una imagen de firma y sello. Los menores firman también con su tutor legal.
- **Correos editables.** El texto, los adjuntos y las variables de cada correo automático se guardan en la base de datos y los edita Administración.
- **Auditoría.** Las acciones importantes quedan registradas en un historial que no se puede modificar.

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, React Router |
| Backend | Node.js 24, Express 4, mysql2, JWT, Nodemailer |
| Documentos | docx-templates y mammoth (plantilla a HTML), Puppeteer (PDF), pdf-lib (firmas) |
| Base de datos | MySQL 8, con procedimientos almacenados y triggers |
| Pruebas | node:test (backend), Vitest y Testing Library (frontend), GitHub Actions |
| Despliegue | Docker Compose: Caddy (HTTPS), nginx, backend y MySQL |

## Estructura del repositorio

```
backend/              API (Express)
  src/routes/         rutas por dominio: URL, roles y subida de ficheros
  src/services/       lógica de negocio y SQL
  src/middleware/     autenticación, límites de peticiones, validación de PDF
  scripts/            migraciones, copias de seguridad, datos de prueba
  test/               pruebas (test/db: contra una base de datos real)
frontend/             aplicación React
  src/pages/          una carpeta por pantalla
  src/components/     componentes compartidos (firma/, reservas/, ui/...)
db/                   esquema base, migraciones y reversiones
deploy/               configuración de Caddy y nginx
docs/                 manual de usuario, despliegue y documentación técnica
```

## Puesta en marcha en desarrollo

Requisitos: Node.js 24 (npm 11) y MySQL 8.

1. Configura el backend:

   ```bash
   cd backend
   cp .env.example .env
   ```

   Rellena en `backend/.env` al menos `DBUSER`, `DBPASS`, `DBNAME` y `JWT_SECRET` (32 caracteres aleatorios como mínimo). Para el correo:
   - `MAIL_MODE=log` no envía nada: solo lo anota en el registro del servidor.
   - `MAIL_MODE=mailpit` deja cada correo en una bandeja local en http://localhost:8025. Arráncala con `npm run mailpit` (necesita Docker).
   - `MAIL_MODE=smtp` envía de verdad.

2. Instala las dependencias y crea la base de datos (sobre una base vacía crea el esquema completo y aplica todas las migraciones):

   ```bash
   npm install
   npm run db:migrate -- up --yes
   ```

3. Carga datos. Para probar, hay un juego de demostración ficticio con ciclos, empresas, alumnos, reservas y cuentas de personal. **Borra todos los datos** antes de cargarlos, crea la convocatoria del curso si no hay ninguna activa y guarda las contraseñas en `backend/.demo.local.json` (`--mostrar` las enseña en pantalla):

   ```bash
   npm run db:demo -- --yes
   ```

   Con datos reales, en cambio, crea la primera cuenta de Administración (la contraseña temporal sale en pantalla); los ciclos y la convocatoria se crean desde la aplicación:

   ```bash
   npm run db:admin -- --email tu@correo.es --nombre "Tu nombre" --yes
   ```

   En los dos casos, sube después las plantillas `.docx` del convenio y los anexos II y III en *Documentos › Plantillas*: sin ellas no se pueden generar esos documentos.

4. Arranca el backend (puerto 3001):

   ```bash
   npm run dev
   ```

5. En otra terminal, arranca el frontend (puerto 3000; reenvía las llamadas a la API al puerto 3001):

   ```bash
   cd frontend
   npm install
   npm start
   ```

Abre http://localhost:3000. Para firmar desde el móvil con el código QR, el móvil tiene que poder abrir la aplicación: arranca Vite con `--host` y pon en `APP_URL` la dirección de red del ordenador.

## Comandos habituales

| Dónde | Comando | Para qué |
| --- | --- | --- |
| `backend` | `npm run dev` | API con recarga automática |
| `backend` | `npm test` | Pruebas (sin base de datos) |
| `backend` | `npm run test:coverage` | Pruebas con los mínimos de cobertura de la CI |
| `backend` | `DB_INTEGRATION=1 node --test --test-concurrency=1 test/db/*.db.test.js` | Pruebas contra MySQL real, en la base aislada `<DBNAME>_verify` (la crea y la borra) |
| `backend` | `npm run db:migrate -- status` | Migraciones aplicadas y pendientes |
| `backend` | `npm run db:migrate -- up --yes` | Aplica las migraciones pendientes |
| `backend` | `npm run db:backup` | Copia de seguridad en `backups/` |
| `backend` | `npm run db:admin -- --email … --nombre "…" --yes` | Crea una cuenta de Administración (`--rol COORDINADOR`, `--restablecer`) |
| `backend` | `npm run db:demo -- --yes` | Borra los datos y carga la demo ficticia |
| `backend` | `npm run mailpit` | Bandeja de correo local en http://localhost:8025 (con `MAIL_MODE=mailpit`) |
| `frontend` | `npm start` | Servidor de desarrollo |
| `frontend` | `npm test` | Pruebas |
| `frontend` | `npm run lint` | Revisión de código (sin avisos permitidos) |
| `frontend` | `npm run build` | Compilación en `frontend/build/` |
| `e2e` | `npm test` | Recorrido completo en un navegador real (Playwright) sobre la base aislada `proyecto_dual_e2e_verify`, con datos ficticios. La primera vez: `npm install` y `npx playwright install chromium` |

Antes de aplicar una migración, haz una copia con `npm run db:backup` y compruébala con `npm run db:backup -- verify <fichero>`. Nunca se edita una migración ya aplicada: los cambios van en una migración nueva. Cada una tiene su reversión en `db/rollback/`.

## Despliegue

La aplicación se despliega con Docker Compose en un servidor Linux, y todo se maneja con `./deploy/fpdual.sh`:

```bash
cp .env.example .env && chmod 600 .env && nano .env
./deploy/fpdual.sh instalar
./deploy/fpdual.sh admin tu@correo.es "Tu nombre"
./deploy/fpdual.sh demo --conservar-personal    # opcional: datos ficticios
```

Después, sube las plantillas del convenio y los anexos en *Documentos › Plantillas*.

Las variables, HTTPS en una intranet, Mailpit, las copias de seguridad, las actualizaciones y los problemas frecuentes están en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Documentación

- [Manual de usuario](docs/MANUAL_DE_USUARIO.md): uso de la aplicación por perfiles, con capturas. La aplicación lo muestra en su página de Ayuda.
- [Documentación técnica](docs/tecnica/README.md): arquitectura, modelo de datos, reglas de negocio, API, seguridad y limitaciones conocidas.
- [Base de datos](db/README.md): esquema base, migraciones y reversiones.
- [Despliegue](docs/DESPLIEGUE.md).

## Seguridad y datos

- Nunca se suben al repositorio el fichero `.env`, las copias de seguridad (`backups/`) ni los ficheros con contraseñas de prueba.
- Las contraseñas se guardan cifradas con bcrypt y las sesiones usan JWT; cambiar `JWT_SECRET` cierra todas las sesiones.
- Los formularios públicos tienen límites de envíos por IP y por día, y los ficheros subidos se comprueban por su contenido.
