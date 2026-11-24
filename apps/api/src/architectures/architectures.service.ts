import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  canDeleteArchitecture,
  COMPANY_WRITE_ROLES,
  getArchitecturePermissions,
  parseArchitectureText,
  toYaml,
  type Architecture,
  type ArchitectureInput,
  type ArchitectureRecordDto,
  type CompanyRole,
  type CreateArchitectureInput,
  type UpdateArchitectureInput,
} from '@atlas/shared';
import {
  AccessControlService,
  type ResolvedArchitectureAccess,
} from '../access-control/access-control.service';
import { isUuid } from '../common/pipes/parse-uuid.pipe';
import { slugify } from '../common/utils/slug';
import { DatabaseService } from '../database/database.service';
import type { ArchitectureRow, UserRow } from '../database/database.types';

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function parseDslJson(raw: Architecture | string): Architecture {
  return typeof raw === 'string' ? (JSON.parse(raw) as Architecture) : raw;
}

@Injectable()
export class ArchitecturesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
  ) {}

  private validateDslPayload(yamlSource?: string, dslJson?: ArchitectureInput): {
    arch: Architecture;
    yaml: string;
  } {
    const yaml = yamlSource ?? toYaml(dslJson as Architecture);
    const parsed = parseArchitectureText(yaml);
    const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
    if (!parsed.arch || errors.length > 0) {
      throw new BadRequestException({
        message: errors[0]?.message ?? 'Invalid architecture DSL/YAML',
        diagnostics: parsed.diagnostics,
      });
    }
    return { arch: parsed.arch, yaml };
  }

  private toDto(
    row: ArchitectureRow & {
      owner_name?: string | null;
      company_name?: string | null;
      company_slug?: string | null;
    },
    user: UserRow | undefined,
    companyRole: CompanyRole | null,
  ): ArchitectureRecordDto {
    const subject = user ? { id: user.id, role: user.role } : undefined;
    const permissions = getArchitecturePermissions(
      subject,
      {
        isPublic: row.is_public,
        isReference: row.is_reference,
        ownerUserId: row.owner_user_id,
        companyId: row.company_id,
      },
      companyRole,
    );

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      isPublic: row.is_public,
      isReference: row.is_reference,
      ownerUserId: row.owner_user_id,
      ownerName: row.owner_name ?? null,
      companyId: row.company_id,
      companyName: row.company_name ?? null,
      companySlug: row.company_slug ?? null,
      dslJson: parseDslJson(row.dsl_json),
      yamlSource: row.yaml_source,
      permissions,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  async list(
    user: UserRow | undefined,
    filters: { scope?: string; companyId?: string },
  ): Promise<ArchitectureRecordDto[]> {
    if (filters.companyId && !isUuid(filters.companyId)) {
      throw new BadRequestException(`Invalid companyId "${filters.companyId}"`);
    }

    const companyRoles = user ? await this.accessControl.getUserCompanyRoles(user.id) : new Map();
    const memberCompanyIds = [...companyRoles.keys()];

    let query = this.database.db
      .selectFrom('architectures as a')
      .leftJoin('users as u', 'u.id', 'a.owner_user_id')
      .leftJoin('companies as c', 'c.id', 'a.company_id')
      .select([
        'a.id',
        'a.slug',
        'a.title',
        'a.summary',
        'a.is_public',
        'a.is_reference',
        'a.owner_user_id',
        'a.company_id',
        'a.dsl_json',
        'a.yaml_source',
        'a.created_at',
        'a.updated_at',
        'u.name as owner_name',
        'c.name as company_name',
        'c.slug as company_slug',
      ]);

    if (!user) {
      query = query.where((eb) =>
        eb.or([eb('a.is_public', '=', true), eb('a.is_reference', '=', true)]),
      );
    } else if (user.role !== 'admin') {
      query = query.where((eb) => {
        const clauses = [
          eb('a.is_public', '=', true),
          eb('a.is_reference', '=', true),
          eb('a.owner_user_id', '=', user.id),
        ];
        if (memberCompanyIds.length > 0) {
          clauses.push(eb('a.company_id', 'in', memberCompanyIds));
        }
        return eb.or(clauses);
      });
    }

    if (filters.companyId) {
      query = query.where('a.company_id', '=', filters.companyId);
    }

    if (filters.scope === 'reference') {
      query = query.where('a.is_reference', '=', true);
    } else if (filters.scope === 'personal') {
      query = query.where('a.is_reference', '=', false).where('a.company_id', 'is', null);
      if (user) {
        query = query.where('a.owner_user_id', '=', user.id);
      }
    } else if (filters.scope === 'company') {
      query = query.where('a.company_id', 'is not', null);
    }

    const rows = await query
      .orderBy('a.is_reference', 'desc')
      .orderBy('a.updated_at', 'desc')
      .execute();

    return rows.map((row) =>
      this.toDto(row, user, row.company_id ? (companyRoles.get(row.company_id) ?? null) : null),
    );
  }

  async getDetail(
    access: ResolvedArchitectureAccess,
    user: UserRow | undefined,
  ): Promise<ArchitectureRecordDto> {
    const row = await this.database.db
      .selectFrom('architectures as a')
      .leftJoin('users as u', 'u.id', 'a.owner_user_id')
      .leftJoin('companies as c', 'c.id', 'a.company_id')
      .select([
        'a.id',
        'a.slug',
        'a.title',
        'a.summary',
        'a.is_public',
        'a.is_reference',
        'a.owner_user_id',
        'a.company_id',
        'a.dsl_json',
        'a.yaml_source',
        'a.created_at',
        'a.updated_at',
        'u.name as owner_name',
        'c.name as company_name',
        'c.slug as company_slug',
      ])
      .where('a.id', '=', access.row.id)
      .executeTakeFirstOrThrow();

    return this.toDto(row, user, access.companyRole);
  }

  async create(user: UserRow, input: CreateArchitectureInput): Promise<ArchitectureRecordDto> {
    const { arch, yaml } = this.validateDslPayload(input.yamlSource, input.dslJson);

    let companyRole: CompanyRole | null = null;
    if (input.companyId) {
      const access = await this.accessControl.assertCompanyRole(
        input.companyId,
        user.id,
        COMPANY_WRITE_ROLES,
      );
      companyRole = access.membership.role;
    }

    const title = input.title ?? arch.name;
    const summary = input.summary ?? arch.description ?? '';

    let slug: string;
    if (input.slug) {
      const exists = await this.database.db
        .selectFrom('architectures')
        .select('id')
        .where('slug', '=', input.slug)
        .executeTakeFirst();
      if (exists) {
        throw new ConflictException(`Architecture slug "${input.slug}" is already taken`);
      }
      slug = input.slug;
    } else {
      const base = slugify(title || arch.id, 'architecture');
      slug = base;
      for (let suffix = 2; ; suffix++) {
        const exists = await this.database.db
          .selectFrom('architectures')
          .select('id')
          .where('slug', '=', slug)
          .executeTakeFirst();
        if (!exists) break;
        slug = `${base}-${suffix}`;
      }
    }

    const now = new Date();
    const inserted = await this.database.db
      .insertInto('architectures')
      .values({
        slug,
        title,
        summary,
        is_public: input.isPublic ?? false,
        is_reference: false,
        owner_user_id: user.id,
        company_id: input.companyId ?? null,
        dsl_json: JSON.stringify(arch),
        yaml_source: yaml,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.getDetail(
      {
        row: inserted,
        companyRole,
        permissions: getArchitecturePermissions(
          { id: user.id, role: user.role },
          {
            isPublic: inserted.is_public,
            isReference: inserted.is_reference,
            ownerUserId: inserted.owner_user_id,
            companyId: inserted.company_id,
          },
          companyRole,
        ),
      },
      user,
    );
  }

  async update(
    user: UserRow,
    access: ResolvedArchitectureAccess,
    input: UpdateArchitectureInput,
  ): Promise<ArchitectureRecordDto> {
    const existing = access.row;
    let nextCompanyRole = access.companyRole;

    if (input.companyId !== undefined && input.companyId !== existing.company_id) {
      if (existing.company_id) {
        const canMoveOut = canDeleteArchitecture(
          { id: user.id, role: user.role },
          {
            isPublic: existing.is_public,
            isReference: existing.is_reference,
            ownerUserId: existing.owner_user_id,
            companyId: existing.company_id,
          },
          access.companyRole,
        );
        if (!canMoveOut) {
          throw new ForbiddenException(
            'Only a company owner or admin can move a company architecture out of the company',
          );
        }
      }
      if (input.companyId !== null) {
        const targetCompany = await this.accessControl.assertCompanyRole(
          input.companyId,
          user.id,
          COMPANY_WRITE_ROLES,
        );
        nextCompanyRole = targetCompany.membership.role;
      } else {
        nextCompanyRole = null;
      }
    }

    if (input.slug && input.slug !== existing.slug) {
      const conflict = await this.database.db
        .selectFrom('architectures')
        .select('id')
        .where('slug', '=', input.slug)
        .where('id', '!=', existing.id)
        .executeTakeFirst();
      if (conflict) {
        throw new ConflictException(`Architecture slug "${input.slug}" is already taken`);
      }
    }

    let validated: { arch: Architecture; yaml: string } | undefined;
    if (input.yamlSource !== undefined || input.dslJson !== undefined) {
      validated = this.validateDslPayload(input.yamlSource, input.dslJson);
    }

    const updated = await this.database.db
      .updateTable('architectures')
      .set({
        ...(input.title !== undefined
          ? { title: input.title }
          : validated
            ? { title: validated.arch.name }
            : {}),
        ...(input.summary !== undefined
          ? { summary: input.summary }
          : validated
            ? { summary: validated.arch.description ?? '' }
            : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.isPublic !== undefined ? { is_public: input.isPublic } : {}),
        ...(input.companyId !== undefined ? { company_id: input.companyId } : {}),
        ...(validated
          ? {
              dsl_json: JSON.stringify(validated.arch),
              yaml_source: validated.yaml,
            }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.getDetail(
      {
        row: updated,
        companyRole: nextCompanyRole,
        permissions: getArchitecturePermissions(
          { id: user.id, role: user.role },
          {
            isPublic: updated.is_public,
            isReference: updated.is_reference,
            ownerUserId: updated.owner_user_id,
            companyId: updated.company_id,
          },
          nextCompanyRole,
        ),
      },
      user,
    );
  }

  async remove(id: string): Promise<{ ok: true; id: string }> {
    await this.database.db.deleteFrom('architectures').where('id', '=', id).execute();
    return { ok: true, id };
  }
}
