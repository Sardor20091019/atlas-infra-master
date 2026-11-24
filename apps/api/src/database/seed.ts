import { referenceArchitectures, toYaml, validateReferenceArchitectures } from '@atlas/shared';
import type { Kysely } from 'kysely';
import type { Database } from './database.types';

export async function seedReferenceArchitectures(db: Kysely<Database>): Promise<number> {
  validateReferenceArchitectures();

  for (const arch of referenceArchitectures) {
    const yamlSource = toYaml(arch);
    const dslJson = JSON.stringify(arch);
    const now = new Date();

    await db
      .insertInto('architectures')
      .values({
        slug: arch.id,
        title: arch.name,
        summary: arch.description,
        is_public: true,
        is_reference: true,
        owner_user_id: null,
        company_id: null,
        dsl_json: dslJson,
        yaml_source: yamlSource,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('slug').doUpdateSet({
          title: arch.name,
          summary: arch.description,
          is_public: true,
          is_reference: true,
          dsl_json: dslJson,
          yaml_source: yamlSource,
          updated_at: now,
        }),
      )
      .execute();
  }

  return referenceArchitectures.length;
}
