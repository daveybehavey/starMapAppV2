import { fakeCloudflareEnv } from './durableObjectExport.fakeEnv.mjs';

export function getCloudflareContext() {
  if (!fakeCloudflareEnv.current) {
    throw new Error('Cloudflare context unavailable');
  }
  return { env: fakeCloudflareEnv.current };
}
