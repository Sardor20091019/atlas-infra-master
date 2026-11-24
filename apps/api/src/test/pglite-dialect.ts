import { PGlite } from '@electric-sql/pglite';
import {
  PostgresDialect,
  type PostgresCursor,
  type PostgresPool,
  type PostgresPoolClient,
  type PostgresQueryResult,
} from 'kysely';

export function createPGliteDialect(): { dialect: PostgresDialect; close: () => Promise<void> } {
  const pglite = new PGlite();
  let lock: Promise<void> = Promise.resolve();

  let closed = false;
  const safeClose = async () => {
    if (closed) return;
    closed = true;
    await pglite.close().catch(() => undefined);
  };

  const pool: PostgresPool = {
    async connect(): Promise<PostgresPoolClient> {
      let releaseLock!: () => void;
      const next = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const prev = lock;
      lock = prev.then(() => next);
      await prev;

      function query<R>(sql: string, parameters: readonly unknown[]): Promise<PostgresQueryResult<R>>;
      function query<R>(cursor: PostgresCursor<R>): PostgresCursor<R>;
      function query<R>(
        sqlOrCursor: string | PostgresCursor<R>,
        parameters?: readonly unknown[],
      ): Promise<PostgresQueryResult<R>> | PostgresCursor<R> {
        if (typeof sqlOrCursor !== 'string') {
          return sqlOrCursor;
        }
        return pglite.query(sqlOrCursor, parameters ? [...parameters] : []).then((result) => {
          const keyword = sqlOrCursor.trimStart().split(/\s+/)[0]?.toUpperCase();
          const command: PostgresQueryResult<R>['command'] =
            keyword === 'INSERT' || keyword === 'UPDATE' || keyword === 'DELETE'
              ? keyword
              : 'SELECT';
          return {
            command,
            rowCount: result.affectedRows ?? result.rows.length,
            rows: result.rows as R[],
          };
        });
      }

      return {
        query,
        release() {
          releaseLock();
        },
      };
    },
    async end() {
      await safeClose();
    },
  };

  return {
    dialect: new PostgresDialect({ pool }),
    close: safeClose,
  };
}
