import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddCompanyMemberInput,
  CompanyDetailDto,
  CompanyMemberDto,
  CompanyRole,
  CompanyWithRoleDto,
  CreateCompanyInput,
  UpdateCompanyInput,
  UpdateCompanyMemberInput,
} from '@atlas/shared';
import { slugify } from '../common/utils/slug';
import { DatabaseService } from '../database/database.service';
import type { CompanyRow } from '../database/database.types';

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toCompanyWithRoleDto(
  row: CompanyRow,
  myRole: CompanyRole,
  memberCount: number,
): CompanyWithRoleDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    website: row.website,
    ownerId: row.owner_id,
    myRole,
    memberCount,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

@Injectable()
export class CompaniesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createCompany(userId: string, input: CreateCompanyInput): Promise<CompanyWithRoleDto> {
    return this.database.db.transaction().execute(async (trx) => {
      let finalSlug: string;
      if (input.slug) {
        const existing = await trx
          .selectFrom('companies')
          .select('id')
          .where('slug', '=', input.slug)
          .executeTakeFirst();
        if (existing) {
          throw new ConflictException(`Company slug "${input.slug}" is already taken`);
        }
        finalSlug = input.slug;
      } else {
        const base = slugify(input.name, 'company');
        finalSlug = base;
        for (let suffix = 2; ; suffix++) {
          const exists = await trx
            .selectFrom('companies')
            .select('id')
            .where('slug', '=', finalSlug)
            .executeTakeFirst();
          if (!exists) break;
          finalSlug = `${base}-${suffix}`;
        }
      }

      const now = new Date();
      const company = await trx
        .insertInto('companies')
        .values({
          name: input.name,
          slug: finalSlug,
          description: input.description ?? '',
          website: input.website ?? null,
          owner_id: userId,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('company_members')
        .values({
          company_id: company.id,
          user_id: userId,
          role: 'owner',
        })
        .execute();

      await trx
        .updateTable('users')
        .set({ active_company_id: company.id, updated_at: now })
        .where('id', '=', userId)
        .execute();

      return toCompanyWithRoleDto(company, 'owner', 1);
    });
  }

  async listUserCompanies(userId: string): Promise<CompanyWithRoleDto[]> {
    const rows = await this.database.db
      .selectFrom('company_members as cm')
      .innerJoin('companies as c', 'c.id', 'cm.company_id')
      .select([
        'c.id',
        'c.name',
        'c.slug',
        'c.description',
        'c.website',
        'c.owner_id',
        'c.created_at',
        'c.updated_at',
        'cm.role as my_role',
      ])
      .where('cm.user_id', '=', userId)
      .orderBy('c.created_at', 'asc')
      .execute();

    if (rows.length === 0) return [];

    const companyIds = rows.map((r) => r.id);
    const allMembers = await this.database.db
      .selectFrom('company_members')
      .select(['company_id'])
      .where('company_id', 'in', companyIds)
      .execute();

    const countByCompany = new Map<string, number>();
    for (const m of allMembers) {
      countByCompany.set(m.company_id, (countByCompany.get(m.company_id) ?? 0) + 1);
    }

    return rows.map((r) =>
      toCompanyWithRoleDto(r, r.my_role, countByCompany.get(r.id) ?? 1),
    );
  }

  async getCompanyDetail(companyId: string, myRole: CompanyRole): Promise<CompanyDetailDto> {
    const company = await this.database.db
      .selectFrom('companies')
      .selectAll()
      .where('id', '=', companyId)
      .executeTakeFirst();

    if (!company) {
      throw new NotFoundException(`Company "${companyId}" not found`);
    }

    const members = await this.listMembers(companyId);
    return {
      ...toCompanyWithRoleDto(company, myRole, members.length),
      members,
    };
  }

  async updateCompany(
    companyId: string,
    myRole: CompanyRole,
    input: UpdateCompanyInput,
  ): Promise<CompanyWithRoleDto> {
    if (input.slug) {
      const conflict = await this.database.db
        .selectFrom('companies')
        .select('id')
        .where('slug', '=', input.slug)
        .where('id', '!=', companyId)
        .executeTakeFirst();
      if (conflict) {
        throw new ConflictException(`Company slug "${input.slug}" is already taken`);
      }
    }

    const updated = await this.database.db
      .updateTable('companies')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', companyId)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new NotFoundException(`Company "${companyId}" not found`);
    }

    const members = await this.listMembers(companyId);
    return toCompanyWithRoleDto(updated, myRole, members.length);
  }

  async deleteCompany(companyId: string): Promise<{ ok: true; id: string }> {
    await this.database.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ active_company_id: null, updated_at: new Date() })
        .where('active_company_id', '=', companyId)
        .execute();

      const deleted = await trx
        .deleteFrom('companies')
        .where('id', '=', companyId)
        .returning('id')
        .executeTakeFirst();

      if (!deleted) {
        throw new NotFoundException(`Company "${companyId}" not found`);
      }
    });

    return { ok: true, id: companyId };
  }

  async listMembers(companyId: string): Promise<CompanyMemberDto[]> {
    const rows = await this.database.db
      .selectFrom('company_members as cm')
      .innerJoin('users as u', 'u.id', 'cm.user_id')
      .select([
        'cm.id',
        'cm.company_id',
        'cm.user_id',
        'u.email',
        'u.name',
        'u.avatar_url',
        'cm.role',
        'cm.joined_at',
      ])
      .where('cm.company_id', '=', companyId)
      .orderBy('cm.joined_at', 'asc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      userId: r.user_id,
      email: r.email,
      name: r.name,
      avatarUrl: r.avatar_url,
      role: r.role,
      joinedAt: toIso(r.joined_at),
    }));
  }

  async addMember(
    companyId: string,
    actorRole: CompanyRole,
    input: AddCompanyMemberInput,
  ): Promise<CompanyMemberDto> {
    if (input.role === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Only a company owner can grant the owner role');
    }

    const targetUser = await this.database.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', input.email)
      .executeTakeFirst();

    if (!targetUser) {
      throw new NotFoundException(
        `No account found for "${input.email}". Ask them to sign in with Google first.`,
      );
    }

    const existing = await this.database.db
      .selectFrom('company_members')
      .select('id')
      .where('company_id', '=', companyId)
      .where('user_id', '=', targetUser.id)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`"${input.email}" is already a member of this company`);
    }

    const inserted = await this.database.db
      .insertInto('company_members')
      .values({
        company_id: companyId,
        user_id: targetUser.id,
        role: input.role,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: inserted.id,
      companyId: inserted.company_id,
      userId: inserted.user_id,
      email: targetUser.email,
      name: targetUser.name,
      avatarUrl: targetUser.avatar_url,
      role: inserted.role,
      joinedAt: toIso(inserted.joined_at),
    };
  }

  async updateMemberRole(
    companyId: string,
    actorRole: CompanyRole,
    targetUserId: string,
    input: UpdateCompanyMemberInput,
  ): Promise<CompanyMemberDto> {
    return this.database.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('company_members')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('user_id', '=', targetUserId)
        .executeTakeFirst();

      if (!target) {
        throw new NotFoundException('Company member not found');
      }

      if ((target.role === 'owner' || input.role === 'owner') && actorRole !== 'owner') {
        throw new ForbiddenException('Only a company owner can modify or grant the owner role');
      }

      if (target.role === 'owner' && input.role !== 'owner') {
        const owners = await trx
          .selectFrom('company_members')
          .select('id')
          .where('company_id', '=', companyId)
          .where('role', '=', 'owner')
          .execute();
        if (owners.length <= 1) {
          throw new BadRequestException('Cannot demote the last owner of the company');
        }
      }

      const updated = await trx
        .updateTable('company_members')
        .set({ role: input.role })
        .where('company_id', '=', companyId)
        .where('user_id', '=', targetUserId)
        .returningAll()
        .executeTakeFirstOrThrow();

      const user = await trx
        .selectFrom('users')
        .selectAll()
        .where('id', '=', targetUserId)
        .executeTakeFirstOrThrow();

      return {
        id: updated.id,
        companyId: updated.company_id,
        userId: updated.user_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        role: updated.role,
        joinedAt: toIso(updated.joined_at),
      };
    });
  }

  async removeMember(
    companyId: string,
    actorRole: CompanyRole,
    targetUserId: string,
  ): Promise<{ ok: true; userId: string }> {
    return this.database.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('company_members')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('user_id', '=', targetUserId)
        .executeTakeFirst();

      if (!target) {
        throw new NotFoundException('Company member not found');
      }

      if (target.role === 'owner' && actorRole !== 'owner') {
        throw new ForbiddenException('Only a company owner can remove another owner');
      }

      if (target.role === 'owner') {
        const owners = await trx
          .selectFrom('company_members')
          .select('id')
          .where('company_id', '=', companyId)
          .where('role', '=', 'owner')
          .execute();
        if (owners.length <= 1) {
          throw new BadRequestException('Cannot remove the last owner of the company');
        }
      }

      await trx
        .deleteFrom('company_members')
        .where('company_id', '=', companyId)
        .where('user_id', '=', targetUserId)
        .execute();

      await trx
        .updateTable('users')
        .set({ active_company_id: null, updated_at: new Date() })
        .where('id', '=', targetUserId)
        .where('active_company_id', '=', companyId)
        .execute();

      return { ok: true, userId: targetUserId };
    });
  }
}
