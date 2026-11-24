import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { updateActiveCompanySchema, type UpdateActiveCompanyInput } from '@atlas/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../access-control/decorators';
import {
  OAUTH_STATE_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  TokenService,
} from '../access-control/token.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { getEnv } from '../config/env';
import type { UserRow } from '../database/database.types';
import { AuthService, toAuthUserDto } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  @Public()
  @Get('google')
  async googleLogin(
    @Query('mode') mode: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const env = getEnv();
    if (!this.authService.isGoogleConfigured()) {
      if (mode === 'json') {
        throw new ServiceUnavailableException(
          'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
        );
      }
      res.redirect(`${env.frontendUrl}/?auth_error=google_not_configured`);
      return;
    }

    const { authUrl, signedStateCookie } = await this.authService.startGoogleLogin();
    this.tokens.setOAuthStateCookie(res, signedStateCookie);
    res.redirect(authUrl);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const env = getEnv();
    const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE_NAME] as string | undefined;
    this.tokens.clearOAuthStateCookie(res);

    if (oauthError) {
      res.redirect(`${env.frontendUrl}/?auth_error=${encodeURIComponent(oauthError)}`);
      return;
    }
    if (!code || !state) {
      res.redirect(`${env.frontendUrl}/?auth_error=missing_code_or_state`);
      return;
    }

    try {
      const { accessToken, refreshToken } = await this.authService.handleGoogleCallback(
        code,
        state,
        stateCookie,
      );
      this.tokens.setSessionCookies(res, accessToken, refreshToken);
      res.redirect(`${env.frontendUrl}/`);
    } catch {
      res.redirect(`${env.frontendUrl}/?auth_error=oauth_failed`);
    }
  }

  @Get('me')
  me(@CurrentUser() user: UserRow) {
    return { user: toAuthUserDto(user) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const { accessToken } = await this.authService.refreshFromCookie(refreshCookie);
    this.tokens.setAccessCookie(res, accessToken);
    return { ok: true };
  }

  @Patch('active-company')
  async setActiveCompany(
    @CurrentUser() user: UserRow,
    @Body(new ZodValidationPipe(updateActiveCompanySchema)) body: UpdateActiveCompanyInput,
  ) {
    const updated = await this.authService.setActiveCompany(user.id, body.companyId);
    return { user: updated };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    this.tokens.clearSessionCookies(res);
    return { ok: true };
  }
}
