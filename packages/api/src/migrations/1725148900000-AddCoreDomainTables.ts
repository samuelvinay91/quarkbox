import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `1725148800000-InitialSchema` only created users/activities/revoked_tokens
 * — every other entity in this codebase (Sandbox, Snapshot, Cluster,
 * MarketplaceTemplate, ApiKey, Plan, Webhook) has never had a matching
 * migration, so a fresh Postgres deploy following the documented
 * `migration:run` path (production runs with `synchronize: false`) ends up
 * missing most of its schema. This migration creates the rest.
 *
 * For SQLite environments, this is a no-op (synchronize handles schema).
 * Must run before `1788286255953-AddSandboxContainerIdUniqueIndex`, which
 * needs the `sandboxes` table this migration creates to already exist.
 */
export class AddCoreDomainTables1725148900000 implements MigrationInterface {
  name = 'AddCoreDomainTables1725148900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (!isPostgres) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sandboxes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" varchar(500),
        "status" varchar NOT NULL DEFAULT 'creating',
        "runtime" varchar NOT NULL DEFAULT 'docker',
        "image" varchar(255) NOT NULL DEFAULT 'ubuntu:22.04',
        "containerId" varchar,
        "containerIp" varchar,
        "cpuLimit" integer NOT NULL DEFAULT 1,
        "memoryLimit" varchar(50) NOT NULL DEFAULT '512m',
        "diskLimit" varchar(50) NOT NULL DEFAULT '10g',
        "ports" text NOT NULL DEFAULT '{}',
        "envVars" text NOT NULL DEFAULT '{}',
        "labels" text NOT NULL DEFAULT '{}',
        "userId" varchar,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "lastActiveAt" timestamp
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sandboxes_status" ON "sandboxes" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" varchar(500),
        "status" varchar NOT NULL DEFAULT 'creating',
        "sandboxId" uuid,
        "snapshotImage" varchar(255) NOT NULL,
        "sizeBytes" bigint NOT NULL DEFAULT 0,
        "metadata" text NOT NULL DEFAULT '{}',
        "userId" varchar,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_snapshots_sandboxId" FOREIGN KEY ("sandboxId")
          REFERENCES "sandboxes" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_snapshots_status" ON "snapshots" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_snapshots_sandboxId" ON "snapshots" ("sandboxId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clusters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "networkName" varchar(150) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'creating',
        "nodes" text,
        "sandboxIds" text,
        "userId" varchar(100),
        "metadata" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketplace_templates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(100) NOT NULL UNIQUE,
        "name" varchar(150) NOT NULL,
        "category" varchar(50) NOT NULL DEFAULT 'AI & Autonomous Agents',
        "description" text NOT NULL,
        "icon" varchar(20) NOT NULL DEFAULT '🚀',
        "image" varchar(255) NOT NULL,
        "defaultCpu" integer NOT NULL DEFAULT 2,
        "defaultMemory" varchar(20) NOT NULL DEFAULT '1g',
        "defaultDisk" varchar(20) NOT NULL DEFAULT '10g',
        "ports" text,
        "envVars" text,
        "tags" text,
        "recommendedWorkdir" varchar(255) NOT NULL DEFAULT '/workspace',
        "postLaunchScript" text,
        "publisher" varchar(100) NOT NULL DEFAULT 'QuarkBox Official',
        "isOfficial" boolean NOT NULL DEFAULT true,
        "isVerified" boolean NOT NULL DEFAULT true,
        "launchesCount" integer NOT NULL DEFAULT 0,
        "readmeUrl" varchar(50),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketplace_templates_slug" ON "marketplace_templates" ("slug")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "keyHash" varchar(255) NOT NULL,
        "keyPrefix" varchar(8) NOT NULL,
        "userId" uuid NOT NULL,
        "lastUsedAt" timestamp,
        "expiresAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_api_keys_userId" FOREIGN KEY ("userId")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL UNIQUE,
        "maxConcurrentSandboxes" integer NOT NULL DEFAULT 1,
        "maxSandboxesPerDay" integer NOT NULL DEFAULT 30,
        "maxCpuPerSandbox" integer NOT NULL DEFAULT 1,
        "maxMemoryPerSandbox" varchar NOT NULL DEFAULT '2g',
        "maxClusters" integer NOT NULL DEFAULT 0,
        "maxDiskPerSandbox" varchar NOT NULL DEFAULT '5g',
        "snapshotsEnabled" boolean NOT NULL DEFAULT true
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhooks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "url" varchar(255) NOT NULL,
        "event" varchar(100) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "secret" varchar(100),
        "lastDeliveryAt" timestamp,
        "deliveryCount" integer NOT NULL DEFAULT 0,
        "failureCount" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (!isPostgres) return;

    await queryRunner.query(`DROP TABLE IF EXISTS "webhooks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketplace_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clusters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sandboxes"`);
  }
}
