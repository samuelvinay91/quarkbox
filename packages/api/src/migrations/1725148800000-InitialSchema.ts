import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration — baseline for SOC2 change management.
 * This migration documents the schema as of Sprint 2 implementation.
 * For SQLite environments, this is a no-op (synchronize handles schema).
 * For Postgres environments, this creates the baseline tables.
 */
export class InitialSchema1725148800000 implements MigrationInterface {
  name = 'InitialSchema1725148800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if we're on Postgres (migrations only apply to Postgres)
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (!isPostgres) return;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL UNIQUE,
        "passwordHash" varchar(255) NOT NULL,
        "name" varchar(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "role" varchar(50) NOT NULL DEFAULT 'user',
        "plan" varchar(50) NOT NULL DEFAULT 'free',
        "dailySandboxCount" integer NOT NULL DEFAULT 0,
        "dailyCountDate" date,
        "mfaSecret" varchar(255),
        "mfaEnabled" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar NOT NULL,
        "summary" varchar(500) NOT NULL,
        "metadata" text,
        "sandboxId" varchar,
        "userId" varchar,
        "source" varchar,
        "durationMs" integer,
        "isError" boolean NOT NULL DEFAULT false,
        "integrityHmac" varchar(128),
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activities_type" ON "activities" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activities_sandboxId" ON "activities" ("sandboxId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activities_createdAt" ON "activities" ("createdAt")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "revoked_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tokenHash" varchar(64) NOT NULL UNIQUE,
        "userId" varchar,
        "reason" varchar(50),
        "expiresAt" timestamp NOT NULL,
        "revokedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_revoked_tokens_tokenHash" ON "revoked_tokens" ("tokenHash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (!isPostgres) return;

    await queryRunner.query(`DROP TABLE IF EXISTS "revoked_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
