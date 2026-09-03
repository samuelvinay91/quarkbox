/**
 * Dialect-agnostic detection of a unique-constraint violation, for callers that
 * want to treat "someone else already claimed this row" as an expected,
 * recoverable outcome rather than a hard failure.
 *
 * Covers both dialects this codebase runs on:
 * - Postgres: SQLSTATE 23505 (unique_violation), surfaced as `code` on the raw
 *   driver error or on TypeORM's wrapped `QueryFailedError.driverError`.
 * - better-sqlite3: throws with `code === 'SQLITE_CONSTRAINT_UNIQUE'` (or the
 *   broader 'SQLITE_CONSTRAINT' for older bindings), also surfaced directly or
 *   via `driverError`.
 */
export function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const candidates: unknown[] = [err, (err as { driverError?: unknown }).driverError];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const code = (candidate as { code?: unknown }).code;
    if (code === '23505') return true;
    if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) return true;
  }

  return false;
}
