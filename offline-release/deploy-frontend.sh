#!/usr/bin/env bash
set -euo pipefail
umask 077
die() { echo "$*" >&2; exit 1; }
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime=${HACKHUB_RUNTIME_DIR:-/opt/hackhub/runtime}
backups=${HACKHUB_BACKUP_DIR:-/opt/hackhub/backups}
sha=$(cat "$package/commit.sha")
[[ $sha =~ ^[a-f0-9]{40}$ ]] || die "Invalid release commit"
new_image="hackhub-offline/app:app-$sha"
release=website-app-${sha:0:12}
unset APP_IMAGE
compose() { bash "$runtime/compose.sh" "$@"; }
image_id() { docker image inspect --format '{{.Id}}' "$1"; }

set_app_image() {
  local temporary
  temporary=$(mktemp "$runtime/.images.env.XXXXXX") || return 1
  awk -v image="$1" '/^APP_IMAGE=/{print "APP_IMAGE=" image; next} {print}' \
    "$runtime/images.env" >"$temporary" &&
    chmod --reference="$runtime/images.env" "$temporary" &&
    mv -- "$temporary" "$runtime/images.env"
}

running_matches() {
  local container_id
  [[ $(docker inspect --format '{{.Config.Image}}' hackhub-app) == "$1" ]] || return 1
  if [[ $(docker inspect --format '{{.Image}}' hackhub-app) == "$(image_id "$1")" ]]; then return 0; fi
  container_id=$(docker inspect --format '{{.Id}}' hackhub-app) && [[ -n $container_id ]] &&
    [[ $(docker ps --no-trunc -q --filter "ancestor=$1" --filter 'name=^/hackhub-app$') == "$container_id" ]]
}

check_app() {
  running_matches "$1" &&
    compose exec -T app wget -qO /dev/null http://127.0.0.1/ &&
    compose exec -T app wget -qO /dev/null http://127.0.0.1/api/v1/public/awards
}

switch_to() {
  set_app_image "$1" && compose config --quiet &&
    compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 app &&
    check_app "$1"
}

rollback() {
  local previous previous_id
  previous=$(cat "$1/app.previous-image") &&
    previous_id=$(cat "$1/app.previous-id") &&
    [[ $(image_id "$previous") == "$previous_id" ]] &&
    switch_to "$previous" &&
    printf 'Frontend rollback complete. APP_IMAGE=%s\n' "$previous"
}

if [[ $# != 0 && ( $# != 2 || ${1:-} != rollback ) ]]; then
  die "Usage: bash $0 [rollback BACKUP_DIRECTORY]"
fi
mkdir -p "$backups"
backups=$(cd "$backups" && pwd)
exec 9>"$backups/.roster-release.lock"
flock -n 9 || die "Another release is in progress"
compose config --quiet
[[ $(grep -c '^APP_IMAGE=' "$runtime/images.env") == 1 ]] || die "Expected one APP_IMAGE in images.env"
configured=$(sed -n 's/^APP_IMAGE=//p' "$runtime/images.env")

if [[ ${1:-} == rollback ]]; then
  backup_dir=$(cd -- "$2" && pwd)
  [[ "$backup_dir" == "$backups"/before-"$release".* ]] || die "Backup belongs to a different release"
  [[ "$configured" == "$new_image" || "$configured" == "$(cat "$backup_dir/app.previous-image")" ]] ||
    die "A different frontend release is configured"
  rollback "$backup_dir"
  exit
fi

(cd "$package" && sha256sum -c SHA256SUMS)
running=$configured
running_matches "$running" ||
  die "Running frontend differs from images.env or its local image tag"
running_id=$(image_id "$running")
if [[ "$running" == "$new_image" ]]; then
  grep -Fxq "$running_id" "$package/image.ids" && check_app "$new_image" ||
    die "Existing frontend failed its image or health check"
  echo "Frontend already deployed and healthy."
  exit
fi

docker load --input "$package/app.tar"
grep -Fxq "$(image_id "$new_image")" "$package/image.ids" || die "Loaded frontend image ID mismatch"
backup_dir=$(mktemp -d "$backups/before-$release.XXXXXX")
printf '%s\n' "$running" >"$backup_dir/app.previous-image"
printf '%s\n' "$running_id" >"$backup_dir/app.previous-id"
printf 'BACKUP=%s\nRollback command: bash %q rollback %q\n' "$backup_dir" "$package/deploy.sh" "$backup_dir"
if switch_to "$new_image"; then
  printf 'Frontend deployed. APP_IMAGE=%s\n' "$new_image"
else
  echo 'Frontend switch failed. Restoring previous image.' >&2
  rollback "$backup_dir" || die "Automatic rollback failed. Backup: $backup_dir"
  exit 1
fi
