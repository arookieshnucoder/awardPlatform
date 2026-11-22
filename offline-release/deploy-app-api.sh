#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { printf '%s\n' "$*" >&2; exit 1; }
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime=${HACKHUB_RUNTIME_DIR:-/opt/hackhub/runtime}
backups=${HACKHUB_BACKUP_DIR:-/opt/hackhub/backups}
sha=$(cat "$package/commit.sha")
[[ $sha =~ ^[a-f0-9]{40}$ ]] || die 'Invalid release commit'
release=website-app-api-${sha:0:12}
new_api="hackhub-offline/api:api-$sha"
new_app="hackhub-offline/app:app-$sha"
unset API_IMAGE APP_IMAGE
compose() { bash "$runtime/compose.sh" "$@"; }
image_id() { docker image inspect --format '{{.Id}}' "$1"; }

running_matches() {
  local container="hackhub-$1" image=$2 id
  [[ $(docker inspect --format '{{.Config.Image}}' "$container") == "$image" ]] || return 1
  if [[ $(docker inspect --format '{{.Image}}' "$container") == "$(image_id "$image")" ]]; then return 0; fi
  id=$(docker inspect --format '{{.Id}}' "$container") && [[ -n $id ]] &&
    [[ $(docker ps --no-trunc -q --filter "ancestor=$image" --filter "name=^/$container$") == "$id" ]]
}

set_images() {
  local temporary
  temporary=$(mktemp "$runtime/.images.env.XXXXXX") || return 1
  awk -v api="$1" -v app="$2" '
    /^API_IMAGE=/{print "API_IMAGE=" api; next}
    /^APP_IMAGE=/{print "APP_IMAGE=" app; next}
    {print}
  ' "$runtime/images.env" >"$temporary" &&
    chmod --reference="$runtime/images.env" "$temporary" &&
    mv -- "$temporary" "$runtime/images.env"
}

probe_services() {
  running_matches api "$1" && running_matches app "$2" &&
    compose exec -T api wget -qO /dev/null http://localhost:8081/actuator/health </dev/null &&
    compose exec -T app wget -qO /dev/null http://127.0.0.1/ </dev/null &&
    compose exec -T app wget -qO /dev/null http://127.0.0.1/api/v1/public/awards </dev/null
}

switch_to() {
  set_images "$1" "$2" && compose config --quiet &&
    compose up -d --no-deps --no-build --pull never --wait --wait-timeout 300 api </dev/null &&
    compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 --force-recreate app </dev/null &&
    probe_services "$1" "$2"
}

rollback() {
  local directory=$1 previous_api previous_app
  previous_api=$(cat "$directory/api.previous-image") &&
    previous_app=$(cat "$directory/app.previous-image") &&
    [[ $(image_id "$previous_api") == "$(cat "$directory/api.previous-id")" ]] &&
    [[ $(image_id "$previous_app") == "$(cat "$directory/app.previous-id")" ]] &&
    switch_to "$previous_api" "$previous_app" &&
    printf 'Rollback complete. API_IMAGE=%s APP_IMAGE=%s\n' "$previous_api" "$previous_app"
}

check_production_data() (
  local temporary
  temporary=$(mktemp -d)
  trap 'rm -f -- "$temporary/api.jar" "$temporary/rosters" "$temporary/migrations"; rmdir -- "$temporary"' EXIT

  # Confirm the runtime uses the database and Flyway locations checked below.
  compose config --format json | python3 -c '
import json, sys
env = json.load(sys.stdin)["services"]["api"]["environment"]
expected = {
    "SPRING_DATASOURCE_URL": "jdbc:postgresql://postgres:5432/hackhub",
    "SPRING_DATASOURCE_USERNAME": "hackhub",
    "SPRING_FLYWAY_LOCATIONS": "filesystem:/app/migrations",
    "SPRING_FLYWAY_TABLE": "flyway_schema_history",
    "SPRING_FLYWAY_DEFAULT_SCHEMA": "public",
    "SPRING_FLYWAY_SCHEMAS": "public",
}
for key, value in expected.items():
    if env.get(key, value) != value:
        sys.exit(f"Unexpected production setting: {key}")
for key in ("SPRING_APPLICATION_JSON", "SPRING_CONFIG_LOCATION", "SPRING_CONFIG_ADDITIONAL_LOCATION"):
    if env.get(key):
        sys.exit(f"Cannot verify custom production configuration: {key}")
' || die 'Production database configuration could not be verified. Images unchanged.'

  compose exec -T -e 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000' \
    postgres psql -X -w -At -v ON_ERROR_STOP=1 -U hackhub -d hackhub -c \
    "SELECT script, checksum FROM public.flyway_schema_history WHERE success AND type = 'SQL' AND version IS NOT NULL ORDER BY script" \
    </dev/null >"$temporary/migrations" || die 'Could not read production Flyway history. Images unchanged.'
  diff -u "$package/api-migrations.txt" "$temporary/migrations" ||
    die 'Production Flyway migrations differ from the new image. Images unchanged.'
  docker cp hackhub-api:/app/hackhub-api.jar "$temporary/api.jar" ||
    die 'Could not read the running API JAR. Images unchanged.'
  python3 "$package/roster-checksums.py" "$temporary/api.jar" >"$temporary/rosters" &&
    cmp -s "$package/api-rosters.sha256" "$temporary/rosters" ||
    die 'Employee rosters differ from the running API. Images unchanged.'
  printf 'Production checks passed. Flyway history and both packaged rosters match.\n'
)

if [[ $# != 0 && ( $# != 2 || ${1:-} != rollback ) ]]; then
  die "Usage: bash $0 [rollback BACKUP_DIRECTORY]"
fi
mkdir -p "$backups"
backups=$(cd -- "$backups" && pwd)
exec 9>"$backups/.roster-release.lock"
flock -n 9 || die 'Another release is in progress'
compose config --quiet
[[ $(grep -c '^API_IMAGE=' "$runtime/images.env") == 1 && $(grep -c '^APP_IMAGE=' "$runtime/images.env") == 1 ]] ||
  die 'Expected one API_IMAGE and one APP_IMAGE in images.env'
old_api=$(sed -n 's/^API_IMAGE=//p' "$runtime/images.env")
old_app=$(sed -n 's/^APP_IMAGE=//p' "$runtime/images.env")

if [[ ${1:-} == rollback ]]; then
  backup_dir=$(cd -- "$2" && pwd)
  [[ "$backup_dir" == "$backups"/before-"$release".* ]] || die 'Backup belongs to a different release'
  [[ "$old_api" == "$new_api" || "$old_api" == "$(cat "$backup_dir/api.previous-image")" ]] &&
    [[ "$old_app" == "$new_app" || "$old_app" == "$(cat "$backup_dir/app.previous-image")" ]] ||
    die 'A different release is configured'
  rollback "$backup_dir" || die "Rollback failed. Backup: $backup_dir"
  exit
fi

(cd "$package" && sha256sum -c SHA256SUMS)
running_matches api "$old_api" && running_matches app "$old_app" ||
  die 'Running frontend or API differs from images.env or its local tag'
old_api_id=$(image_id "$old_api")
old_app_id=$(image_id "$old_app")
check_production_data
if [[ "$old_api" != "$new_api" || "$old_app" != "$new_app" ]]; then
  if [[ "$old_api" == "$new_api" ]]; then grep -Fxq "$old_api_id" "$package/api.image.ids"; fi
  if [[ "$old_app" == "$new_app" ]]; then grep -Fxq "$old_app_id" "$package/app.image.ids"; fi
  docker load --input "$package/images.tar"
fi
grep -Fxq "$(image_id "$new_api")" "$package/api.image.ids" &&
  grep -Fxq "$(image_id "$new_app")" "$package/app.image.ids" || die 'Loaded API or frontend image ID mismatch'
if [[ "$old_api" == "$new_api" && "$old_app" == "$new_app" ]]; then
  probe_services "$new_api" "$new_app" || die 'Existing release failed its health check'
  echo 'API and frontend already deployed and healthy.'
  exit
fi

backup_dir=$(mktemp -d "$backups/before-$release.XXXXXX")
cp -p "$runtime/images.env" "$backup_dir/images.env"
printf '%s\n' "$old_api" >"$backup_dir/api.previous-image"
printf '%s\n' "$old_api_id" >"$backup_dir/api.previous-id"
printf '%s\n' "$old_app" >"$backup_dir/app.previous-image"
printf '%s\n' "$old_app_id" >"$backup_dir/app.previous-id"
printf 'BACKUP=%s\nRollback command: bash %q rollback %q\n' "$backup_dir" "$package/deploy.sh" "$backup_dir"

if switch_to "$new_api" "$new_app"; then
  printf 'API and frontend deployed. RELEASE=%s BACKUP=%s\n' "$release" "$backup_dir"
else
  compose logs --no-color --tail=150 api app </dev/null >"$backup_dir/deployment-failure.log" 2>&1 || true
  printf 'Switch failed. Restoring previous images. Log: %s/deployment-failure.log\n' "$backup_dir" >&2
  rollback "$backup_dir" || die "Automatic rollback failed. Backup: $backup_dir"
  exit 1
fi
