import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressHandler = (req: IncomingMessage, res: ServerResponse) => void;

let handlerPromise: Promise<ExpressHandler> | null = null;

async function loadHandler(): Promise<ExpressHandler> {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const mod = (await import('../apps/api/dist/serverless.js')) as {
        getServerlessHandler: () => Promise<ExpressHandler>;
      };
      return mod.getServerlessHandler();
    })();
  }
  return handlerPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const expressHandler = await loadHandler();
  expressHandler(req, res);
}
