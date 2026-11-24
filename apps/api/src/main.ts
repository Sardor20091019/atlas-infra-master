import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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
