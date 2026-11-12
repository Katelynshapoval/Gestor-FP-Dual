# Despliegue con Docker

Everything runs from `docker-compose.yml` at the repository root:

| Service | Image | What it does |
| --- | --- | --- |
| `caddy` | `caddy:2.8-alpine` | Only public entry (ports 80/443). Gets and renews the HTTPS certificate, adds HSTS. |
| `web` | built from `frontend/Dockerfile` | nginx with the React build. Page loads get `index.html`; every other request goes to the API (same rule as the Vite dev proxy, because the API has no `/api` prefix). Config: `deploy/nginx.conf`. |
| `backend` | built from `backend/Dockerfile` | Node 24 API, with Chromium for PDF generation. Includes `db/` (migration runner) and `docs/` (manual at `/ayuda`). Runs as the `node` user. |
| `db` | `mysql:8.4` | Database in the `db-data` volume. Not published to the host. |

## Server requirements

- Linux with Docker Engine and the Compose plugin (`docker compose version`).
- 2 GB RAM or more (MySQL + Chromium while a PDF is generated).
- A DNS `A` record for the domain pointing to the server, and ports 80 and 443 open.

## First install

```bash
git clone <repo> fpdual && cd fpdual
cp .env.production.example .env
```

Fill in `.env`: `SITE_ADDRESS`, `APP_URL`, `DBPASS`, `DB_ROOT_PASSWORD`, `JWT_SECRET`, `EMAIL_USER`, `EMAIL_PASS`. Generate the secrets with `openssl rand -base64 48`. Then restrict it: `chmod 600 .env`.

```bash
docker compose up -d --build
docker compose ps
```

The backend starts but the database is still empty. Choose **one** of the two options below.

### A. New, empty database

Create the schema from `db/000_baseline.sql` plus every migration. The runner refuses `NODE_ENV=production` unless `--allow-production` is given:

```bash
docker compose run --rm backend node scripts/migrate.js up --yes --allow-production
docker compose run --rm backend node scripts/migrate.js status
```

Then load the centre's specialities (`dual_especialidades`, not in the baseline) and create the first administrator account. There is no script for the first administrator yet.

### B. Move the existing database

Take and verify a backup on the development machine (`npm run db:backup`, then `npm run db:backup -- verify ...`). Copy the `.sql` file to the server **outside the repository**, then:

```bash
docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < proyecto_dual_YYYYMMDD_HHMMSS.sql
docker compose run --rm backend node scripts/migrate.js status
```

`status` must show no pending migration (or apply them with `up` as in option A). The backup contains personal data: delete the copy from the server once it is restored.

If the dump has `DEFINER=` clauses for a user that does not exist on the server, the views and procedures fail: create that user, or replace the definer with the app user (`DBUSER`) before importing.

## Check it works

```bash
docker compose logs -f backend
```

Open `https://<domain>`, sign in, generate a document (checks Chromium) and send a test email. For a trial run before real users, set `MAIL_REDIRECT_TO` in `.env` so every email goes to one address.

## Updates

```bash
git pull
# take a backup first (see Backups below)
docker compose build
docker compose run --rm backend node scripts/migrate.js status
docker compose run --rm backend node scripts/migrate.js up --yes --allow-production   # only if there are pending migrations
docker compose up -d
```

Read `db/README.md` ("Order of deployment") before applying a migration: some must go in before the new backend starts.

## Backups

The `db-data` volume holds everything. A daily dump from the server (keep it out of the repository, and off the server too):

```bash
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --hex-blob "$MYSQL_DATABASE"' | gzip > /var/backups/fpdual/proyecto_dual_$(date +%Y%m%d_%H%M%S).sql.gz
```

Restore with the import command from option B (`gunzip -c file.sql.gz | docker compose exec -T db ...`).

## Notes

- **Secrets** are only in `.env` on the server, never in the images (`.dockerignore` keeps `.env`, `backups/` and test data out).
- **Client IP**: Caddy → nginx → API. nginx takes the client address from Caddy and the API trusts exactly one proxy (`TRUST_PROXY=1`), so the login and sign-up rate limits see the real client.
- **Chromium sandbox**: Chromium's own sandbox does not work inside a container without extra privileges, so `PUPPETEER_NO_SANDBOX=true`. The PDF page still runs with JavaScript off and every network request blocked (SEC-004).
- **Already have a reverse proxy** (another nginx, Traefik…)? Remove the `caddy` service, publish `web` on a local port (`ports: ["127.0.0.1:8080:80"]`) and point your proxy to it. It must overwrite `X-Forwarded-For` with the client address and send `X-Forwarded-Proto: https`.
- **Time zone**: containers use `Europe/Madrid`, which the daily convocatoria check relies on.
