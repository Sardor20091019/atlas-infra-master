import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { UserRole } from '@atlas/shared';
import type { Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../config/env';

export const ACCESS_COOKIE_NAME = 'atlas_access_token';
export const REFRESH_COOKIE_NAME = 'atlas_refresh_token';
export const OAUTH_STATE_COOKIE_NAME = 'atlas_oauth_state';

export interface AccessTokenClaims {
  userId: string;
  role: UserRole;
}

@Injectable()
export class TokenService {
  private encodeSecret(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
  }

  async signAccessToken(user: { id: string; role: UserRole }): Promise<string> {
    const env = getEnv();
    return new SignJWT({ role: user.role, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${env.accessTokenTtlSeconds}s`)
      .sign(this.encodeSecret(env.jwtAccessSecret));
  }

  async signRefreshToken(user: { id: string }): Promise<string> {
    const env = getEnv();
    return new SignJWT({ typ: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${env.refreshTokenTtlSeconds}s`)
      .sign(this.encodeSecret(env.jwtRefreshSecret));
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const env = getEnv();
      const { payload } = await jwtVerify(token, this.encodeSecret(env.jwtAccessSecret), {
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'access' || typeof payload.sub !== 'string') return null;
      const role: UserRole = payload.role === 'admin' ? 'admin' : 'user';
      return { userId: payload.sub, role };
    } catch {
      return null;
    }
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
    try {
      const env = getEnv();
      const { payload } = await jwtVerify(token, this.encodeSecret(env.jwtRefreshSecret), {
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'refresh' || typeof payload.sub !== 'string') return null;
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }

  async signOAuthState(): Promise<{ state: string; signedCookie: string }> {
    const env = getEnv();
    const state = crypto.randomBytes(24).toString('hex');
    const signedCookie = await new SignJWT({ state, typ: 'oauth_state' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.encodeSecret(env.oauthStateSecret));
    return { state, signedCookie };
  }

  async verifyOAuthState(state: string, signedCookie: string | undefined): Promise<boolean> {
    if (!state || !signedCookie) return false;
    try {
      const env = getEnv();
      const { payload } = await jwtVerify(signedCookie, this.encodeSecret(env.oauthStateSecret), {
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'oauth_state' || typeof payload.state !== 'string') return false;
      const a = Buffer.from(state);
      const b = Buffer.from(payload.state);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private cookieBaseOptions() {
    const env = getEnv();
    return {
      httpOnly: true,
      sameSite: env.cookieSameSite,
      secure: env.cookieSecure,
      path: '/',
    } as const;
  }

  setOAuthStateCookie(res: Response, signedCookie: string): void {
    res.cookie(OAUTH_STATE_COOKIE_NAME, signedCookie, {
      ...this.cookieBaseOptions(),
      maxAge: 10 * 60 * 1000,
    });
  }

  clearOAuthStateCookie(res: Response): void {
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, this.cookieBaseOptions());
  }

  setAccessCookie(res: Response, accessToken: string): void {
    const env = getEnv();
    res.cookie(ACCESS_COOKIE_NAME, accessToken, {
      ...this.cookieBaseOptions(),
      maxAge: env.accessTokenTtlSeconds * 1000,
    });
  }

  setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
    const env = getEnv();
    this.setAccessCookie(res, accessToken);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.cookieBaseOptions(),
      maxAge: env.refreshTokenTtlSeconds * 1000,
    });
  }

  clearSessionCookies(res: Response): void {
    const opts = this.cookieBaseOptions();
    res.clearCookie(ACCESS_COOKIE_NAME, opts);
    res.clearCookie(REFRESH_COOKIE_NAME, opts);
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, opts);
  }
}
