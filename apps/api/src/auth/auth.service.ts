import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { COMPANY_ROLES, type AuthUserDto } from '@atlas/shared';
import { AccessControlService } from '../access-control/access-control.service';
import { TokenService } from '../access-control/token.service';
import { getEnv } from '../config/env';
import { DatabaseService } from '../database/database.service';
import type { UserRow } from '../database/database.types';
import {
  GOOGLE_OAUTH_CLIENT,
  type GoogleOAuthClientInterface,
} from './google-oauth.client';

export function toAuthUserDto(row: UserRow): AuthUserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    role: row.role,
    activeCompanyId: row.active_company_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
    @Inject(GOOGLE_OAUTH_CLIENT) private readonly googleOAuth: GoogleOAuthClientInterface,
  ) {}

  isGoogleConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.googleClientId && env.googleClientSecret);
  }

  async startGoogleLogin(): Promise<{ authUrl: string; signedStateCookie: string }> {
    const { state, signedCookie } = await this.tokens.signOAuthState();
    const authUrl = this.googleOAuth.buildAuthorizationUrl(state);
    return { authUrl, signedStateCookie: signedCookie };
  }

  async handleGoogleCallback(
    code: string,
    state: string,
    stateCookie: string | undefined,
  ): Promise<{ user: AuthUserDto; accessToken: string; refreshToken: string }> {
    const validState = await this.tokens.verifyOAuthState(state, stateCookie);
    if (!validState) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    const profile = await this.googleOAuth.exchangeCodeForUser(code);
    const now = new Date();

    const userRow = await this.database.db
      .insertInto('users')
      .values({
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatarUrl,
        google_id: profile.googleId,
        role: 'user',
        active_company_id: null,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('google_id').doUpdateSet({
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatarUrl,
          updated_at: now,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    const accessToken = await this.tokens.signAccessToken({
      id: userRow.id,
      role: userRow.role,
    });
    const refreshToken = await this.tokens.signRefreshToken({ id: userRow.id });

    return {
      user: toAuthUserDto(userRow),
      accessToken,
      refreshToken,
    };
  }

  async refreshFromCookie(refreshToken: string | undefined): Promise<{ accessToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    const claims = await this.tokens.verifyRefreshToken(refreshToken);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = await this.accessControl.getUserById(claims.userId);
    if (!user) {
      throw new UnauthorizedException('User session no longer exists');
    }
    const accessToken = await this.tokens.signAccessToken({
      id: user.id,
      role: user.role,
    });
    return { accessToken };
  }

  async setActiveCompany(userId: string, companyId: string | null): Promise<AuthUserDto> {
    if (companyId !== null) {
      await this.accessControl.assertCompanyRole(companyId, userId, COMPANY_ROLES);
    }
    const updated = await this.database.db
      .updateTable('users')
      .set({
        active_company_id: companyId,
        updated_at: new Date(),
      })
      .where('id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return toAuthUserDto(updated);
  }
}
