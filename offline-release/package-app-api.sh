#!/usr/bin/env bash
set -euo pipefail

[[ ${GITHUB_SHA:?} =~ ^[a-f0-9]{40}$ ]]
release=website-app-api-${GITHUB_SHA:0:12}
stage=$(mktemp -d)
package="$stage/$release"
network="$release-smoke"
postgres="$network-postgres"
api="$network-api"
app="$network-app"
cleanup() {
  docker rm -fv "$app" "$api" "$postgres" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf -- "$stage"
}
trap cleanup EXIT
mkdir -p "$package" dist-offline

for service in app api; do
  tag="${IMAGE_REPO:?}:$service-$GITHUB_SHA"
  digest=$(docker buildx imagetools inspect "$tag" | awk '$1 == "Digest:" && !seen++ {print $2}')
  [[ $digest =~ ^sha256:[a-f0-9]{64}$ ]]
  published="$IMAGE_REPO@$digest"
  image="hackhub-offline/$service:$service-$GITHUB_SHA"
  docker pull --platform linux/amd64 "$published"
  docker tag "$published" "$image"
  printf '%s\n' "$published" >"$package/$service.published-image"
  {
    printf '%s\n' "$digest"
    docker buildx imagetools inspect --raw "$published" | jq -r \
      '.manifests[]? | select(.platform.os == "linux" and .platform.architecture == "amd64") | .digest'
    docker image inspect --format '{{.Id}}' "$image"
  } | sort -u >"$package/$service.image.ids"
done

api_image="hackhub-offline/api:api-$GITHUB_SHA"
app_image="hackhub-offline/app:app-$GITHUB_SHA"
docker image save --output "$package/images.tar" "$api_image" "$app_image"
for service in api app; do
  image="hackhub-offline/$service:$service-$GITHUB_SHA"
  config_id=$(tar -xOf "$package/images.tar" manifest.json | jq -er --arg tag "$image" \
    '.[] | select(.RepoTags | index($tag)) | .Config | split("/") | last | sub("\\.json$"; "") | "sha256:" + .')
  [[ $config_id =~ ^sha256:[a-f0-9]{64}$ ]]
  printf '%s\n' "$config_id" >>"$package/$service.image.ids"
done

wait_for() {
  local container=$1
  shift
  for ((attempt=0; attempt<100; attempt++)); do
    if docker exec "$container" "$@"; then return 0; fi
    if [[ $(docker inspect --format '{{.State.Running}}' "$container") != true ]]; then break; fi
    sleep 2
  done
  docker logs --tail 120 "$container" >&2
  return 1
}

docker network create --internal "$network"
docker run -d --name "$postgres" --network "$network" --network-alias postgres \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=hackhub -e POSTGRES_PASSWORD=hackhub \
  -v "$PWD/app/infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" postgres:16-alpine
wait_for "$postgres" pg_isready -h 127.0.0.1 -U hackhub

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$stage/private.pem" 2>/dev/null
openssl pkey -in "$stage/private.pem" -pubout -out "$stage/public.pem"
# Only API startup, Flyway and HTTP routing are exercised here. The existing frontend
# config still needs the minio hostname to resolve, so point it at an unused loopback port.
docker run -d --name "$api" --network "$network" --network-alias api --add-host minio:127.0.0.1 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/hackhub -e MINIO_ENDPOINT=http://minio:9000 \
  -e "JWT_PRIVATE_KEY=$(cat "$stage/private.pem")" -e "JWT_PUBLIC_KEY=$(cat "$stage/public.pem")" "$api_image"
wait_for "$api" sh -c 'wget -qO- http://127.0.0.1:8081/actuator/health | grep -q '\''"status":"UP"'\'''
docker run -d --name "$app" --network "$network" --add-host minio:127.0.0.1 "$app_image"
wait_for "$app" wget -qO /dev/null http://127.0.0.1/
wait_for "$app" wget -qO /dev/null http://127.0.0.1/api/v1/public/awards

docker exec "$postgres" psql -X -w -At -v ON_ERROR_STOP=1 -U hackhub -d hackhub -c \
  "SELECT script, checksum FROM public.flyway_schema_history WHERE success AND type = 'SQL' AND version IS NOT NULL ORDER BY script" \
  >"$package/api-migrations.txt"
docker exec "$api" sh -c 'cd /app/migrations && printf "%s\n" *.sql' | sort >"$stage/migrations"
cut -d '|' -f 1 "$package/api-migrations.txt" | sort | diff - "$stage/migrations"
docker cp "$api:/app/hackhub-api.jar" "$stage/api.jar"
python3 offline-release/roster-checksums.py "$stage/api.jar" >"$package/api-rosters.sha256"
(cd app/hackhub-api/src/main/resources && sha256sum -c "$package/api-rosters.sha256")

printf '%s\n' "$GITHUB_SHA" >"$package/commit.sha"
cp offline-release/deploy-app-api.sh "$package/deploy.sh"
cp offline-release/roster-checksums.py "$package/roster-checksums.py"
(cd "$package" && sha256sum images.tar api.image.ids app.image.ids api.published-image app.published-image \
  api-migrations.txt api-rosters.sha256 commit.sha deploy.sh roster-checksums.py > SHA256SUMS)
tar -C "$stage" -czf "dist-offline/$release.tar.gz" "$release"
(cd dist-offline && sha256sum "$release.tar.gz" > "$release.tar.gz.sha256")
