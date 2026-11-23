#!/usr/bin/env bash
# Server helper for the Docker deployment. Run it from the repository root:
#   ./deploy/fpdual.sh <orden> [argumentos]
#
#   instalar                 build, start MySQL, apply migrations, start everything
#   admin <email> "<nombre>" [COORDINADOR]
#                            create a staff account (temporary password shown once)
#   admin-restablecer <email>
#                            new temporary password for an existing staff account
#   demo [--conservar-personal]
#                            WIPE all data and load fictitious companies, students
#                            and bookings; prints every login
#   estado                   containers and migrations
#   migrar                   apply pending migrations
#   actualizar <vX.Y.Z>      backup, check out that git tag, rebuild, migrate and
#                            restart (what .github/workflows/deploy.yml runs)
#   logs [servicio]          follow the logs (backend, db, web, caddy, mailpit)
#   reiniciar                stop and start again; the data stays (never -v)
#   copia                    encrypted database dump to backups/ (BACKUP_KEY;
#                            BACKUP_DIR to change the folder)
#   restaurar <fichero>      load a dump made with "copia" (REPLACES the data)
#   certificado              export Caddy's root certificate (CADDY_TLS=internal),
#                            to install on the computers that open the app
#
# Everything runs inside the containers: the server only needs Docker with the
# Compose plugin, and a user in the "docker" group.
set -euo pipefail

cd "$(dirname "$0")/.."
DC=(docker compose)
BACKUP_DIR="${BACKUP_DIR:-./backups}"

rojo() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
paso() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }
fallo() { rojo "$*"; exit 1; }

valor_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

comprobar_env() {
  [ -f .env ] || fallo "Falta .env. Créalo con: cp .env.example .env && chmod 600 .env, y rellénalo."
  local falta=()
  for v in SITE_ADDRESS APP_URL DBADMIN_PASS DBPASS DB_ROOT_PASSWORD JWT_SECRET BACKUP_KEY; do
    [ -n "$(valor_env "$v")" ] || falta+=("$v")
  done
  [ ${#falta[@]} -eq 0 ] || fallo "En .env faltan valores: ${falta[*]}"
  [ "$(cuenta_app_nombre)" != "$(cuenta_admin_nombre)" ] && [ "$(cuenta_app_nombre)" != root ] \
    || fallo "DBUSER tiene que ser una cuenta propia de la aplicación, distinta de DBADMIN_USER y de root."
  local jwt
  jwt="$(valor_env JWT_SECRET)"
  [ "${#jwt}" -ge 32 ] || fallo "JWT_SECRET tiene que tener al menos 32 caracteres (openssl rand -base64 48)."
  if [ "$(valor_env MAIL_MODE)" = "mailpit" ] && [[ "$(valor_env COMPOSE_PROFILES)" != *mailpit* ]]; then
    fallo "MAIL_MODE=mailpit necesita COMPOSE_PROFILES=mailpit en .env (si no, el contenedor de Mailpit no arranca)."
  fi
}

cuenta_admin_nombre() { local v; v="$(valor_env DBADMIN_USER)"; echo "${v:-fpdual_admin}"; }
cuenta_app_nombre() { local v; v="$(valor_env DBUSER)"; echo "${v:-fpdual_app}"; }

# A one-off backend container for the scripts: works even if the API is not
# healthy yet (for example before the first migration). The scripts run with
# the schema owner; the API itself keeps its own limited account (DBUSER).
# The passwords travel as environment variables, never on the command line.
backend_run() {
  DBADMIN_USER="$(cuenta_admin_nombre)" DBADMIN_PASS="$(valor_env DBADMIN_PASS)" \
    "${DC[@]}" run --rm --no-deps -T -e DBADMIN_USER -e DBADMIN_PASS backend "$@"
}

# Creates or updates the API's account with only the rights it uses
# (scripts/cuentaApp.js). Needs root, the only account that can grant.
cuenta_app() {
  DBADMIN_USER=root DBADMIN_PASS="$(valor_env DB_ROOT_PASSWORD)" \
    "${DC[@]}" run --rm --no-deps -T -e DBADMIN_USER -e DBADMIN_PASS backend \
    node scripts/cuentaApp.js --yes --allow-production --host %
}

# Key of the encrypted backups (BACKUP_KEY in .env, 32 characters or more).
clave_copias() {
  local k
  k="$(valor_env BACKUP_KEY)"
  [ "${#k}" -ge 32 ] || fallo "Falta BACKUP_KEY en .env (32 caracteres o más: openssl rand -base64 33). Las copias se cifran con ella; guárdala también fuera del servidor."
  printf '%s' "$k"
}

descifrar() { BACKUP_KEY="$(clave_copias)" openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_KEY -in "$1"; }

# Encrypted dump to $BACKUP_DIR; leaves its path in COPIA.
hacer_copia() {
  command -v openssl >/dev/null || fallo "Falta openssl en el servidor: las copias se cifran con él."
  clave_copias >/dev/null
  mkdir -p "$BACKUP_DIR"
  COPIA="$BACKUP_DIR/fpdual_$(date +%Y%m%d_%H%M%S).sql.gz.enc"
  # Personal data and every stored file: the dump is compressed and encrypted
  # (AES-256 with a key derived from BACKUP_KEY) before it touches the disk.
  "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob "$MYSQL_DATABASE"'     | gzip | BACKUP_KEY="$(clave_copias)" openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_KEY > "$COPIA"
  chmod 600 "$COPIA"
  [ "$(descifrar "$COPIA" | gzip -cd | tail -1 | grep -c 'Dump completed')" = 1 ] || fallo "La copia $COPIA parece incompleta."
  echo "Copia cifrada: $COPIA ($(du -h "$COPIA" | cut -f1)). Guárdala fuera del servidor; sin BACKUP_KEY no se puede leer."
}

confirmar() {
  local palabra="$1" texto="$2"
  rojo "$texto"
  read -r -p "Escribe $palabra para continuar: " respuesta
  [ "$respuesta" = "$palabra" ] || fallo "Cancelado."
}

migrar() {
  backend_run node scripts/migrate.js up --yes --allow-production
  backend_run node scripts/migrate.js status
  # After the migrations: the account's DELETE rights name tables.
  cuenta_app
}

orden="${1:-}"
shift || true

case "$orden" in
  instalar)
    comprobar_env
    paso "Construyendo las imágenes"
    "${DC[@]}" build
    paso "Arrancando MySQL"
    "${DC[@]}" up -d --wait --wait-timeout 180 db
    paso "Aplicando migraciones"
    migrar
    paso "Arrancando todos los servicios"
    "${DC[@]}" up -d --wait --wait-timeout 180
    "${DC[@]}" ps
    url="$(valor_env APP_URL)"
    cat <<EOF

Listo. La aplicación está en ${url}
Siguientes pasos:
  ./deploy/fpdual.sh admin tu@correo.es "Tu nombre"     primera cuenta de Administración
  Documentos › Plantillas                                subir las plantillas de convenio y anexos
  ./deploy/fpdual.sh demo --conservar-personal           (opcional) datos ficticios para una demo
EOF
    if [ "$(valor_env MAIL_MODE)" = "mailpit" ]; then
      echo "Correos: bandeja de Mailpit en http://$(valor_env SITE_ADDRESS):$(valor_env MAILPIT_UI_PORT | grep . || echo 8025)"
    fi
    if [ "$(valor_env CADDY_TLS)" = "internal" ] || [ -z "$(valor_env CADDY_TLS)" ]; then
      echo "Certificado propio (CADDY_TLS=internal): el navegador avisará hasta instalar ./deploy/fpdual.sh certificado"
    fi
    ;;
  admin)
    [ $# -ge 2 ] || fallo 'Uso: ./deploy/fpdual.sh admin <email> "<nombre>" [COORDINADOR]'
    backend_run node scripts/crearAdmin.js --email "$1" --nombre "$2" --rol "${3:-ADMINISTRADOR}" --yes
    ;;
  admin-restablecer)
    [ $# -ge 1 ] || fallo 'Uso: ./deploy/fpdual.sh admin-restablecer <email>'
    backend_run node scripts/crearAdmin.js --email "$1" --restablecer --yes
    ;;
  demo)
    extra=()
    [ "${1:-}" = "--conservar-personal" ] && extra+=(--conservar-personal)
    confirmar BORRAR "Esto BORRA todas las solicitudes, empresas, alumnos, reservas, documentos y cuentas$([ ${#extra[@]} -gt 0 ] && echo ' (menos las del personal del centro)') y carga datos ficticios."
    backend_run node scripts/seedDemo.js --yes --allow-production --mostrar ${extra[@]+"${extra[@]}"}
    "${DC[@]}" restart backend >/dev/null
    ;;
  estado)
    "${DC[@]}" ps
    backend_run node scripts/migrate.js status
    ;;
  migrar)
    migrar
    "${DC[@]}" restart backend
    ;;
  actualizar)
    # Part 1 runs with the script of the version installed now: backup and
    # checkout. Part 2 (_actualizar) runs with the script of the new version,
    # so its build and migration steps are the ones that version expects.
    version="${1:-}"
    [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fallo 'Uso: ./deploy/fpdual.sh actualizar vX.Y.Z (una etiqueta de git)'
    comprobar_env
    [ -z "$(git status --porcelain --untracked-files=no)" ] \
      || fallo "Hay ficheros del repositorio modificados en el servidor (git status). Deshaz esos cambios antes de actualizar."
    anterior="$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)"
    paso "Descargando las versiones"
    git fetch --tags --force origin
    git rev-parse -q --verify "refs/tags/$version^{commit}" >/dev/null || fallo "No existe la etiqueta $version en el repositorio."
    paso "Copia de seguridad antes de actualizar"
    hacer_copia
    paso "Cambiando de $anterior a $version"
    git -c advice.detachedHead=false checkout "refs/tags/$version"
    exec ./deploy/fpdual.sh _actualizar "$version" "$anterior" "$COPIA"
    ;;
  _actualizar)
    version="$1" anterior="$2" copia="$3"
    # EXIT, not ERR: set -e leaves from inside functions, where ERR does not fire.
    trap 'st=$?; [ $st -eq 0 ] || rojo "
La actualización a $version ha fallado. Para volver a $anterior:
  git checkout $anterior && docker compose build && docker compose up -d
Si ya se aplicó alguna migración, restaura también la copia de antes:
  ./deploy/fpdual.sh restaurar $copia"' EXIT
    paso "Construyendo las imágenes"
    "${DC[@]}" build
    paso "Aplicando migraciones"
    "${DC[@]}" up -d --wait --wait-timeout 180 db
    migrar
    paso "Arrancando la versión nueva"
    "${DC[@]}" up -d --wait --wait-timeout 180
    "${DC[@]}" ps
    echo "Actualizado a $version (antes: $anterior). Copia previa: $copia"
    ;;
  logs)
    "${DC[@]}" logs -f --tail=100 "$@"
    ;;
  reiniciar)
    paso "Parando (los volúmenes y los datos se conservan)"
    "${DC[@]}" down
    "${DC[@]}" up -d --wait --wait-timeout 180
    "${DC[@]}" ps
    ;;
  copia)
    hacer_copia
    ;;
  restaurar)
    [ $# -ge 1 ] && [ -f "$1" ] || fallo 'Uso: ./deploy/fpdual.sh restaurar <fichero .sql.gz.enc, .sql.gz o .sql>'
    confirmar RESTAURAR "Esto SUSTITUYE los datos actuales por los de $1."
    case "$1" in
      *.enc) lector() { descifrar "$1" | gzip -cd; } ;;
      *.gz) lector() { gzip -cd "$1"; } ;;
      *) lector() { cat "$1"; } ;;
    esac
    lector "$1" | "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"'
    backend_run node scripts/migrate.js status
    "${DC[@]}" restart backend
    ;;
  certificado)
    "${DC[@]}" cp caddy:/data/caddy/pki/authorities/local/root.crt ./fpdual-ca.crt
    cat <<EOF
Exportado ./fpdual-ca.crt (solo la parte pública: se puede repartir).
Instálalo como «entidad de certificación raíz de confianza» en los equipos que
abrirán la aplicación (Windows: doble clic › Instalar certificado › Equipo local ›
Entidades de certificación raíz de confianza). Sin él, el navegador muestra un aviso
que se puede aceptar a mano.
EOF
    ;;
  *)
    # The header comment above, without the leading "# ".
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
    [ -z "$orden" ] || exit 1
    ;;
esac
