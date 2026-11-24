import { Kysely, PostgresDialect } from 'kysely';
import { getEnv } from '../config/env';
import type { Database } from './database.types';
import { runMigrations } from './migrator';
import { createPgPool } from './pool';
import { seedReferenceArchitectures } from './seed';

async function main(): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.databaseUrl);
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  try {
    await runMigrations(db);
    const count = await seedReferenceArchitectures(db);
    console.log(`Seeded ${count} built-in reference architectures.`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
