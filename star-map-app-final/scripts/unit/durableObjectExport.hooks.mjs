/**
 * Resolve hooks for Durable Object export route tests:
 * map next/server and stub @opennextjs/cloudflare getCloudflareContext.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, '../..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') {
    return {
      url: pathToFileURL(path.join(UNIT_DIR, 'cloudflareWorkers.stub.mjs')).href,
      shortCircuit: true,
    };
  }
  if (specifier === 'next/server') {
    return {
      url: pathToFileURL(path.join(APP_ROOT, 'node_modules/next/server.js')).href,
      shortCircuit: true,
    };
  }
  if (specifier === '@opennextjs/cloudflare') {
    return {
      url: pathToFileURL(path.join(UNIT_DIR, 'durableObjectExport.opennext-stub.mjs')).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
