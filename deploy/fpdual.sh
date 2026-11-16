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
#   logs [servicio]          follow the logs (backend, db, web, caddy, mailpit)
#   reiniciar                stop and start again; the data stays (never -v)
#   copia                    database dump to backups/ (BACKUP_DIR to change it)
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
  for v in SITE_ADDRESS APP_URL DBPASS DB_ROOT_PASSWORD JWT_SECRET; do
    [ -n "$(valor_env "$v")" ] || falta+=("$v")
  done
  [ ${#falta[@]} -eq 0 ] || fallo "En .env faltan valores: ${falta[*]}"
  local jwt
  jwt="$(valor_env JWT_SECRET)"
  [ "${#jwt}" -ge 32 ] || fallo "JWT_SECRET tiene que tener al menos 32 caracteres (openssl rand -base64 48)."
  if [ "$(valor_env MAIL_MODE)" = "mailpit" ] && [[ "$(valor_env COMPOSE_PROFILES)" != *mailpit* ]]; then
    fallo "MAIL_MODE=mailpit necesita COMPOSE_PROFILES=mailpit en .env (si no, el contenedor de Mailpit no arranca)."
  fi
}

# A one-off backend container for the scripts: works even if the API is not
# healthy yet (for example before the first migration).
backend_run() { "${DC[@]}" run --rm --no-deps -T backend "$@"; }

confirmar() {
  local palabra="$1" texto="$2"
  rojo "$texto"
  read -r -p "Escribe $palabra para continuar: " respuesta
  [ "$respuesta" = "$palabra" ] || fallo "Cancelado."
}

migrar() {
  backend_run node scripts/migrate.js up --yes --allow-production
  backend_run node scripts/migrate.js status
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
    mkdir -p "$BACKUP_DIR"
    fichero="$BACKUP_DIR/fpdual_$(date +%Y%m%d_%H%M%S).sql.gz"
    "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob "$MYSQL_DATABASE"' | gzip > "$fichero"
    chmod 600 "$fichero"
    [ "$(gzip -cd "$fichero" | tail -1 | grep -c 'Dump completed')" = 1 ] || fallo "La copia $fichero parece incompleta."
    echo "Copia: $fichero ($(du -h "$fichero" | cut -f1)). Contiene datos personales: guárdala fuera del servidor."
    ;;
  restaurar)
    [ $# -ge 1 ] && [ -f "$1" ] || fallo 'Uso: ./deploy/fpdual.sh restaurar <fichero .sql o .sql.gz>'
    confirmar RESTAURAR "Esto SUSTITUYE los datos actuales por los de $1."
    if [[ "$1" == *.gz ]]; then lector=(gzip -cd "$1"); else lector=(cat "$1"); fi
    "${lector[@]}" | "${DC[@]}" exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"'
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
