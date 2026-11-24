import {
  BadRequestException,
  Injectable,
  Inject,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CompanyRole } from '@atlas/shared';
import type { Request } from 'express';
import { isUuid } from '../../common/pipes/parse-uuid.pipe';
import type { UserRow } from '../../database/database.types';
import { AccessControlService, type ResolvedCompanyAccess } from '../access-control.service';
import { COMPANY_ROLES_KEY } from '../decorators';

@Injectable()
export class CompanyRoleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<CompanyRole[]>(COMPANY_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<
      Request & { user?: UserRow; companyAccess?: ResolvedCompanyAccess }
    >();
    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const rawCompanyId = req.params.id ?? req.params.companyId;
    const companyId = Array.isArray(rawCompanyId) ? rawCompanyId[0] : rawCompanyId;
    if (!companyId || !isUuid(companyId)) {
      throw new BadRequestException(`Invalid company id "${companyId ?? ''}"`);
    }

    req.companyAccess = await this.accessControl.assertCompanyRole(
      companyId,
      req.user.id,
      requiredRoles,
    );
    return true;
  }
}
