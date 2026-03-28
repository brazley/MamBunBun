/**
 * MamBunBun Auth Plugin
 *
 * Ogelfy plugin that verifies Bearer JWT tokens on every request.
 * Paths listed in `exclude` skip authentication entirely.
 *
 * Usage:
 *   import { authPlugin } from '../plugins/auth';
 *   app.register(authPlugin, { exclude: ['/health'] });
 *
 * On success the decoded JWT payload is stored on `req.auth`.
 * In development mode, requests without a token fall through
 * with a `{ userId: 'dev-anonymous' }` context.
 */

import type { OgelfyPlugin } from '../../packages/ogelfy/src/types';
import { fp } from '../../packages/ogelfy/src/plugin-registry';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AuthContext {
  userId: string;
  role?: string;
  [key: string]: any;
}

export interface AuthPluginOptions {
  /** Paths that bypass authentication (exact match). */
  exclude?: string[];
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

const _authPlugin: OgelfyPlugin = async (app, options: AuthPluginOptions = {}) => {
  const excludedPaths = new Set(options.exclude ?? []);

  app.addHook('onRequest', async (req: any, reply: any) => {
    // Skip excluded paths
    const pathname: string = req.url ?? '';
    if (excludedPaths.has(pathname)) return;

    const authHeader: string | null = req.headers.get
      ? req.headers.get('authorization')
      : (req.headers?.['authorization'] ?? null);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Development fallback — allow anonymous access
      if (env.NODE_ENV === 'development') {
        req.auth = { userId: 'dev-anonymous' } as AuthContext;
        return;
      }
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AuthContext;
      req.auth = decoded;
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
};

export const authPlugin = fp(_authPlugin, {
  name: 'mambunbun-auth',
  encapsulate: false,
});

/* ------------------------------------------------------------------ */
/*  Standalone helpers (useful outside the plugin)                     */
/* ------------------------------------------------------------------ */

/**
 * Sign a new JWT for the given user.
 */
export function generateToken(userId: string, extra?: Record<string, any>): string {
  return jwt.sign({ userId, ...extra }, env.JWT_SECRET, { expiresIn: '24h' });
}

/**
 * Extract the raw Bearer token from a request without verifying it.
 */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}
