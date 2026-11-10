# Deployment Runbook

## Quick deploy (Docker Compose)

```bash
# Full stack — first time or after config changes
docker compose up -d --build

# Frontend only — after hackhub-app changes
cd hackhub-app && npm run build
docker compose cp hackhub-app/dist/. app:/usr/share/nginx/html/

# API only — after hackhub-api changes
docker compose build api --no-cache
docker compose up -d --force-recreate api
```

> **Important**: `docker compose restart api` reuses the old image. Always use `up -d --force-recreate api` after a `build` to guarantee the new image is running.

## Environment variables

Copy `.env.example` to `.env` before first run. Required:

| Variable | Where set | Notes |
|---|---|---|
| `JWT_PRIVATE_KEY` | `.env` | RS256 PEM — generate with `scripts/generate-keys.sh` |
| `JWT_PUBLIC_KEY` | `.env` | Matching public key |
| `SPRING_DATASOURCE_PASSWORD` | `.env` | Postgres password |
| `MINIO_SECRET_KEY` | `.env` | MinIO secret |
| `APP_CORS_ALLOWED_ORIGINS` | `.env` or Compose default | Production default: `https://cnaward.bosch-datanexus.com`. Multiple origins must be comma-separated without spaces. |

## Production domain

The production URL is `https://cnaward.bosch-datanexus.com`. Base Compose allows this
origin along with `http://localhost:5173` and `http://localhost` for local development;
the production override defaults to the HTTPS origin only. The offline Compose files
use the same defaults. The frontend uses same-origin `/api/` requests by default, so
`VITE_API_BASE_URL` does not need to be set to the production domain.

An existing `APP_CORS_ALLOWED_ORIGINS` in `.env` or the shell overrides these defaults.
On an existing production server, update that setting to:

```dotenv
APP_CORS_ALLOWED_ORIGINS=https://cnaward.bosch-datanexus.com
```

Use the exact origin, without `/login` or a trailing slash. From the deployment
directory, recreate only the API using the same Compose files, project name and
environment file as the original deployment. For the standard production setup:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --no-deps --no-build --pull never --force-recreate api

# Verify only the non-secret CORS setting.
docker exec hackhub-api printenv APP_CORS_ALLOWED_ORIGINS
```

This briefly interrupts the API. A container restart alone does not apply changed
environment variables. After the API is healthy, verify CORS through the local frontend:

```bash
curl -sS --max-time 15 -D - -o /dev/null \
  -X OPTIONS 'http://127.0.0.1/api/v1/auth/login' \
  -H 'Origin: https://cnaward.bosch-datanexus.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expect HTTP 200 and `Access-Control-Allow-Origin: https://cnaward.bosch-datanexus.com`,
then verify login in the browser. DNS and HTTPS routing to this deployment must be
configured separately; changing CORS does not configure DNS or issue a TLS certificate.

## Database

Flyway runs automatically on API startup and applies any pending migrations. To reset:

```bash
# Wipe app data, keep Flyway history
bash scripts/reset-db.sh

# Re-seed test data
bash scripts/test-up.sh
```

## Health check

```bash
# API health (management port)
curl http://localhost:8081/actuator/health

# Frontend
curl -I http://localhost
```

## Rollback

```bash
# Roll back to previous API image
docker compose up -d --force-recreate api  # if previous image is still tagged

# Roll back database: not supported automatically
# Restore from pg_dump snapshot taken before the deployment
```

## Production checklist

- [ ] `APP_CORS_ALLOWED_ORIGINS` set to production domain only
- [ ] `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` generated fresh (not dev defaults)
- [ ] PostgreSQL running with persistent volume
- [ ] MinIO running with persistent volume
- [ ] HTTPS termination in front of Nginx (Caddy or similar)
- [ ] Port 8081 (management) NOT exposed publicly
