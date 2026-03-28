/**
 * MamBunBun Rate Limit Plugin
 *
 * Ogelfy plugin that applies a sliding-window rate limit per client IP.
 * Uses an in-memory Map store — suitable for single-instance deployments.
 *
 * Usage:
 *   import { rateLimitPlugin } from '../plugins/rate-limit';
 *   app.register(rateLimitPlugin, { limit: 100, windowMs: 60_000 });
 */

import type { OgelfyPlugin } from '../../packages/ogelfy/src/types';
import { fp } from '../../packages/ogelfy/src/plugin-registry';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RateLimitOptions {
  /** Maximum requests per window. Default: 100 */
  limit?: number;
  /** Window duration in milliseconds. Default: 60 000 (60 s) */
  windowMs?: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

const store = new Map<string, RateLimitRecord>();

const _rateLimitPlugin: OgelfyPlugin = async (app, options: RateLimitOptions = {}) => {
  const limit = options.limit ?? 100;
  const windowMs = options.windowMs ?? 60_000;

  app.addHook('onRequest', async (req: any, reply: any) => {
    const ip: string = req.headers.get
      ? (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown')
      : (req.headers?.['x-forwarded-for'] ?? req.headers?.['x-real-ip'] ?? 'unknown');

    const now = Date.now();
    const record = store.get(ip);

    // First request or window expired — reset
    if (!record || now > record.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return;
    }

    // Over limit
    if (record.count >= limit) {
      const remainingMs = record.resetAt - now;
      const retryAfter = Math.ceil(remainingMs / 1000);

      reply.header('Retry-After', String(retryAfter));
      reply.status(429).send({
        error: 'Rate limit exceeded',
        retryAfter,
      });
      return;
    }

    // Under limit — increment
    record.count++;
  });
};

export const rateLimitPlugin = fp(_rateLimitPlugin, {
  name: 'mambunbun-rate-limit',
  encapsulate: false,
});
