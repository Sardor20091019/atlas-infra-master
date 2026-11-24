import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(import.meta.dirname, '../..');
  const env = loadEnv(mode, rootDir, '');
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    (env.PORT ? `http://localhost:${env.PORT}` : 'http://localhost:4001');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@atlas/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
