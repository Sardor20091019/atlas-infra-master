import { Injectable, UnauthorizedException } from '@nestjs/common';
import { getEnv } from '../config/env';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export const GOOGLE_OAUTH_CLIENT = Symbol('GOOGLE_OAUTH_CLIENT');

export interface GoogleOAuthClientInterface {
  buildAuthorizationUrl(state: string): string;
  exchangeCodeForUser(code: string): Promise<GoogleUserProfile>;
}

@Injectable()
export class GoogleOAuthClient implements GoogleOAuthClientInterface {
  buildAuthorizationUrl(state: string): string {
    const env = getEnv();
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: env.googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForUser(code: string): Promise<GoogleUserProfile> {
    const env = getEnv();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleCallbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException('Failed to exchange Google authorization code');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException('Google token response did not include an access token');
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new UnauthorizedException('Failed to fetch Google user profile');
    }

    const profile = (await userRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!profile.sub || !profile.email || profile.email_verified === false) {
      throw new UnauthorizedException('Google account must have a verified email address');
    }

    return {
      googleId: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name?.trim() || profile.email.split('@')[0],
      avatarUrl: profile.picture ?? null,
    };
  }
}
