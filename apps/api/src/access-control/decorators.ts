import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { CompanyRole } from '@atlas/shared';

export const IS_PUBLIC_KEY = 'atlas:isPublic';
export const COMPANY_ROLES_KEY = 'atlas:companyRoles';
export const ARCH_PERMISSION_KEY = 'atlas:archPermission';

export type ArchitectureAction = 'read' | 'edit' | 'delete';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequireCompanyRole = (...roles: CompanyRole[]) => SetMetadata(COMPANY_ROLES_KEY, roles);

export const RequireArchitecturePermission = (action: ArchitectureAction) =>
  SetMetadata(ARCH_PERMISSION_KEY, action);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
