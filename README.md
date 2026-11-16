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
  required_documents/ plantillas .docx de partida (convenio y anexos)
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

   Rellena en `backend/.env` al menos `DBUSER`, `DBPASS`, `DBNAME` y `JWT_SECRET` (32 caracteres aleatorios como mínimo). Con `MAIL_MODE=log` no se envía ningún correo: solo se anota en el registro del servidor.

2. Instala las dependencias y crea la base de datos (sobre una base vacía crea el esquema completo y aplica todas las migraciones):

   ```bash
   npm install
   npm run db:migrate -- up --yes
   ```

3. Carga datos. Para probar, hay un juego de demostración ficticio con ciclos, empresas, alumnos y cuentas de personal. Necesita una convocatoria activa (una fila en `dual_convocatorias` cuyas fechas incluyan hoy), **borra todos los datos** antes de cargarlos y guarda las contraseñas en `backend/.demo.local.json`:

   ```bash
   node scripts/seedDemo.js --yes
   ```

   Con datos reales, en cambio, hay que cargar los ciclos del centro (`dual_especialidades`) y crear la primera cuenta de administración; después todo se gestiona desde la aplicación.

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
| `frontend` | `npm start` | Servidor de desarrollo |
| `frontend` | `npm test` | Pruebas |
| `frontend` | `npm run lint` | Revisión de código (sin avisos permitidos) |
| `frontend` | `npm run build` | Compilación en `frontend/build/` |
| `e2e` | `npm test` | Recorrido completo en un navegador real (Playwright) sobre la base aislada `proyecto_dual_e2e_verify`, con datos ficticios. La primera vez: `npm install` y `npx playwright install chromium` |

Antes de aplicar una migración, haz una copia con `npm run db:backup` y compruébala con `npm run db:backup -- verify <fichero>`. Nunca se edita una migración ya aplicada: los cambios van en una migración nueva. Cada una tiene su reversión en `db/rollback/`.

## Despliegue

La aplicación se despliega con Docker Compose en un servidor Linux. Los pasos (variables, primera instalación, migraciones, copias de seguridad y actualizaciones) están en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Documentación

- [Manual de usuario](docs/MANUAL_DE_USUARIO.md): uso de la aplicación por perfiles, con capturas. La aplicación lo muestra en su página de Ayuda.
- [Documentación técnica](docs/tecnica/README.md): arquitectura, modelo de datos, reglas de negocio, API, seguridad y limitaciones conocidas.
- [Base de datos](db/README.md): esquema base, migraciones y reversiones.
- [Despliegue](docs/DESPLIEGUE.md).

## Seguridad y datos

- Nunca se suben al repositorio el fichero `.env`, las copias de seguridad (`backups/`) ni los ficheros con contraseñas de prueba.
- Las contraseñas se guardan cifradas con bcrypt y las sesiones usan JWT; cambiar `JWT_SECRET` cierra todas las sesiones.
- Los formularios públicos tienen límites de envíos por IP y por día, y los ficheros subidos se comprueban por su contenido.
