/**
 * CORS middleware — backward-compatibility shim.
 *
 * The canonical CORS implementation now lives in the Ogelfy framework as a
 * proper plugin: packages/ogelfy/src/cors.ts
 *
 * This file re-exports the plugin for any code that imports from this path,
 * and retains the legacy corsHeaders() helper for any callers that use it
 * directly (e.g. raw Response construction outside a route handler).
 */

export { corsPlugin, type CorsOptions } from '../../packages/ogelfy/src/cors';

import { env } from '../config/env';

/**
 * @deprecated Use corsPlugin registered on the Ogelfy app instead.
 * Kept for backward compatibility with any code that calls corsHeaders() directly.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

  if (origin && allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  return {};
}
