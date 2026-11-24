import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

let loaded = false;

function loadDotEnvOnce(): void {
  if (loaded) return;
  loaded = true;
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

export interface ApiEnv {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  frontendUrl: string;
  corsOrigins: string[];
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  oauthStateSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  cookieSameSite: 'lax' | 'none' | 'strict';
  cookieSecure: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleCallbackUrl: string;
}

export function getEnv(): ApiEnv {
  loadDotEnvOnce();

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const vercelOrigin = vercelHost ? `https://${vercelHost}` : undefined;
  const frontendUrl = (process.env.FRONTEND_URL ?? vercelOrigin ?? 'http://localhost:5173').replace(
    /\/+$/,
    '',
  );
  const rawOrigins = process.env.CORS_ORIGINS ?? frontendUrl;
  const corsOrigins = rawOrigins
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const sameSiteRaw = (process.env.COOKIE_SAME_SITE ?? 'lax').toLowerCase();
  const cookieSameSite: 'lax' | 'none' | 'strict' =
    sameSiteRaw === 'none' || sameSiteRaw === 'strict' ? sameSiteRaw : 'lax';
  const cookieSecure =
    process.env.COOKIE_SECURE === 'true' ||
    cookieSameSite === 'none' ||
    nodeEnv === 'production' ||
    Boolean(process.env.VERCEL);

  const port = Number.parseInt(process.env.PORT ?? '4001', 10) || 4001;
  const accessTokenTtlSeconds = Number.parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS ?? '900', 10) || 900;
  const refreshTokenTtlSeconds =
    Number.parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS ?? '604800', 10) || 604800;

  return {
    port,
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://atlas:atlas@localhost:5432/atlas_infra',
    frontendUrl,
    corsOrigins,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-only-access-secret-change-in-production-32chars',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-only-refresh-secret-change-in-production-32chars',
    oauthStateSecret: process.env.OAUTH_STATE_SECRET ?? 'dev-only-oauth-state-secret-change-in-prod-32chars',
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    cookieSameSite,
    cookieSecure,
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? `${frontendUrl}/api/auth/google/callback`,
  };
}
