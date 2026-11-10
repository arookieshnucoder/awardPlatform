#!/usr/bin/env bash
# Usage: bash offline-release/package.sh VERSION [all|api|app|infra]
set -euo pipefail
umask 077
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=${1:-}
SCOPE=${2:-all}
[[ "$VERSION" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,79}$ ]] || {
  echo 'Usage: package.sh VERSION [all|api|app|infra]' >&2; exit 1;
}
case "$SCOPE" in all|api|app|infra) ;; *) echo 'Invalid scope' >&2; exit 1 ;; esac
PLATFORM=${PLATFORM:-linux/amd64}
case "$PLATFORM" in linux/amd64|linux/arm64) ;; *) echo 'Unsupported PLATFORM' >&2; exit 1 ;; esac
docker compose version >/dev/null
OUT="$ROOT/offline-release/releases/$VERSION-$SCOPE"
[[ ! -e "$OUT" ]] || { echo 'Output directory already exists; use a new version.' >&2; exit 1; }
services=()
case "$SCOPE" in
  all) services=(app api postgres minio minio-init) ;;
  infra) services=(postgres minio minio-init) ;;
  *) services=("$SCOPE") ;;
esac
for service in "${services[@]}"; do
  if docker image inspect "hackhub-offline/$service:$VERSION" >/dev/null 2>&1; then
    echo "Version already exists for $service; use a new version." >&2; exit 1
  fi
done
mkdir -p "$OUT/images" "$OUT/deploy/infra/postgres" "$OUT/deploy/infra/minio"
cp "$ROOT/offline-release/compose.yml" "$ROOT/offline-release/compose.sh" \
  "$ROOT/offline-release/server.env.example" "$ROOT/offline-release/README.md" "$OUT/deploy/"
cp "$ROOT/app/infra/postgres/init.sql" "$OUT/deploy/infra/postgres/"
cp "$ROOT/app/infra/minio/init.sh" "$OUT/deploy/infra/minio/"
# Mounted initialization files must be readable by container service users.
find "$OUT/deploy" -type d -exec chmod 755 {} +
find "$OUT/deploy" -type f -exec chmod 644 {} +
OVERRIDE=$(mktemp)
trap 'rm -f "$OVERRIDE"' EXIT
cat > "$OVERRIDE" <<EOF
services:
  app:
    image: hackhub-offline/app:$VERSION
    platform: $PLATFORM
  api:
    image: hackhub-offline/api:$VERSION
    platform: $PLATFORM
EOF
: > "$OUT/images.env"
printf 'service\timage\timage_id\tplatform\n' > "$OUT/manifest.tsv"
for service in "${services[@]}"; do
  target="hackhub-offline/$service:$VERSION"
  case "$service" in
    app|api)
      # A separate project and tags leave the running deployment untouched.
      docker compose --project-directory "$ROOT/app" -p hackhub-package \
        -f "$ROOT/app/docker-compose.yml" -f "$OVERRIDE" build "$service"
      ;;
    *)
      case "$service" in
        postgres) source_image=postgres:16-alpine ;;
        minio) source_image=minio/minio:latest ;;
        minio-init) source_image=minio/mc:latest ;;
      esac
      # Reuse the locally validated dependency version; do not silently upgrade latest.
      if ! docker image inspect "$source_image" >/dev/null 2>&1; then
        docker pull --platform "$PLATFORM" "$source_image"
      fi
      docker tag "$source_image" "$target"
      ;;
  esac
  actual=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$target")
  [[ "$actual" == "$PLATFORM" ]] || {
    echo "Wrong architecture for $service: $actual (expected $PLATFORM)" >&2; exit 1;
  }
  key=$(printf '%s' "$service" | tr '[:lower:]-' '[:upper:]_')
  printf '%s_IMAGE=%s\n' "$key" "$target" >> "$OUT/images.env"
  id=$(docker image inspect --format '{{.Id}}' "$target")
  printf '%s\t%s\t%s\t%s\n' "$service" "$target" "$id" "$actual" >> "$OUT/manifest.tsv"
  docker image save -o "$OUT/images/$service.tar.partial" "$target"
  mv "$OUT/images/$service.tar.partial" "$OUT/images/$service.tar"
done
tar -C "$OUT/deploy" -cf "$OUT/deploy-config.tar" .
(
  cd "$OUT"
  sha256sum images/*.tar images.env manifest.tsv deploy-config.tar > SHA256SUMS
)
printf '\nPackage ready: %s\n' "$OUT"
du -h "$OUT"/images/*.tar "$OUT/deploy-config.tar"
