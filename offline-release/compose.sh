#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ -f .env && -f images.env ]] || {
  echo 'Create .env and images.env in this directory first.' >&2
  exit 1
}
compose_files=(-f compose.yml)
if [[ -f compose.sso.yml ]]; then
  compose_files+=(-f compose.sso.yml)
fi
exec docker compose --env-file .env --env-file images.env "${compose_files[@]}" "$@"
