export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COMPANY_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const COMPANY_MANAGE_ROLES: readonly CompanyRole[] = ['owner', 'admin'];
export const COMPANY_WRITE_ROLES: readonly CompanyRole[] = ['owner', 'admin', 'editor'];

export interface AccessSubject {
  id: string;
  role: UserRole;
}

export interface ArchitectureAccessTarget {
  isPublic: boolean;
  isReference: boolean;
  ownerUserId: string | null;
  companyId: string | null;
}

export interface ArchitecturePermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageVisibility: boolean;
  source: 'reference' | 'personal' | 'company';
  reason?: string;
}

export function hasCompanyRole(
  role: CompanyRole | null | undefined,
  allowed: readonly CompanyRole[],
): boolean {
  return role != null && allowed.includes(role);
}

export function canViewCompanyDetails(role: CompanyRole | null | undefined): boolean {
  return hasCompanyRole(role, COMPANY_MANAGE_ROLES);
}

export function canManageCompany(role: CompanyRole | null | undefined): boolean {
  return hasCompanyRole(role, COMPANY_MANAGE_ROLES);
}

export function canDeleteCompany(role: CompanyRole | null | undefined): boolean {
  return role === 'owner';
}

export function canManageCompanyMembers(role: CompanyRole | null | undefined): boolean {
  return hasCompanyRole(role, COMPANY_MANAGE_ROLES);
}

export function canCreateCompanyArchitecture(role: CompanyRole | null | undefined): boolean {
  return hasCompanyRole(role, COMPANY_WRITE_ROLES);
}

export function canReadArchitecture(
  subject: AccessSubject | null | undefined,
  target: ArchitectureAccessTarget,
  companyRole?: CompanyRole | null,
): boolean {
  if (target.isPublic || target.isReference) return true;
  if (!subject) return false;
  if (subject.role === 'admin') return true;
  if (target.companyId !== null) return companyRole != null;
  return target.ownerUserId === subject.id;
}

export function canEditArchitecture(
  subject: AccessSubject | null | undefined,
  target: ArchitectureAccessTarget,
  companyRole?: CompanyRole | null,
): boolean {
  if (!subject) return false;
  if (target.isReference) return subject.role === 'admin';
  if (subject.role === 'admin') return true;
  if (target.companyId !== null) return hasCompanyRole(companyRole, COMPANY_WRITE_ROLES);
  return target.ownerUserId === subject.id;
}

export function canDeleteArchitecture(
  subject: AccessSubject | null | undefined,
  target: ArchitectureAccessTarget,
  companyRole?: CompanyRole | null,
): boolean {
  if (!subject) return false;
  if (target.isReference) return subject.role === 'admin';
  if (subject.role === 'admin') return true;
  if (target.companyId !== null) return hasCompanyRole(companyRole, COMPANY_MANAGE_ROLES);
  return target.ownerUserId === subject.id;
}

export function getArchitecturePermissions(
  subject: AccessSubject | null | undefined,
  target: ArchitectureAccessTarget,
  companyRole?: CompanyRole | null,
): ArchitecturePermissions {
  const source: ArchitecturePermissions['source'] = target.isReference
    ? 'reference'
    : target.companyId !== null
      ? 'company'
      : 'personal';

  const canView = canReadArchitecture(subject, target, companyRole);
  const canEdit = canEditArchitecture(subject, target, companyRole);
  const canDelete = canDeleteArchitecture(subject, target, companyRole);
  const canManageVisibility = canEdit;

  let reason: string | undefined;
  if (!canEdit) {
    if (target.isReference) {
      reason = 'Reference gallery entries are read-only. Fork a copy to edit.';
    } else if (!subject) {
      reason = 'Sign in with Google to edit saved architectures, or fork a local draft.';
    } else if (target.companyId !== null && companyRole === 'viewer') {
      reason = 'Your company role is Viewer (read-only). Fork to your personal workspace to edit.';
    } else if (target.companyId !== null) {
      reason = 'Only company owners, admins, or editors can modify this architecture.';
    } else {
      reason = 'Only the owner can modify this architecture.';
    }
  }

  return {
    canView,
    canEdit,
    canDelete,
    canManageVisibility,
    source,
    ...(reason ? { reason } : {}),
  };
}
