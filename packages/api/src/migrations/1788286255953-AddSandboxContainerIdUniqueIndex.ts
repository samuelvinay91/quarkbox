import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prevents a warm-pool container from ever being adopted by two Sandbox rows.
 * For SQLite environments, this is a no-op (synchronize + the entity-level
 * @Index handle schema there). For Postgres environments, this creates the
 * unique index.
 *
 * Guarded on `hasTable('sandboxes')`: no prior migration in this codebase
 * actually creates the `sandboxes` table (schema in Postgres today comes
 * entirely from `synchronize`, which is off in production) — this migration
 * no-ops rather than throws if the table isn't there yet, so it doesn't
 * become the thing that breaks a `migration:run` invocation for an
 * unrelated, pre-existing reason.
 */
export class AddSandboxContainerIdUniqueIndex1788286255953 implements MigrationInterface {
  name = 'AddSandboxContainerIdUniqueIndex1788286255953';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (!isPostgres) return;

    if (!(await queryRunner.hasTable('sandboxes'))) {
      console.warn(
        '[AddSandboxContainerIdUniqueIndex] "sandboxes" table does not exist yet — skipping index creation.',
      );
      return;
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sandbox_containerId_unique" ON "sandboxes" ("containerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    if (!isPostgres) return;

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sandbox_containerId_unique"`);
  }
}
