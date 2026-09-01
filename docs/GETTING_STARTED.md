# Getting Started with QuarkBox

QuarkBox is a secure, elastic cloud sandbox & multi-service cluster platform for AI coding agents and developers. This guide walks you through running the full stack locally and creating your first sandbox.

## Prerequisites

- **Node.js >= 20** (npm workspaces monorepo)
- **Docker Engine / Docker Desktop** (required — sandboxes run as containers)
- **Go >= 1.22** (only needed for the `quarkbox` CLI)

---

## 1. Install dependencies

From the repository root:

```bash
npm install
```

This installs all workspaces: `packages/api`, `packages/sdk`, `packages/mcp-server`, `packages/dashboard`, `packages/cli`, and `packages/sdk-python`.

---

## 2. Start the infrastructure with Docker Compose

The API talks to the local Docker daemon (for sandboxes) and optionally Postgres + Redis. The compose file lives at `deploy/docker/docker-compose.yml`.

```bash
npm run dev
```

This runs `docker compose up -d` for Postgres and Redis, then starts the API in dev mode. Alternatively, start pieces explicitly:

```bash
docker compose -f deploy/docker/docker-compose.yml up -d   # Postgres + Redis
npm run dev:api                                            # NestJS API on :3000
npm run dev:dashboard                                      # Next.js dashboard on :3001
```

> **Compose note:** the default compose stack is Postgres + Redis + optional pgAdmin (run with `--profile tools`). If you don't need Postgres/Redis for a simple test, ensure you have a local `quarkbox.db` writable by the API and Docker running.

---

## 3. Configure environment variables

Copy the example and adjust values. The API reads a `.env` file from `packages/api`.

```bash
cp deploy/docker/.env.example packages/api/.env
```

At minimum, set these before running:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `JWT_SECRET` | **Required** — secret used to sign auth tokens. The API refuses to start without it. | a long random string |
| `DATABASE_HOST` / `DATABASE_PASSWORD` | Postgres connection (if using Postgres) | localhost / strong password |
| `POSTGRES_USER` / `POSTGRES_DB` | Postgres role / database name | quarkbox |
| `REDIS_PASSWORD` | Redis auth password | strong password |
| `CORS_ORIGIN` | Allowed browser origin (default `http://localhost:3001`) | `http://localhost:3000` |
| `PORT` | API listen port (default `3000`) | `3000` |
| `DOCKER_SOCKET` | Docker socket path (default `/var/run/docker.sock`) | `/var/run/docker.sock` |
| `SANDBOX_NETWORK` | Docker network for sandboxes (default `quarkbox-sandboxes`) | `quarkbox-sandboxes` |

Generate a strong `JWT_SECRET`:

```bash
# macOS / Linux
openssl rand -hex 64
```

> **Warning:** Never commit `.env` or use the example `changeme` passwords in production. See `docs/DEPLOYMENT.md`.

---

## 4. Verify the API is up

```bash
curl http://localhost:3000/api/health
```

Expect:

```json
{
  "status": "ok",
  "service": "quarkbox-api",
  "version": "0.1.0",
  "timestamp": "2026-08-31T00:00:00.000Z",
  "uptime": 12.34
}
```

Interactive Swagger docs are available at `http://localhost:3000/api/docs` (disabled in production).

---

## 5. Authenticate and create your first sandbox

### 5a. Register (or log in) to get a token

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a-very-strong-pass","name":"You"}'
```

Save the `token` from the response. (Reuse it — it authenticates all subsequent calls.)

### 5b. Create a sandbox

```bash
curl -X POST http://localhost:3000/api/sandboxes \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-first-sandbox",
    "image": "python:3.12-slim",
    "cpuLimit": 1,
    "memoryLimit": "512m"
  }'
```

Note the `id` in the response.

### 5c. Run a command inside the sandbox

```bash
curl -X POST http://localhost:3000/api/sandboxes/<id>/exec \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"command":"python --version"}'
```

### 5d. Tear down

```bash
curl -X DELETE http://localhost:3000/api/sandboxes/<id> -H "Authorization: Bearer <token>"
```

---

## 6. Using the TypeScript SDK

```bash
cd packages/sdk
```

```typescript
import { QuarkBox } from '@samuelvinay91/quarkbox-sdk';

const qb = new QuarkBox({
  apiUrl: 'http://localhost:3000/api',
  apiKey: 'qbk_<your-key>', // or authToken: '<jwt>'
});

const sandbox = await qb.sandboxes.create({ name: 'my-env', image: 'python:3.12-slim' });
const result = await sandbox.exec('echo hello');
console.log(result.stdout);
await sandbox.remove();
```

> The SDK enforces HTTPS for all non-`localhost` URLs, validates inputs, and retries GET/HEAD requests on network errors.

---

## 7. Using the MCP server

```bash
cd packages/mcp-server && npm run build && npm start
```

The MCP server exposes tools such as `launch_cluster`, `launch_golden_template`, `exec_command`, and `get_sandbox_stats` for AI agents (Claude Code, Cursor, etc.).

---

## 8. Using the Go CLI

```bash
cd packages/cli && go build -o bin/quarkbox main.go

./packages/cli/bin/quarkbox health
./packages/cli/bin/quarkbox template list
./packages/cli/bin/quarkbox template launch nextjs15-fullstack-dev --name my-app
./packages/cli/bin/quarkbox sandbox exec <id> -- node -v
./packages/cli/bin/quarkbox sandbox stats <id>
./packages/cli/bin/quarkbox cluster list
```

---

## Next steps

- Read the full API reference: [`packages/api/API.md`](../packages/api/API.md)
- Deploy to production: [`docs/DEPLOYMENT.md`](DEPLOYMENT.md)
- Understand the security model: [`docs/SECURITY.md`](SECURITY.md)
- Troubleshoot issues: [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- Schema & data migration: [`docs/MIGRATION.md`](MIGRATION.md)
