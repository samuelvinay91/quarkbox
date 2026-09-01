# QuarkBox API Reference

This document describes the REST API exposed by the QuarkBox control-plane gateway (`packages/api`). It is generated from the actual controller routes in `packages/api/src` and reflects the current implementation.

- **Base URL**: all routes are served under the `/api` global prefix (e.g. `http://localhost:3000/api/sandboxes`).
- **Format**: JSON request/response bodies.
- **Interactive docs**: Swagger UI is enabled in non-production environments at `/api/docs`.
- **Authentication**: most endpoints require a JWT Bearer token (see [Authentication](#authentication)).

---

## Authentication

All endpoints except the explicitly public ones (`/auth/register`, `/auth/login`, `/auth/dev-token`, `/health`) are protected by the global `JwtAuthGuard`. Requests must include:

```
Authorization: Bearer <token>
```

Tokens are signed with `JWT_SECRET`. The token payload carries `sub` (user id), `email`, and `name`. If `JWT_SECRET` is not set, the API will fail to start.

### Request lifecycle

- **Validation**: a global `ValidationPipe` is applied. Unknown body fields (`forbidNonWhitelisted`) and malformed payloads return `400 Bad Request`.
- **Rate limiting**: the global `ThrottlerGuard` allows **100 requests per 60 seconds** per client. Exceeded requests return `429 Too Many Requests`.
- **CORS**: the API enforces `CORS_ORIGIN` (default `http://localhost:3001`).

### Activity

Every state change and command execution is recorded to an append-only audit ledger (SOC2-compatible).

---

## Endpoints

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register a new user |
| `POST` | `/api/auth/login` | Public | Login and receive a JWT |
| `POST` | `/api/auth/dev-token` | Public (dev only) | Generate a development token |
| `POST` | `/api/auth/api-key` | Bearer | Generate a programmatic API key |
| `GET` | `/api/auth/me` | Bearer | Get current user info |
| `GET` | `/api/health` | Public | Health check |
| `POST` | `/api/sandboxes` | Bearer | Create a sandbox |
| `GET` | `/api/sandboxes` | Bearer | List sandboxes |
| `GET` | `/api/sandboxes/:id` | Bearer | Get a sandbox |
| `PUT` | `/api/sandboxes/:id` | Bearer | Update sandbox metadata |
| `DELETE` | `/api/sandboxes/:id` | Bearer | Delete a sandbox |
| `POST` | `/api/sandboxes/:id/start` | Bearer | Start a sandbox |
| `POST` | `/api/sandboxes/:id/stop` | Bearer | Stop a sandbox |
| `POST` | `/api/sandboxes/:id/pause` | Bearer | Pause a sandbox |
| `POST` | `/api/sandboxes/:id/resume` | Bearer | Resume a paused sandbox |
| `POST` | `/api/sandboxes/:id/exec` | Bearer | Execute a command |
| `POST` | `/api/sandboxes/:id/run-python` | Bearer | Run a Python code block |
| `GET` | `/api/sandboxes/:id/stats` | Bearer | Get container resource metrics |
| `GET` | `/api/snapshots` | Bearer | List snapshots |
| `GET` | `/api/snapshots/:id` | Bearer | Get a snapshot |
| `POST` | `/api/snapshots/sandbox/:sandboxId` | Bearer | Create a snapshot |
| `POST` | `/api/snapshots/sandbox/:sandboxId/fork` | Bearer | Fork a sandbox from a snapshot |
| `DELETE` | `/api/snapshots/:id` | Bearer | Delete a snapshot |
| `GET` | `/api/clusters` | Bearer | List clusters |
| `GET` | `/api/clusters/:id` | Bearer | Get a cluster |
| `POST` | `/api/clusters` | Bearer | Create a cluster |
| `POST` | `/api/clusters/:id/stop` | Bearer | Stop all nodes in a cluster |
| `DELETE` | `/api/clusters/:id` | Bearer | Destroy a cluster |
| `GET` | `/api/activities` | Bearer | Get global activity feed |
| `GET` | `/api/activities/stats` | Bearer | Get activity statistics |
| `GET` | `/api/activities/sandbox/:sandboxId` | Bearer | Get activity for a sandbox |
| `GET` | `/api/activities/export/soc2` | Bearer | Export signed audit ledger |
| `GET` | `/api/webhooks/events` | Bearer | List webhook event types |
| `GET` | `/api/webhooks` | Bearer | List webhooks |
| `POST` | `/api/webhooks` | Bearer | Create a webhook |
| `DELETE` | `/api/webhooks/:id` | Bearer | Delete a webhook |
| `GET` | `/api/plan` | Bearer | Get current plan and usage |
| `GET` | `/api/proxy/:sandboxId/ports` | Bearer | Get preview URLs for active ports |
| `*` | `/api/proxy/:sandboxId/:port/*` | Bearer | Proxy HTTP traffic to a sandbox port |

> **Error responses.** Authentication failures return `401 Unauthorized` from the global guard. Resources that are not found or do not belong to the caller return `404 Not Found`. Access to another user's resources is prevented by ownership checks in every service.

---

## Authentication

### `POST /api/auth/register`

Register a new user. **Public** — no bearer token required.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "correct-horse-battery-staple",
  "name": "Ada Lovelace"
}
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `email` | string | yes | Must match an email format |
| `password` | string | yes | At least 8 characters |
| `name` | string | no | Display name |

**Response `201 Created`:**

```json
{
  "user": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "user@example.com",
    "name": "Ada Lovelace",
    "isActive": true,
    "role": "user",
    "plan": "free"
  },
  "token": "<jwt>"
}
```

**Errors:** `400` (invalid email or short password), `409` (email already registered).

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"correct-horse-battery-staple","name":"Ada"}'
```

### `POST /api/auth/login`

Authenticate and receive a JWT. **Public.**

**Request body:**

```json
{ "email": "user@example.com", "password": "correct-horse-battery-staple" }
```

**Response `200 OK`:**

```json
{
  "user": { "id": "9b1deb4d-...", "email": "user@example.com", "name": "Ada" },
  "token": "<jwt>"
}
```

**Errors:** `401` (invalid credentials).

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"correct-horse-battery-staple"}'
```

### `POST /api/auth/dev-token`

Generate a development token (**dev only**). **Public**, but returns `404` when `NODE_ENV === 'production'`. Do not rely on this endpoint in any production deployment.

**Response `200 OK`:**

```json
{
  "token": "<jwt>",
  "expiresIn": "24h",
  "usage": "Set as Authorization: Bearer <token> header"
}
```

### `POST /api/auth/api-key`

Generate a programmatic API key (for SDK/CLI). Requires a **Bearer JWT**.

**Response `200 OK`:** returns the key exactly once. Store it securely; the raw key is not retrievable later.

```json
{ "id": "<uuid>", "key": "qbk_<hex>" }
```

```bash
curl -X POST http://localhost:3000/api/auth/api-key \
  -H "Authorization: Bearer <token>"
```

### `GET /api/auth/me`

Return the currently authenticated user. Requires a **Bearer JWT**.

**Response `200 OK`:**

```json
{
  "id": "9b1deb4d-...",
  "email": "user@example.com",
  "name": "Ada Lovelace"
}
```

---

## Health

### `GET /api/health`

**Public.** Used for liveness/readiness probes.

**Response `200 OK`:**

```json
{
  "status": "ok",
  "service": "quarkbox-api",
  "version": "0.1.0",
  "timestamp": "2026-08-31T00:00:00.000Z",
  "uptime": 123.45
}
```

---

## Sandboxes

All sandbox endpoints require a **Bearer JWT**. `:id` and all path params are UUIDs validated with `ParseUUIDPipe`.

The `SandboxResponseDto` shape is returned by create, get, list, update, start, stop, pause, and resume:

```json
{
  "id": "9b1deb4d-...",
  "name": "my-dev-env",
  "description": "Python ML sandbox",
  "status": "running",
  "runtime": "docker",
  "image": "python:3.12-slim",
  "containerIp": "172.18.0.3",
  "cpuLimit": 2,
  "memoryLimit": "1g",
  "ports": { "8080": "8080" },
  "envVars": { "NODE_ENV": "development" },
  "labels": { "project": "ml-pipeline" },
  "createdAt": "2026-08-31T00:00:00.000Z",
  "updatedAt": "2026-08-31T00:00:00.000Z",
  "lastActiveAt": "2026-08-31T00:00:00.000Z"
}
```

### `POST /api/sandboxes`

Create a new sandbox.

**Request body:**

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | yes | — | Start alphanumeric; only `[a-zA-Z0-9_-]`, max 255 |
| `description` | string | no | — | Max 500 chars |
| `image` | string | no | `ubuntu:22.04` | Container image |
| `runtime` | string | no | `docker` | `docker` (see `SandboxRuntime` enum) |
| `cpuLimit` | int | no | `1` | 1–16 cores |
| `memoryLimit` | string | no | `512m` | Format `\d+[mg]` e.g. `512m`, `2g` |
| `diskLimit` | string | no | `10g` | Format `\d+[mg]` |
| `ports` | object | no | — | `{ containerPort: hostPort }` (max 10 mappings) |
| `envVars` | object | no | — | `{ KEY: value }` |
| `labels` | object | no | — | `{ key: value }` |

> Resource limits are clamped against the caller's plan (see `GET /api/plan`). Requested values above plan limits are silently capped.

**Response `201 Created`:** `SandboxResponseDto` (above).

**Errors:** `400` (validation/name pattern), `429` (rate limit), plus quota limit errors (407/quota message) when the caller exceeds concurrent or daily sandbox limits.

```bash
curl -X POST http://localhost:3000/api/sandboxes \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-dev-env",
    "image": "python:3.12-slim",
    "cpuLimit": 2,
    "memoryLimit": "1g",
    "ports": { "8080": "8080" }
  }'
```

### `GET /api/sandboxes`

List all sandboxes owned by the authenticated user.

**Response `200 OK`:** array of `SandboxResponseDto`.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/sandboxes
```

### `GET /api/sandboxes/:id`

Get a single sandbox by UUID.

**Errors:** `404` (not found or not owned).

### `PUT /api/sandboxes/:id`

Update sandbox metadata. Accepts any subset of the create fields (`name`, `image`, `cpuLimit`, `memoryLimit`, `diskLimit`, `ports`, `envVars`, `labels`).

**Response `200 OK`:** `SandboxResponseDto`.

```bash
curl -X PUT http://localhost:3000/api/sandboxes/<id> \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"renamed-sandbox","cpuLimit":4}'
```

### `DELETE /api/sandboxes/:id`

Delete a sandbox. **Response `204 No Content`.**

```bash
curl -X DELETE http://localhost:3000/api/sandboxes/<id> -H "Authorization: Bearer <token>"
```

### `POST /api/sandboxes/:id/start`

Start a stopped/paused sandbox. **Response `200 OK`:** `SandboxResponseDto`.

### `POST /api/sandboxes/:id/stop`

Stop a running sandbox. **Response `200 OK`:** `SandboxResponseDto`.

### `POST /api/sandboxes/:id/pause`

Pause a running sandbox. **Response `200 OK`:** `SandboxResponseDto`.

### `POST /api/sandboxes/:id/resume`

Resume a paused sandbox. **Response `200 OK`:** `SandboxResponseDto`.

### `POST /api/sandboxes/:id/exec`

Execute a command inside a running sandbox.

**Request body:**

```json
{ "command": "echo Hello from QuarkBox", "workdir": "/workspace" }
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `command` | string | yes | Command to execute |
| `workdir` | string | no | Working directory (default `/workspace`) |

**Response `200 OK` (`ExecResultDto`):**

```json
{ "exitCode": 0, "stdout": "Hello from QuarkBox\n", "stderr": "" }
```

> Execution has a 2-minute timeout and a 5 MB output cap.

```bash
curl -X POST http://localhost:3000/api/sandboxes/<id>/exec \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"command":"python --version"}'
```

### `POST /api/sandboxes/:id/run-python`

Execute a Python code block natively inside the sandbox (Agent SDK / MCP use).

**Request body:**

```json
{ "code": "import pandas as pd\nprint('Hello')" }
```

**Response `200 OK`:** `ExecResultDto` (`{ exitCode, stdout, stderr }`).

### `GET /api/sandboxes/:id/stats`

Get real-time container resource metrics (CPU, memory, network, I/O from Docker stats API).

**Response `200 OK`:** raw Docker stats payload for the sandbox container.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/sandboxes/<id>/stats
```

---

## Snapshots

All snapshot endpoints require a **Bearer JWT**.

> **Note:** The current implementation exposes create, list, get, fork, and remove. A snapshot **restore** endpoint is *not* currently exposed via the REST controller (a `snapshot.restored` webhook event type exists for future use).

### `POST /api/snapshots/sandbox/:sandboxId`

Create a snapshot from an existing sandbox.

**Request body:**

```json
{ "name": "before-upgrade", "description": "State before v2 upgrade" }
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | yes | Max 255 chars |
| `description` | string | no | Max 500 chars |

**Response `201 Created`:** snapshot record with `id`, `name`, `status`, timestamps.

**Errors:** `400` (validation), `404` (sandbox not found/not owned).

```bash
curl -X POST http://localhost:3000/api/snapshots/sandbox/<sandboxId> \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"before-upgrade","description":"pre-v2"}'
```

### `GET /api/snapshots`

List snapshots. Optional query `?sandboxId=<uuid>` filters by a specific sandbox.

### `GET /api/snapshots/:id`

Get a single snapshot by UUID. **Errors:** `404`.

### `POST /api/snapshots/sandbox/:sandboxId/fork`

1-Click fork: clone a sandbox with all files and state.

**Request body:**

```json
{ "forkName": "my-branch-env" }
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `forkName` | string | yes | Max 255 chars |

**Response:** the newly forked sandbox record.

```bash
curl -X POST http://localhost:3000/api/snapshots/sandbox/<sandboxId>/fork \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"forkName":"my-branch-env"}'
```

### `DELETE /api/snapshots/:id`

Delete a snapshot. **Response `204 No Content`.**

---

## Clusters

All cluster endpoints require a **Bearer JWT**.

### `POST /api/clusters`

Spin up an entire multi-sandbox cluster topology atomically over a private isolated bridge network with internal DNS.

**Request body:**

```json
{
  "name": "frontend-backend-db",
  "metadata": { "env": "staging" },
  "nodes": [
    { "name": "frontend", "templateSlug": "nextjs15-fullstack-dev", "networkAlias": "frontend" },
    {
      "name": "backend",
      "image": "python:3.12-slim",
      "cpuLimit": 2,
      "memoryLimit": "1g",
      "ports": { "8000": "8000" },
      "envVars": {},
      "networkAlias": "backend"
    }
  ]
}
```

`ClusterNodeConfig` fields:

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | yes | Node name |
| `templateSlug` | string | no | Golden Marketplace template (resolves image/ports) |
| `image` | string | no | Image override (default `ubuntu:22.04`) |
| `cpuLimit` | int | no | Defaults to `2` |
| `memoryLimit` | string | no | Defaults to `1g` |
| `envVars` | object | no | Extra env vars |
| `networkAlias` | string | yes | Internal DNS alias for the node |
| `ports` | object | no | `{ containerPort: hostPort }` |

**Response `201 Created`:**

```json
{
  "cluster": { "id": "...", "name": "frontend-backend-db", "networkName": "qb-cluster-frontendbackendsomething-1234", "status": "running", "sandboxIds": ["...", "..."] },
  "sandboxes": [ { "id": "...", "name": "frontend-backend-frontend", "status": "running" } ]
}
```

**Errors:** `400` (no nodes defined / spin-up failure). Some error paths leave the cluster in an `error` state.

### `GET /api/clusters`

List all clusters owned by the user, newest first.

### `GET /api/clusters/:id`

Get cluster details plus the live status of all its member sandboxes.

### `POST /api/clusters/:id/stop`

Stop all sandboxes in the cluster; set cluster status to `stopped`.

### `DELETE /api/clusters/:id`

Tear down the entire cluster mesh: stop and remove all member sandboxes and remove the private network. **Response `204 No Content`.**

---

## Activity

All activity endpoints require a **Bearer JWT**.

### `GET /api/activities`

Get the global activity feed. Query params: `limit` (default 50), `offset` (default 0).

### `GET /api/activities/stats`

Get aggregate activity statistics.

### `GET /api/activities/sandbox/:sandboxId`

Get the activity timeline for a specific sandbox. Query params: `limit`, `offset`.

### `GET /api/activities/export/soc2`

Export a cryptographically signed SOC2 Type II / ISO-27001 audit ledger with a root hash digest. Query param: `limit` (default 200).

---

## Webhooks

All webhook endpoints require a **Bearer JWT**.

### `GET /api/webhooks/events`

List the supported webhook event types.

**Response `200 OK`:**

```json
[
  "sandbox.created",
  "sandbox.updated",
  "sandbox.deleted",
  "sandbox.started",
  "sandbox.stopped",
  "snapshot.created",
  "snapshot.restored",
  "cluster.created",
  "cluster.destroyed",
  "command.executed"
]
```

### `GET /api/webhooks`

List webhooks for the authenticated user.

### `POST /api/webhooks`

Create a new webhook.

**Request body:**

```json
{ "url": "https://example.com/webhook", "event": "sandbox.created", "secret": "optional-hmac-secret" }
```

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `url` | string | yes | Delivery URL |
| `event` | string | yes | One of the event types above |
| `secret` | string | no | HMAC signing secret (auto-generated if omitted), max 100 chars |

**Response `201 Created`:** webhook record.

### `DELETE /api/webhooks/:id`

Delete a webhook. **Response `204 No Content`.**

---

## Plan

### `GET /api/plan`

Get the authenticated user's plan limits and current usage.

**Response `200 OK`:**

```json
{
  "name": "free",
  "maxConcurrentSandboxes": 1,
  "maxSandboxesPerDay": 30,
  "maxCpuPerSandbox": 1,
  "maxMemoryPerSandbox": "2g",
  "maxClusters": 0,
  "maxDiskPerSandbox": "5g",
  "snapshotsEnabled": true,
  "usage": { "activeSandboxes": 1, "dailySandboxesUsed": 2, "activeClusters": 0 }
}
```

**Errors:** `403` (user not found).

---

## Proxy

All proxy endpoints require a **Bearer JWT**.

### `GET /api/proxy/:sandboxId/ports`

Get preview URLs for all active ports on a sandbox.

### `* /api/proxy/:sandboxId/:port/*`

Proxy HTTP traffic to a port inside the sandbox (live web preview). Any HTTP method is accepted; the subpath after `:port/` is forwarded.

---

## WebSocket / Terminal

A Socket.IO gateway is exposed in the `/terminal` namespace (e.g. `ws://localhost:3000/terminal`).

- **Auth:** the handshake must include a JWT via `auth.token` or a `?token=` query param. Connections without a valid token are disconnected with an `Authentication required` / `Invalid token` error.
- **Events (client → server):**
  - `attach` `{ sandboxId, shell? }` — attach a shell to a running sandbox.
  - `input` `{ input }` — write bytes to the terminal.
  - `resize` `{ cols, rows }` — resize the TTY.
- **Events (server → client):** `output`, `exit`, `ready`, `error`.

---

## Error codes

| Status | Meaning |
| :--- | :--- |
| `400` | Validation failure or malformed body (`BadRequestException`) |
| `401` | Missing / invalid / expired bearer token |
| `403` | User not found or forbidden action (`ForbiddenException`) |
| `404` | Resource not found, not owned, or dev-only endpoint in production |
| `409` | Conflict (e.g. email already registered) |
| `429` | Rate limit exceeded (100 req / 60s) |
| `5xx` | Server error |

Ownership is enforced at the service layer: a user can only read, modify, or delete their own sandboxes, snapshots, clusters, and webhooks.
