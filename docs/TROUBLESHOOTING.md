# QuarkBox Troubleshooting

Common issues, their symptoms, likely causes, and fixes. Symptom → cause → fix.

---

## 1. API fails to start: `JWT_SECRET environment variable is required`

**Symptom:** The API process crashes on boot with:

```
Error: JWT_SECRET environment variable is required
```

**Likely cause:** `JWT_SECRET` is not defined in the environment.

**Fix:**

```bash
# Generate a strong value and write it to packages/api/.env
openssl rand -hex 64
```

```dotenv
# packages/api/.env
JWT_SECRET=<the-generated-value>
```

Then restart the API.

---

## 2. Sandbox creation fails because Docker is not available

**Symptom:** Sandbox create/start returns an error similar to:

```
Docker runtime not available — sandbox operations will fail
```

or `Cannot connect to the Docker daemon`.

**Likely cause:** The API cannot reach the Docker socket (`DOCKER_SOCKET` default `/var/run/docker.sock`), or Docker isn't running.

**Fix:**

- Ensure Docker Engine / Docker Desktop is running: `docker ps`.
- Confirm the API process has access to the socket. In the API container, mount `/var/run/docker.sock`.
- To point at a custom socket: set `DOCKER_SOCKET=/path/to/docker.sock`.
- The API logs `Docker runtime connected` at startup when it works; if you see `Docker runtime not available`, sandbox operations will fail until Docker is reachable.

---

## 3. CORS errors from the browser (dashboard → API)

**Symptom:** Browser console shows `Access-Control-Allow-Origin` errors when the dashboard calls the API; requests succeed from `curl` but fail in the browser.

**Likely cause:** The dashboard origin differs from the API's `CORS_ORIGIN`. The API defaults to `http://localhost:3001`, but your dashboard is served on a different port/host.

**Fix:**

- Set `CORS_ORIGIN` to your dashboard origin before starting the API:

```dotenv
CORS_ORIGIN=http://localhost:3000   # or https://app.yourdomain.com
```

- In production, `CORS_ORIGIN` must match your real dashboard URL exactly (no trailing slash).
- The WebSocket `/terminal` gateway also reads `CORS_ORIGIN`; restart the API after changing it.

---

## 4. WebSocket / terminal auth failures

**Symptom:** The interactive terminal never connects; the client receives:

```
Authentication required
```
or
```
Invalid token
```

and is disconnected.

**Likely cause:** The Socket.IO handshake did not include a valid JWT, the token expired, or `JWT_SECRET` changed since the token was issued.

**Fix:**

- Supply the JWT in the handshake: Socket.IO `auth: { token: "<jwt>" }` (or `?token=<jwt>` in the URL).
- If the token expired, log in again to get a fresh one.
- If you changed `JWT_SECRET`, all previously-issued tokens are now invalid — re-authenticate.
- Ensure the `/terminal` path is proxied with websocket support (see the Helm ingress annotations / proxy config in `docs/DEPLOYMENT.md`), or localhost will only work if you connect directly to `ws://localhost:3000/terminal`.

---

## 5. Quota / plan limit errors

**Symptom:** Creating a sandbox (or cluster) fails with a message like:

```
concurrent sandbox limit (1) reached
daily sandbox limit (30) reached
cluster limit (0) reached
```

**Likely cause:** The caller's plan has been exceeded. The default `free` plan allows 1 concurrent sandbox, up to 30/day, 0 clusters. Resource requests above plan limits are also silently capped.

**Fix:**

- Check current limits and usage:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/plan
```

- Stop or delete existing sandboxes/clusters to free capacity.
- Stop active sandboxes to reduce the concurrent count (they count until removed).
- If you need more capacity, upgrade the user's plan in the database (the `plans` / `users.plan` rows) or adjust your quota configuration.

---

## 6. Rate limit errors: `429 Too Many Requests`

**Symptom:** Requests fail with HTTP `429 Too Many Requests`.

**Likely cause:** The global throttle limit (100 requests per 60 seconds per client) was exceeded.

**Fix:**

- Slow down / retry after 60 seconds (respect the `Retry-After` if present).
- Reduce chatty polling in your client (e.g. cache `GET /api/sandboxes`).
- If 100 req/60s is too low for your workload, raise the numbers in the `ThrottlerModule` config in `packages/api/src/app.module.ts` (TTL/limit) — but weigh the DoS trade-off (see `docs/SECURITY.md`).

---

## 7. `401 Unauthorized` on authenticated endpoints

**Symptom:** Protected routes return `401` even after logging in.

**Likely cause:** Missing/invalid token, expired token, or `JWT_SECRET` rotation invalidated existing tokens.

**Fix:**

- Confirm the `Authorization: Bearer <token>` header is present and well-formed.
- Re-login to get a fresh token.
- Verify `JWT_SECRET` hasn't changed since the token was issued.

---

## 8. `404 Not Found` in production on `/auth/dev-token` or `/api/docs`

**Symptom:** `POST /api/auth/dev-token` returns `404`, or Swagger UI is unavailable.

**Likely cause:** This is **expected behavior** in production. When `NODE_ENV=production`, the dev-token endpoint returns `404` and Swagger is disabled.

**Fix:**

- This is intentional — use normal register/login (or an API key) to authenticate in production.
- If you genuinely need local tooling, run with `NODE_ENV !== 'production'` for development only.

---

## 9. Password rejected even though it looks correct

**Symptom:** `POST /api/auth/login` returns `401 Invalid credentials`.

**Likely cause:**

- Wrong email/password.
- Password shorter than 8 characters at registration (registration would have returned `400`).
- Account is inactive (`isActive: false`), which blocks API-key based access.

**Fix:**

- Double-check the credentials; the password must be ≥ 8 characters.
- Confirm the account exists and is active via the database.

---

## 10. Containers not removed / cluster not destroyed

**Symptom:** After `DELETE /api/sandboxes/:id` or `DELETE /api/clusters/:id`, Docker containers still exist.

**Likely cause:** The API process lacks permission to stop/remove containers, or the call failed partway (cluster teardown stops and removes nodes sequentially and catches per-node errors).

**Fix:**

- Check the API logs for the specific failure.
- Verify the API user has permission to manage Docker (socket access).
- For clusters, re-run destroy to pick up remaining nodes; the private bridge network is removed on success.
- Manually clean stray containers: `docker ps -a --filter label=quarkbox.managed` and remove as needed.

---

## 11. Sandbox command hangs or returns no output

**Symptom:** `POST /api/sandboxes/:id/exec` appears to hang or returns empty `stdout`.

**Likely cause:** Long-running commands exceed the 2-minute execution timeout, or output exceeds the 5 MB cap (truncated). Processes that don't exit will hit the timeout.

**Fix:**

- Keep commands finite; for long-running work use the terminal (WebSocket) instead of `exec`.
- Check `stderr` for errors; large output is truncated at 5 MB by design.
- Confirm the sandbox container is actually running before exec (`GET /api/sandboxes/:id/stats`).

---

## General tips

- Turn on API debug logging when diagnosing (NestJS logs to stdout; set `NODE_ENV=development` for verbose output).
- The health endpoint `GET /api/health` returns `status: ok` when the API is up; it does **not** guarantee Docker is responsive — check Docker reachability separately (`docker ps`).
- Check the audit ledger (`/tmp/quarkbox-audit.ndjson`) for a record of recent mutations if you are debugging activity.
