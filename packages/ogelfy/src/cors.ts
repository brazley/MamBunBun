/**
 * Ogelfy — CORS Plugin
 *
 * A proper Ogelfy plugin for Cross-Origin Resource Sharing. Handles OPTIONS
 * preflight requests and injects CORS headers on all other requests.
 *
 * Usage:
 *   import { corsPlugin } from 'ogelfy/cors';
 *   app.register(corsPlugin, { origin: '*' });
 *
 *   // Specific origin:
 *   app.register(corsPlugin, { origin: 'https://myapp.com' });
 *
 *   // Multiple origins:
 *   app.register(corsPlugin, { origin: ['https://myapp.com', 'https://admin.myapp.com'] });
 *
 *   // Dynamic origin check:
 *   app.register(corsPlugin, {
 *     origin: (origin) => origin.endsWith('.myapp.com'),
 *   });
 */

import type { OgelfyPlugin } from './types';
import { fp } from './plugin-registry';

export interface CorsOptions {
  /**
   * Allowed origin(s). Accepts:
   *   - '*'                          — allow all origins (no credentials)
   *   - string                       — exact origin match
   *   - string[]                     — allow any of these origins
   *   - (origin: string) => boolean  — dynamic predicate
   *
   * Default: '*'
   */
  origin?: '*' | string | string[] | ((origin: string) => boolean);

  /**
   * Allowed HTTP methods returned in Access-Control-Allow-Methods.
   * Default: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
   */
  methods?: string | string[];

  /**
   * Allowed request headers. If omitted, reflects the request's
   * Access-Control-Request-Headers back in the preflight response.
   */
  allowedHeaders?: string | string[];

  /**
   * Response headers exposed to browser JS via Access-Control-Expose-Headers.
   */
  exposedHeaders?: string | string[];

  /**
   * Whether to allow cookies / auth headers (Access-Control-Allow-Credentials).
   * Cannot be combined with origin: '*'.
   * Default: false
   */
  credentials?: boolean;

  /**
   * How long browsers may cache the preflight response (seconds).
   * Sets Access-Control-Max-Age.
   * Default: undefined (browser default)
   */
  maxAge?: number;
}

const DEFAULT_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE';

/**
 * Resolve which origin value to echo back given an incoming request origin.
 * Returns null when the origin is not allowed.
 */
function resolveOrigin(
  incomingOrigin: string | null,
  option: CorsOptions['origin']
): string | null {
  if (!option || option === '*') {
    return '*';
  }

  if (!incomingOrigin) return null;

  if (typeof option === 'function') {
    return option(incomingOrigin) ? incomingOrigin : null;
  }

  if (Array.isArray(option)) {
    return option.includes(incomingOrigin) ? incomingOrigin : null;
  }

  // Single string
  return option === incomingOrigin ? incomingOrigin : null;
}

/**
 * Build the CORS headers object for a given request.
 * Returns an empty object when the origin is not allowed.
 */
function buildCorsHeaders(
  incomingOrigin: string | null,
  opts: CorsOptions,
  isPreflight: boolean,
  requestedHeaders?: string | null
): Record<string, string> {
  const resolvedOrigin = resolveOrigin(incomingOrigin, opts.origin);

  if (!resolvedOrigin) return {};

  const headers: Record<string, string> = {};

  headers['Access-Control-Allow-Origin'] = resolvedOrigin;

  // Vary: Origin when we're echoing back a specific origin (not '*')
  if (resolvedOrigin !== '*') {
    headers['Vary'] = 'Origin';
  }

  if (opts.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  if (isPreflight) {
    const methods = Array.isArray(opts.methods)
      ? opts.methods.join(',')
      : (opts.methods ?? DEFAULT_METHODS);
    headers['Access-Control-Allow-Methods'] = methods;

    // Allowed headers: use configured value or reflect the request's
    const allowedHeaders = opts.allowedHeaders
      ? (Array.isArray(opts.allowedHeaders)
          ? opts.allowedHeaders.join(',')
          : opts.allowedHeaders)
      : (requestedHeaders ?? '');

    if (allowedHeaders) {
      headers['Access-Control-Allow-Headers'] = allowedHeaders;
    }

    if (opts.maxAge !== undefined) {
      headers['Access-Control-Max-Age'] = String(opts.maxAge);
    }
  }

  if (!isPreflight && opts.exposedHeaders) {
    headers['Access-Control-Expose-Headers'] = Array.isArray(opts.exposedHeaders)
      ? opts.exposedHeaders.join(',')
      : opts.exposedHeaders;
  }

  return headers;
}

/**
 * CORS plugin for Ogelfy — not encapsulated so CORS headers apply globally.
 */
const _corsPlugin: OgelfyPlugin = async (app, options: CorsOptions = {}) => {
  app.addHook('onRequest', async (req: any, reply: any) => {
    const incomingOrigin: string | null = req.headers.get
      ? req.headers.get('origin')
      : (req.headers?.['origin'] ?? null);

    const isPreflight = req.method === 'OPTIONS';

    const requestedHeaders: string | null = req.headers.get
      ? req.headers.get('access-control-request-headers')
      : (req.headers?.['access-control-request-headers'] ?? null);

    const corsHeaders = buildCorsHeaders(
      incomingOrigin,
      options,
      isPreflight,
      requestedHeaders
    );

    // Apply headers to reply
    for (const [key, value] of Object.entries(corsHeaders)) {
      reply.header(key, value);
    }

    // Short-circuit OPTIONS preflight with 204 No Content
    if (isPreflight) {
      reply.status(204).send('');
    }
  });
};

export const corsPlugin = fp(_corsPlugin, {
  name: 'ogelfy-cors',
  encapsulate: false,
});
