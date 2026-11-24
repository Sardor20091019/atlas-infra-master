import { Kysely, PostgresDialect } from 'kysely';
import { getEnv } from '../config/env';
import type { Database } from './database.types';
import { runMigrations } from './migrator';
import { createPgPool } from './pool';

async function main(): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.databaseUrl);
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    await runMigrations(db);
    console.log('Database migrations applied cleanly.');
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
