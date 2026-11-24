import {
  BadRequestException,
  Injectable,
  Inject,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { isUuid } from '../../common/pipes/parse-uuid.pipe';
import type { UserRow } from '../../database/database.types';
import {
  AccessControlService,
  type ResolvedArchitectureAccess,
} from '../access-control.service';
import { ARCH_PERMISSION_KEY, type ArchitectureAction } from '../decorators';

@Injectable()
export class ArchitectureAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<ArchitectureAction>(ARCH_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return true;

    const req = context.switchToHttp().getRequest<
      Request & { user?: UserRow; architectureAccess?: ResolvedArchitectureAccess }
    >();

    const rawIdOrSlug = req.params.idOrSlug ?? req.params.id;
    const idOrSlug = Array.isArray(rawIdOrSlug) ? rawIdOrSlug[0] : rawIdOrSlug;
    const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!idOrSlug) {
      throw new BadRequestException('Architecture identifier is required');
    }
    if (paramId && !isUuid(paramId)) {
      throw new BadRequestException(`Invalid architecture id "${paramId}"`);
    }

    const subject = req.user ? { id: req.user.id, role: req.user.role } : undefined;
    req.architectureAccess = await this.accessControl.assertArchitectureAccess(
      subject,
      idOrSlug,
      action,
    );
    return true;
  }
}
