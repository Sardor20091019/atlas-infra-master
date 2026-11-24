import { Inject, Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, type Dialect } from 'kysely';
import { getEnv } from '../config/env';
import type { Database } from './database.types';
import { createPgPool } from './pool';

export const DATABASE_DIALECT = Symbol('DATABASE_DIALECT');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Kysely<Database>;

  constructor(@Optional() @Inject(DATABASE_DIALECT) customDialect?: Dialect) {
    if (customDialect) {
      this.db = new Kysely<Database>({ dialect: customDialect });
    } else {
      const env = getEnv();
      const pool = createPgPool(env.databaseUrl);
      this.db = new Kysely<Database>({
        dialect: new PostgresDialect({ pool }),
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
