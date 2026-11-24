import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { getEnv } from './config/env';

export async function createNestApp(): Promise<{
  app: Awaited<ReturnType<typeof NestFactory.create>>;
  expressApp: Express;
}> {
  const env = getEnv();
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  return { app, expressApp };
}
