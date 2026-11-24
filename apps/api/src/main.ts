import 'reflect-metadata';
import { getEnv } from './config/env';
import { createNestApp } from './create-app';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const { app } = await createNestApp();

  try {
    await app.listen(env.port);
    console.log(`Atlas API listening on http://localhost:${env.port}/api`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EACCES' || code === 'EADDRINUSE') {
      console.error(
        `Port ${env.port} is unavailable (${code}). Set PORT to another free port (e.g. PORT=4001) and update VITE_API_PROXY_TARGET in .env.`,
      );
    }
    throw err;
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start Atlas API:', err);
  process.exit(1);
});
