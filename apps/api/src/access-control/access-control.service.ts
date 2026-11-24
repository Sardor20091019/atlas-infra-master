import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  canDeleteArchitecture,
  canEditArchitecture,
  canReadArchitecture,
  getArchitecturePermissions,
  hasCompanyRole,
  type AccessSubject,
  type ArchitecturePermissions,
  type CompanyRole,
} from '@atlas/shared';
import { isUuid } from '../common/pipes/parse-uuid.pipe';
import { DatabaseService } from '../database/database.service';
import type {
  ArchitectureRow,
  CompanyMemberRow,
  CompanyRow,
  UserRow,
} from '../database/database.types';
import type { ArchitectureAction } from './decorators';

export interface ResolvedArchitectureAccess {
  row: ArchitectureRow;
  companyRole: CompanyRole | null;
  permissions: ArchitecturePermissions;
}

export interface ResolvedCompanyAccess {
  company: CompanyRow;
  membership: CompanyMemberRow;
}

@Injectable()
export class AccessControlService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getUserById(userId: string): Promise<UserRow | undefined> {
    if (!isUuid(userId)) return undefined;
    return this.database.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirst();
  }

  async getCompanyById(companyId: string): Promise<CompanyRow | undefined> {
    if (!isUuid(companyId)) return undefined;
    return this.database.db
      .selectFrom('companies')
      .selectAll()
      .where('id', '=', companyId)
      .executeTakeFirst();
  }

  async getCompanyMembership(
    companyId: string,
    userId: string,
  ): Promise<CompanyMemberRow | undefined> {
    if (!isUuid(companyId) || !isUuid(userId)) return undefined;
    return this.database.db
      .selectFrom('company_members')
      .selectAll()
      .where('company_id', '=', companyId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
  }

  async getUserCompanyRoles(userId: string): Promise<Map<string, CompanyRole>> {
    if (!isUuid(userId)) return new Map();
    const rows = await this.database.db
      .selectFrom('company_members')
      .select(['company_id', 'role'])
      .where('user_id', '=', userId)
      .execute();
    return new Map(rows.map((r) => [r.company_id, r.role]));
  }

  async assertCompanyRole(
    companyId: string,
    userId: string,
    allowedRoles: readonly CompanyRole[],
  ): Promise<ResolvedCompanyAccess> {
    const company = await this.getCompanyById(companyId);
    if (!company) {
      throw new NotFoundException(`Company "${companyId}" not found`);
    }
    const membership = await this.getCompanyMembership(companyId, userId);
    if (!membership || !hasCompanyRole(membership.role, allowedRoles)) {
      throw new ForbiddenException(
        `Insufficient company permissions. Required role: ${allowedRoles.join(' or ')}`,
      );
    }
    return { company, membership };
  }

  async getArchitectureByIdOrSlug(idOrSlug: string): Promise<ArchitectureRow | undefined> {
    const query = this.database.db.selectFrom('architectures').selectAll();
    if (isUuid(idOrSlug)) {
      return query.where('id', '=', idOrSlug).executeTakeFirst();
    }
    return query.where('slug', '=', idOrSlug).executeTakeFirst();
  }

  async assertArchitectureAccess(
    subject: AccessSubject | null | undefined,
    idOrSlug: string,
    action: ArchitectureAction,
  ): Promise<ResolvedArchitectureAccess> {
    const row = await this.getArchitectureByIdOrSlug(idOrSlug);
    if (!row) {
      throw new NotFoundException(`Architecture "${idOrSlug}" not found`);
    }

    const companyRole =
      subject && row.company_id
        ? ((await this.getCompanyMembership(row.company_id, subject.id))?.role ?? null)
        : null;

    const target = {
      isPublic: row.is_public,
      isReference: row.is_reference,
      ownerUserId: row.owner_user_id,
      companyId: row.company_id,
    };

    const allowed =
      action === 'read'
        ? canReadArchitecture(subject, target, companyRole)
        : action === 'edit'
          ? canEditArchitecture(subject, target, companyRole)
          : canDeleteArchitecture(subject, target, companyRole);

    if (!allowed) {
      if (!subject) {
        throw new UnauthorizedException('Authentication required');
      }
      throw new ForbiddenException(
        action === 'read'
          ? 'You do not have access to view this architecture'
          : action === 'edit'
            ? 'You do not have permission to edit this architecture'
            : 'You do not have permission to delete this architecture',
      );
    }

    return {
      row,
      companyRole,
      permissions: getArchitecturePermissions(subject, target, companyRole),
    };
  }
}
