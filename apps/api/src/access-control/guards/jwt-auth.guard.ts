import {
  Injectable,
  Inject,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AccessControlService } from '../access-control.service';
import { IS_PUBLIC_KEY } from '../decorators';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: unknown }>();
    const res = http.getResponse<Response>();

    const accessCookie = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
    if (accessCookie) {
      const claims = await this.tokens.verifyAccessToken(accessCookie);
      if (claims) {
        const user = await this.accessControl.getUserById(claims.userId);
        if (user) {
          req.user = user;
          return true;
        }
      }
    }

    const refreshCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (refreshCookie) {
      const claims = await this.tokens.verifyRefreshToken(refreshCookie);
      if (claims) {
        const user = await this.accessControl.getUserById(claims.userId);
        if (user) {
          const freshAccess = await this.tokens.signAccessToken({
            id: user.id,
            role: user.role,
          });
          this.tokens.setAccessCookie(res, freshAccess);
          req.user = user;
          return true;
        }
      }
    }

    if (isPublic) {
      req.user = undefined;
      return true;
    }

    throw new UnauthorizedException('Authentication required');
  }
}
