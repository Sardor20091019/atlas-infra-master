import { Pool } from 'pg';

export function createPgPool(connectionString: string): Pool {
  const isServerless = Boolean(process.env.VERCEL);
  return new Pool({
    connectionString,
    ...(isServerless ? { max: 5, idleTimeoutMillis: 10_000 } : {}),
  });
}
