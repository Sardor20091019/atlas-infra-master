import { sql, type Kysely, type Migration } from 'kysely';

export const initialSchemaMigration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('users')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('avatar_url', 'text')
      .addColumn('google_id', 'text', (col) => col.notNull().unique())
      .addColumn('role', 'text', (col) => col.notNull().defaultTo('user'))
      .addColumn('active_company_id', 'uuid')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addCheckConstraint('users_role_check', sql`role in ('user', 'admin')`)
      .execute();

    await db.schema
      .createTable('companies')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('slug', 'text', (col) => col.notNull().unique())
      .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('website', 'text')
      .addColumn('owner_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .alterTable('users')
      .addForeignKeyConstraint(
        'users_active_company_id_fkey',
        ['active_company_id'],
        'companies',
        ['id'],
        (cb) => cb.onDelete('set null'),
      )
      .execute();

    await db.schema
      .createTable('company_members')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('company_id', 'uuid', (col) => col.notNull().references('companies.id').onDelete('cascade'))
      .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('role', 'text', (col) => col.notNull())
      .addColumn('joined_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('company_members_company_user_unique', ['company_id', 'user_id'])
      .addCheckConstraint('company_members_role_check', sql`role in ('owner', 'admin', 'editor', 'viewer')`)
      .execute();

    await db.schema
      .createTable('architectures')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('slug', 'text', (col) => col.notNull().unique())
      .addColumn('title', 'text', (col) => col.notNull())
      .addColumn('summary', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('is_public', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('is_reference', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('owner_user_id', 'uuid', (col) => col.references('users.id').onDelete('set null'))
      .addColumn('company_id', 'uuid', (col) => col.references('companies.id').onDelete('cascade'))
      .addColumn('dsl_json', 'jsonb', (col) => col.notNull())
      .addColumn('yaml_source', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute();

    await db.schema
      .createIndex('users_active_company_id_idx')
      .on('users')
      .column('active_company_id')
      .execute();

    await db.schema
      .createIndex('company_members_user_id_idx')
      .on('company_members')
      .column('user_id')
      .execute();

    await db.schema
      .createIndex('architectures_owner_user_id_idx')
      .on('architectures')
      .column('owner_user_id')
      .execute();

    await db.schema
      .createIndex('architectures_company_id_idx')
      .on('architectures')
      .column('company_id')
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('architectures').ifExists().execute();
    await db.schema.dropTable('company_members').ifExists().execute();
    await db.schema.alterTable('users').dropConstraint('users_active_company_id_fkey').ifExists().execute();
    await db.schema.dropTable('companies').ifExists().execute();
    await db.schema.dropTable('users').ifExists().execute();
  },
};
