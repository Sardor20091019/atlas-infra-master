import { Migrator, type Kysely, type Migration, type MigrationProvider } from 'kysely';
import type { Database } from './database.types';
import { initialSchemaMigration } from './migrations/001_initial_schema';

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '001_initial_schema': initialSchemaMigration,
    };
  }
}

export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
  });

  const { error, results } = await migrator.migrateToLatest();

  if (results) {
    for (const r of results) {
      if (r.status === 'Error') {
        throw new Error(`Migration "${r.migrationName}" failed`);
      }
    }
  }

  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
