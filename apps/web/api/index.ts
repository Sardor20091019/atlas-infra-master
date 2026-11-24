import type { IncomingMessage, ServerResponse } from 'node:http';
// Built during Vercel buildCommand before serverless bundling.
// @ts-expect-error Compiled JS output from @atlas/api build
import { getServerlessHandler } from '../../api/dist/serverless.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const expressHandler = await getServerlessHandler();
  expressHandler(req, res);
}
