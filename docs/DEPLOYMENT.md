# Deploying QuarkBox

This guide covers production deployment of the QuarkBox control plane and its compute requirements. Choose the approach that fits your environment: Docker Compose for a single host, or Kubernetes (Helm) for cluster deployments.

---

## Deployment topology

QuarkBox has several moving parts:

| Component | Description |
| :--- | :--- |
| **API** (`packages/api`) | NestJS control-plane gateway. Required. |
| **Dashboard** (`packages/dashboard`) | Next.js frontend. Required for the browser UI. |
| **Docker runtime** | Performs sandbox execution. Must be reachable by the API via the Docker socket. |
| **Postgres** | Optional persistent store for users/plans/API keys/webhooks. |
| **Redis** | Optional cache / job queue backing. |
| **MCP server / SDK / CLI** | Client-side agents; not deployed as infrastructure. |

> **Important:** sandbox execution requires a Docker daemon the API can reach (via `DOCKER_SOCKET`, default `/var/run/docker.sock`). Cloud deployments that need to actually run sandboxes must make Docker available to the API pod(s). The API will start without Docker but sandbox operations will fail.

---

## Docker Compose deployment

The compose file at `deploy/docker/docker-compose.yml` provides Postgres 16 + Redis 7 (and an optional pgAdmin under the `tools` profile).

```bash
cd deploy/docker
cp .env.example .env          # then edit every value
docker compose up -d
```

### Production considerations

1. **Never use the example passwords.** Change `POSTGRES_PASSWORD` and `REDIS_PASSWORD` before starting. The Postgres volume (`postgres_data`) is initialized only on first startup — `init.sql` provisions UUID/enum extensions then.
2. **Run the API as its own service** (outside this compose file) or extend the file, passing the Docker socket and all runtime env vars. The included compose file currently provisions *infrastructure* only, not the API/dashboard containers.
3. **Bind Postgres/Redis to the loopback or a private network** — do not expose `5432`/`6379` to the public internet.
4. **Use a reverse proxy with TLS** in front of the API (e.g. Caddy or nginx) and set `CORS_ORIGIN` to the dashboard origin.
5. **Persist volumes**: `postgres_data` and `redis_data` must be configured to survive host restarts on dedicated storage.

### Environment for the API service

Provide these to the API container:

```
NODE_ENV=production
JWT_SECRET=<strong-random-secret>
PORT=3000
CORS_ORIGIN=https://app.yourdomain.com
DATABASE_HOST=postgres
DATABASE_PASSWORD=<your-db-password>
POSTGRES_USER=quarkbox
POSTGRES_DB=quarkbox
REDIS_PASSWORD=<your-redis-password>
DOCKER_SOCKET=/var/run/docker.sock
SANDBOX_NETWORK=quarkbox-sandboxes
```

---

## Kubernetes deployment (Helm)

A Helm chart is provided at `deploy/helm/quarkbox`. It charts the API and dashboard, an optional ingress, plus Postgres and Redis subcharts.

### Install

```bash
helm repo add quarkbox https://charts.quarkbox.dev   # when published
helm upgrade --install quarkbox ./deploy/helm/quarkbox \
  --namespace quarkbox --create-namespace \
  -f values.yaml
```

If you are not publishing a chart repo yet, reference the local chart directory directly:

```bash
helm upgrade --install quarkbox ./deploy/helm/quarkbox \
  --namespace quarkbox --create-namespace \
  --set global.environment=production
```

### Helm values reference

Documented below are the actual keys defined in `deploy/helm/quarkbox/values.yaml`.

#### `global`

| Key | Default | Description |
| :--- | :--- | :--- |
| `global.environment` | `production` | Deployment environment label. |

#### `api`

| Key | Default | Description |
| :--- | :--- | :--- |
| `api.replicaCount` | `2` | Number of API replicas. |
| `api.image.repository` | `quarkbox/api` | API image repository. |
| `api.image.tag` | `0.1.0` | API image tag. |
| `api.image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `api.service.type` | `ClusterIP` | Service type. |
| `api.service.port` | `3000` | Service port. |
| `api.resources.limits.cpu` | `1000m` | CPU limit. |
| `api.resources.limits.memory` | `1Gi` | Memory limit. |
| `api.resources.requests.cpu` | `250m` | CPU request. |
| `api.resources.requests.memory` | `256Mi` | Memory request. |
| `api.autoscaling.enabled` | `true` | Enable HPA. |
| `api.autoscaling.minReplicas` | `2` | HPA minimum. |
| `api.autoscaling.maxReplicas` | `10` | HPA maximum. |
| `api.autoscaling.targetCPUUtilizationPercentage` | `75` | CPU target for scaling. |

#### `dashboard`

| Key | Default | Description |
| :--- | :--- | :--- |
| `dashboard.replicaCount` | `2` | Dashboard replica count. |
| `dashboard.image.repository` | `quarkbox/dashboard` | Dashboard image. |
| `dashboard.image.tag` | `0.1.0` | Dashboard image tag. |
| `dashboard.image.pullPolicy` | `IfNotPresent` | Pull policy. |
| `dashboard.service.type` | `ClusterIP` | Service type. |
| `dashboard.service.port` | `3001` | Dashboard service port. |

#### `ingress`

| Key | Default | Description |
| :--- | :--- | :--- |
| `ingress.enabled` | `true` | Enable the ingress. |
| `ingress.className` | `nginx` | IngressClass name. |
| `ingress.annotations` | (below) | Ingress annotations. |
| `ingress.annotations["cert-manager.io/cluster-issuer"]` | `letsencrypt-prod` | TLS issuer for cert-manager. |
| `ingress.annotations["nginx.ingress.kubernetes.io/proxy-read-timeout"]` | `3600` | Long timeout for terminal/websocket. |
| `ingress.annotations["nginx.ingress.kubernetes.io/proxy-send-timeout"]` | `3600` | Long send timeout. |
| `ingress.annotations["nginx.ingress.kubernetes.io/websocket-services"]` | `quarkbox-api` | Route websockets to the API. |
| `ingress.hosts` | see values | Host/path routing (`/api` and `/terminal` → api, `/` → dashboard). |
| `ingress.tls` | see values | TLS `secretName` + hosts. |

#### `engine`

| Key | Default | Description |
| :--- | :--- | :--- |
| `engine.enableWarmPool` | `true` | Enable the warm standby pool. |
| `engine.idleTimeoutSeconds` | `1800` | Idle timeout before reclaim. |
| `engine.defaultRuntime` | `docker` | Default sandbox runtime. |

#### `postgresql` (subchart)

| Key | Default | Description |
| :--- | :--- | :--- |
| `postgresql.enabled` | `true` | Deploy the Postgres subchart. |
| `postgresql.auth.existingSecret` | `quarkbox-db-secret` | Kubernetes secret holding DB credentials. |
| `postgresql.auth.username` | `quarkbox` | DB username. |
| `postgresql.auth.database` | `quarkbox` | DB name. |
| `postgresql.persistence.size` | `20Gi` | Persistent volume size. |

#### `redis` (subchart)

| Key | Default | Description |
| :--- | :--- | :--- |
| `redis.enabled` | `true` | Deploy the Redis subchart. |
| `redis.architecture` | `standalone` | Redis topology. |
| `redis.auth.enabled` | `true` | Require Redis auth. |
| `redis.auth.existingSecret` | `quarkbox-redis-secret` | Secret holding the Redis password. |

### Example `values.local.yaml` override

```yaml
api:
  replicaCount: 3
  autoscaling:
    enabled: true
    maxReplicas: 20

dashboard:
  replicaCount: 2

ingress:
  enabled: true
  hosts:
    - host: app.quarkbox.yourdomain.com
      paths:
        - path: /api
          pathType: Prefix
          service: api
        - path: /terminal
          pathType: Prefix
          service: api
        - path: /
          pathType: Prefix
          service: dashboard
  tls:
    - secretName: quarkbox-tls
      hosts:
        - app.quarkbox.yourdomain.com

engine:
  enableWarmPool: true
  idleTimeoutSeconds: 3600

postgresql:
  persistence:
    size: 50Gi
```

---

## Kubernetes deployment (raw manifests)

Raw manifests are also provided under `deploy/k8s/` (`api.yaml`, `infra.yaml`, `network-policy.yaml`) if you prefer not to use Helm. They include a Deployment + Service + NetworkPolicy for the API and annotation notes on secret management.

---

## Environment variables reference

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | **yes** | — | Secret for signing auth tokens. API will not start without it. |
| `PORT` | no | `3000` | API HTTP listen port. |
| `NODE_ENV` | no | `development` | Set to `production` to disable Swagger/docs and dev-token. |
| `CORS_ORIGIN` | no | `http://localhost:3001` | Allowed browser origin. |
| `DATABASE_HOST` | no | — | Postgres host (used when using Postgres). |
| `DATABASE_PASSWORD` | no | — | Postgres password. |
| `POSTGRES_USER` | no | `quarkbox` | Postgres role. |
| `POSTGRES_DB` | no | `quarkbox` | Postgres database name. |
| `REDIS_PASSWORD` | no | — | Redis auth password. |
| `DOCKER_SOCKET` | no | `/var/run/docker.sock` | Docker socket path. |
| `SANDBOX_NETWORK` | no | `quarkbox-sandboxes` | Docker network sandboxes join. |

The API currently uses a local SQLite database (`quarkbox.db`) via TypeORM with `synchronize: true`. When you introduce Postgres, set the connection env vars above. See `docs/MIGRATION.md`.

---

## Secret management best practices

Treat these three secrets as the most sensitive:

1. **`JWT_SECRET`** — if leaked, an attacker can forge tokens for any user. Use a long (>64 hex chars) random value and rotate on compromise.
2. **Database password** (`DATABASE_PASSWORD` / `postgresql.auth`) — use a dedicated, strong per-instance password.
3. **Redis password** (`REDIS_PASSWORD` / `redis.auth`) — Redis with no auth can be abused for cache poisoning; password-protect it.

Recommended approaches per deployment model:

- **Docker Compose**: put secrets only in `.env`, never commit them; the example values (`changeme`) are placeholders — replace them.
- **Kubernetes**: store secrets as Kubernetes `Secret` objects referenced via `existingSecret` / `secretKeyRef`. Do **not** bake them into images or chart values.
- **For more rigor** on Kubernetes, use **Sealed Secrets**, **External Secrets Operator**, or **HashiCorp Vault** (the raw `deploy/k8s/api.yaml` notes this explicitly).
- **Least privilege**: run the API as a non-root user with capabilities dropped and `allowPrivilegeEscalation: false`.
- **Rotate `JWT_SECRET`** only with a coordinated rollout so active sessions are not silently invalidated; expect existing tokens to become invalid.

---

## Scaling guidelines

- **API is stateless** at the orchestration layer (state lives in the database and Docker), so it scales horizontally behind a load balancer / HPA.
- The default HPA scales API replicas from `2` to `10` based on CPU at 75% target. Tune for your expected concurrency.
- **Warm pool** (`engine.enableWarmPool`) pre-provisions idle containers for <30ms claims. Plan host capacity to cover the warm pool plus the burst-to-fill workload.
- Each sandbox consumes host resources per its `cpuLimit`/`memoryLimit`/`diskLimit`. Right-size per user to avoid exhausting Docker hosts.
- **Postgres/Redis** should use persistent volumes (e.g. `20Gi` default for Postgres). Use a managed database in large deployments.
- Sandbox execution is host-Docker-bound; if you scale API replicas widely, ensure every replica can reach the same Docker runtime (or route sandbox operations to dedicated workers).

---

## Health checks / probes

The API exposes `GET /api/health` (public).

- **Liveness + readiness** both probe `/api/health` on port `3000` (see `deploy/k8s/api.yaml`).
  - Liveness: `initialDelaySeconds: 10`, `periodSeconds: 30`.
  - Readiness: `initialDelaySeconds: 5`, `periodSeconds: 10`.
- In Helm, ensure the ingress routes `/api` and `/terminal` to the API service; the dashboard is served on `/`.
- The `/terminal` path requires websocket support in your ingress (the chart sets `nginx.ingress.kubernetes.io/websocket-services`) and long proxy timeouts (default annotations set `3600`s) so interactive terminals do not drop.

A healthy probe returns `200` with `{"status":"ok", ...}`. A non-2xx from `/api/health` means the pod should be restarted/pulled from service.
