import 'reflect-metadata';
import type { Express } from 'express';
import { createNestApp } from './create-app';

let cachedHandler: Express | null = null;
let initPromise: Promise<Express> | null = null;

export async function getServerlessHandler(): Promise<Express> {
  if (cachedHandler) return cachedHandler;
  if (!initPromise) {
    initPromise = (async () => {
      const { app, expressApp } = await createNestApp();
      await app.init();
      cachedHandler = expressApp;
      return expressApp;
    })();
  }
  return initPromise;
}
