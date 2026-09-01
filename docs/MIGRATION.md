# QuarkBox Data & Schema Migration

This guide explains how the QuarkBox schema is currently managed, how to back up its database, how to move from the default SQLite database to Postgres, and what to consider when migrating the core entities.

---

## How the schema is currently managed

The API uses **TypeORM**. In `packages/api/src/app.module.ts`, the connection is configured as:

```ts
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'better-sqlite3',
    database: 'quarkbox.db',
    entities: [Sandbox, Snapshot, Activity, MarketplaceTemplate, Cluster, User, ApiKey, Webhook],
    synchronize: true,
    logging: false,
  }),
})
```

> **`synchronize: true`** means TypeORM auto-creates/updates tables to match the entities every startup. This is convenient for development but **not recommended for production** — a schema change could be applied destructively without review.

### Recommended: move to versioned migrations

A `migrations/` directory exists (`packages/api/src/migrations`) but is currently empty (only a `.gitkeep`). Before public release:

1. Disable `synchronize` in production (set it from an env flag or remove it).
2. Generate an initial migration from the current schema:

   ```bash
   # TypeORM CLI
   npx typeorm migration:generate -d path/to/data-source.ts src/migrations/InitialSchema
   ```

3. Run pending migrations on startup or via a deploy step:

   ```bash
   npx typeorm migration:run -d path/to/data-source.ts
   ```

4. Treat every schema change as a new versioned migration committed to `src/migrations`.

---

## Backing up the database

### SQLite (default `quarkbox.db`)

The API uses a single SQLite file (`quarkbox.db`, often at the API package root). To back it up safely, use SQLite's online backup or `VACUUM INTO` rather than copying an in-use file:

```bash
# From the directory containing quarkbox.db
sqlite3 quarkbox.db "VACUUM INTO 'quarkbox-backup-$(date +%F).db';"
```

The audit ledger is separate (append-only `.ndjson` at `/tmp/quarkbox-audit.ndjson`) — back it up too if you need the audit trail:

```bash
cp /tmp/quarkbox-audit.ndjson ./quarkbox-audit-backup.ndjson
```

### Postgres

Use `pg_dump`:

```bash
pg_dump -U quarkbox -h <host> quarkbox > quarkbox-backup.sql
# restore
psql -U quarkbox -h <host> quarkbox < quarkbox-backup.sql
```

Or with Docker Compose:

```bash
docker exec quarkbox-postgres pg_dump -U quarkbox quarkbox > quarkbox-backup.sql
```

The `init.sql` in `deploy/docker/` enables the `uuid-ossp` and `pgcrypto` extensions and defines the enum types (`sandbox_status`, `sandbox_runtime`, `snapshot_status`) needed by the schema — recreate these on a fresh Postgres if missing.

---

## Migrating from SQLite to Postgres

Currently the only tested default is SQLite (`better-sqlite3`). Moving to Postgres for production:

1. **Provision Postgres** — via `deploy/docker/docker-compose.yml` (Postgres 16) or the Helm `postgresql` subchart.
2. **Set connection env vars** — the code reads database settings from the environment:

   ```
   DATABASE_HOST=<host>
   DATABASE_PASSWORD=<password>
   POSTGRES_USER=quarkbox
   POSTGRES_DB=quarkbox
   ```

   > **Note:** the connection factory currently hard-codes `type: 'better-sqlite3'` and `database: 'quarkbox.db'`. To actually run on Postgres you must update the TypeORM config in `app.module.ts` to select the driver based on your settings (e.g. `type: 'postgres'`, `host`, `port`, `username`, `password`, `database` from env). Until that code change lands, Docker/Helm Postgres provides storage but the API still defaults to SQLite.

3. **Recreate enum types** — Postgres enums used by the schema:
   - `sandbox_status`: `creating, running, paused, stopped, error, deleting`
   - `sandbox_runtime`: `docker, containerd, firecracker`
   - `snapshot_status`: `creating, ready, restoring, error`

   The `init.sql` script creates these on first startup.
4. **Validate driver support** for the JSON columns (`simple-json`), the UUID primary keys, and `simple-array` columns used by entities before switching.

### Data export from SQLite

If you need to carry data over, SQLite → Postgres migration requires transforming column types and removing SQLite-specific conventions. Use a migration tool (e.g. `pgloader`) or write an ETL. Do a **dry run** and verify row counts and foreign keys before promoting to production.

---

## Data migration considerations (core entities)

### `User` (`users`)

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid (PK) | String UUIDs across the app. |
| `email` | varchar(255) unique | Never change case-sensitively without a plan; index lookups rely on it. |
| `passwordHash` | varchar(255) | Store only the hash; if you change algorithm/cost, plan a rehash-on-login migration. |
| `name` | varchar(255) nullable | |
| `isActive` | boolean (default true) | Inactive users are blocked from API-key access. |
| `role` | varchar(50) default `user` | |
| `plan` | varchar(50) default `free` | Links to `plans.name`. |
| `dailySandboxCount` / `dailyCountDate` | int / date | Daily quota counters; reset logic depends on `dailyCountDate`. |

Considerations: migrating users safely requires preserving the `passwordHash` verbatim (never re-hash during transit unless you can force password reset). Keep `email` unique constraints at the DB level.

### `ApiKey` (`api_keys`)

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid (PK) | |
| `name` | string | |
| `keyHash` | string | **SHA-256 hash** of the raw key — never store the raw key. |
| `keyPrefix` | string | Display-only prefix (`qbk_...`). |
| `userId` | uuid / FK | Owner. |
| `expiresAt` | datetime nullable | Expired keys are rejected. |
| `lastUsedAt` | datetime nullable | |
| `createdAt` | date | |

Key migration is straightforward (hash + prefix are persisted), but be careful when moving the `keyHash`: it must match byte-for-byte for existing keys to keep working.

### `Plan` (`plans`)

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid (PK) | |
| `name` | varchar unique | `users.plan` references this. |
| `maxConcurrentSandboxes` | int (default 1) | |
| `maxSandboxesPerDay` | int (default 30) | |
| `maxCpuPerSandbox` | int (default 1) | |
| `maxMemoryPerSandbox` | varchar (default `2g`) | |
| `maxClusters` | int (default 0) | |
| `maxDiskPerSandbox` | varchar (default `5g`) | |
| `snapshotsEnabled` | boolean (default true) | |

Plans are seeded (there is a `plan.seed.ts`). When migrating, preserve the `name` values already referenced by existing users (`free` fallback is used if a plan row is missing). Adding a new plan is additive; renaming a plan requires updating `users.plan`.

---

## General migration ordering (recommended)

1. **Back up** the source database (SQLite `VACUUM INTO` or `pg_dump`).
2. **Stop writes** during the cutover window for consistent exports.
3. **Apply schema migrations** in order (existing empty `migrations/` dir should be populated with versioned files).
4. **Re-verify** `uuid-ossp`/`pgcrypto` extensions and the enum types on Postgres.
5. **Run checks**: row counts, key uniqueness, and a smoke test (`POST /api/auth/login`, `POST /api/sandboxes`) before serving traffic.
6. Keep the old database available for rollback until verified.
