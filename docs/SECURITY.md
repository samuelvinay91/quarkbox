# QuarkBox Security

This document describes the current security model of QuarkBox, the hardening applied per sandbox, and a checklist to review before public release.

See also the repository-level [`SECURITY.md`](../SECURITY.md) for vulnerability reporting and the compatibility statement.

---

## Security model overview

### JWT authentication

- All endpoints are protected by a **global `JwtAuthGuard`** (NestJS). Unless a route is explicitly marked `@Public()` (register, login, dev-token, health), a valid Bearer token is required.
- Tokens are signed with `JWT_SECRET`. **The API will not start if `JWT_SECRET` is unset.**
- The JWT payload carries `sub` (user id), `email`, and `name`; token expiry is enforced (`ignoreExpiration: false`).
- Standard flow:
  1. `POST /api/auth/register` or `/login` returns a token.
  2. Send `Authorization: Bearer <token>` on every call.

### API keys

- Programmatic access (SDK/CLI) uses API keys issued by `POST /api/auth/api-key`, listed via `GET /api/auth/api-key`, and revoked via `DELETE /api/auth/api-key/:id` (all JWT-guarded; `ApiKeyController` delegates to `ApiKeyService`).
- Keys are formatted `qkb_<64 hex chars>`. `ApiKeyService.generate()` computes a **SHA-256 hash** of the key and persists only the hash + a `keyPrefix` (first 8 characters of the key), never the raw key.
- The raw key is returned **exactly once** at creation. If lost, it cannot be recovered — generate a new one and revoke the old.
- Keys can be expired (`expiresAt`, validated on use) and track `lastUsedAt`.
- Revocation is ownership-checked: a user may only revoke their own keys.
- Note: keys currently authenticate nothing on their own — no guard/strategy consumes `ApiKeyService.validate()` yet, so only JWTs work as bearer credentials today. Tracked separately.

### WebSocket authentication

- The `/terminal` Socket.IO gateway authenticates every connection: the client must supply a JWT via `auth.token` or a `?token=` query param.
- Connections without a token emit `Authentication required` and disconnect; invalid tokens emit `Invalid token` and disconnect. Attaching to a sandbox shell is gated on the sandbox existing.

### Ownership checks

- Every service enforces **ownership** by passing `req.user.userId` into the data-access layer.
- Sandboxes, snapshots, clusters, webhooks, and API keys are all filtered/validated by the owning user. A user cannot read, modify, stop, or delete resources belonging to another user (returns `404 Not Found`).

### Audit ledger

- All critical state mutations and command executions are recorded to an append-only `.ndjson` audit log (SOC2/SIEM-compatible). `GET /api/activities/export/soc2` exports a cryptographically signed ledger with a root hash digest.

---

## Rate limiting

- A global `ThrottlerGuard` enforces **100 requests per 60 seconds** per client (TTL 60000 ms, limit 100).
- Exceeded requests receive **`429 Too Many Requests`**.
- This is a coarse per-IP/per-token guard. For public release, consider adding stricter per-user and per-endpoint tiers (especially around `exec`, `run-python`, and `/auth/login`).

---

## Container isolation

Every sandbox container is created with explicit hardening (see `packages/api/src/runtime/docker.provider.ts`):

- **Capabilities dropped**: `CapDrop: ['ALL']` — the container runs with no Linux capabilities.
- **No new privileges**: `SecurityOpt: ['no-new-privileges:true']`.
- **PID limits**: `PidsLimit: 256` — bounds process count per sandbox.
- **Memory caps**: memory limited (and swap equal to memory) via `Memory`/`MemorySwap`.
- **Disk quota**: `StorageOpt: { size: ... }` (default `10g`).
- **CPU limits**: `CpuCount` set from the request/plan.
- **Resource exhaustion protection**: exec output is capped at **5 MB** and commands time out at **2 minutes** to prevent runaway output/OOM.

### Cloud metadata exfiltration shield (SSRF)

Sandboxes receive hard-coded DNS sinkholes (Docker `ExtraHosts`) mapping cloud metadata endpoints to `0.0.0.0`:

- `169.254.169.254` (AWS/GCP IMDS)
- `metadata.google.internal` (GCP)
- `100.100.100.200` (Alibaba Cloud)

Requests to these endpoints are trapped and refused, preventing credential theft from inside a sandbox.

### Kubernetes hardening (API pod)

The API deployment (`deploy/k8s/api.yaml`) applies:

- `runAsNonRoot: true`, `runAsUser: 1000`, `fsGroup: 1000`
- `allowPrivilegeEscalation: false`
- Drop **ALL** capabilities from the API container
- `seccompProfile: RuntimeDefault`
- Resource requests/limits

### Network policies

- A `NetworkPolicy` (`deploy/k8s/api.yaml` / `network-policy.yaml`) restricts API ingress to the ingress controller and egress to only Postgres (`5432`) and Redis (`6379`).
- Sandboxes join an isolated private bridge network (`SANDBOX_NETWORK`, default `quarkbox-sandboxes`), and cluster meshes use their own private networks with internal DNS.
- Note: making Docker available to sandbox execution means the API process needs access to the Docker socket — treat that as a privileged boundary and lock it down.

---

## Salted password storage

User passwords are stored as `passwordHash` on the `User` entity (via `user.service`), not in plaintext. The `passwordHash` column is referenced in the schema; ensure the chosen hashing on `user.service.ts` uses a strong, salted algorithm (e.g. bcrypt/argon2) — verify this is in place before release.

---

## Pre-release security checklist

Verify each item before making QuarkBox public:

- [ ] `JWT_SECRET` is a long random value and is **not** committed to the repo or images.
- [ ] `NODE_ENV=production` is set in production — this disables Swagger UI and the `/auth/dev-token` endpoint (which returns `404` in production).
- [ ] All default/placeholder passwords (`changeme`, `admin@quarkbox.dev`/`changeme` in `.env.example` and compose) are replaced.
- [ ] API keys are stored **hashed** (SHA-256) with only a `keyPrefix` for display — never raw.
- [ ] Password hashing uses a strong salted algorithm (bcrypt/argon2) with a sufficient cost factor.
- [ ] Ownership checks are enforced on every read/modify/delete path (sandboxes, snapshots, clusters, webhooks, API keys).
- [ ] WebSocket `/terminal` requires a valid JWT on connect and validates the target sandbox.
- [ ] The global rate limit (100 req/60s) is set; consider tighter per-endpoint limits on `exec`, `run-python`, and login.
- [ ] Sandbox containers drop ALL capabilities, disable new privileges, set PID/memory/CPU/disk limits, and include the cloud-metadata sinkholes.
- [ ] `allowPrivilegeEscalation: false`, non-root, and seccomp are applied to the API pod; network policy restricts egress to Postgres/Redis.
- [ ] No secrets in commit history; `.env`, `*.db`, and audit logs are git-ignored.
- [ ] CORS is restricted to your real dashboard origin (`CORS_ORIGIN`), not `*`.
- [ ] The audit ledger is append-only and included in a SIEM ingestion path if required for SOC2.
- [ ] Sanitize shell/context injection inputs (Git URLs and branch names are single-quoted to neutralize variable expansion / subshell injection).
- [ ] HTTPS/TLS terminates at the ingress/proxy and all external traffic is TLS-encrypted.
- [ ] Determine whether `synchronize: true` (TypeORM auto schema) is acceptable, or move to versioned migrations before release — see `docs/MIGRATION.md`.
