#!/usr/bin/env bash
set -euo pipefail

[[ ${GITHUB_SHA:?} =~ ^[a-f0-9]{40}$ && ${IMAGE_DIGEST:?} =~ ^sha256:[a-f0-9]{64}$ ]]
release=website-app-${GITHUB_SHA:0:12}
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/$release" dist-offline
package="$stage/$release"
image="hackhub-offline/app:app-$GITHUB_SHA"
published="${IMAGE_REPO:?}@$IMAGE_DIGEST"
docker pull --platform linux/amd64 "$published"
docker tag "$published" "$image"

# Resolve the same two upstream names as production for the isolated smoke test.
probe=$(docker run -d --network none --add-host api:127.0.0.1 --add-host minio:127.0.0.1 "$image")
trap 'docker rm -f "$probe" >/dev/null; rm -rf -- "$stage"' EXIT
docker exec "$probe" nginx -t
docker exec "$probe" nginx -v
for attempt in {1..10}; do
  if docker exec "$probe" wget -qO /dev/null http://127.0.0.1/; then break; fi
  if [[ $attempt == 10 ]]; then docker logs "$probe"; exit 1; fi
  sleep 1
done

docker image save -o "$package/app.tar" "$image"
# Docker's classic and containerd image stores report different IDs for the same image.
{
  echo "$IMAGE_DIGEST"
  docker buildx imagetools inspect --raw "$published" | jq -r \
    '.manifests[]? | select(.platform.os == "linux" and .platform.architecture == "amd64") | .digest'
  tar -xOf "$package/app.tar" manifest.json | jq -er --arg tag "$image" \
    '.[] | select(.RepoTags | index($tag)) | .Config | split("/") | last | sub("\\.json$"; "") | "sha256:" + .'
} | sort -u >"$package/image.ids"
grep -Fxq "$(docker image inspect --format '{{.Id}}' "$image")" "$package/image.ids"
printf '%s\n' "$GITHUB_SHA" >"$package/commit.sha"
printf '%s\n' "$published" >"$package/published-image.txt"
cp offline-release/deploy-frontend.sh "$package/deploy.sh"
(cd "$package" && sha256sum app.tar image.ids commit.sha published-image.txt > SHA256SUMS)
tar -C "$stage" -czf "dist-offline/$release.tar.gz" "$release"
(cd dist-offline && sha256sum "$release.tar.gz" > "$release.tar.gz.sha256")
