/**
 * Ogelfy AI — Idempotency Plugin
 *
 * Caches responses by Idempotency-Key header. Duplicate requests within the TTL
 * get the cached response immediately — preventing double-billing on AI API calls.
 *
 * Usage:
 *   import { idempotencyPlugin } from './ai/idempotency';
 *   app.register(idempotencyPlugin, { ttlMs: 86400000 }); // 24h cache
 *
 * Clients send:
 *   POST /chat
 *   Idempotency-Key: <uuid>
 *   { "message": "Hello" }
 *
 * Only applies to non-safe methods (POST, PUT, PATCH, DELETE).
 */

import type { OgelfyPlugin } from '../types';

export interface IdempotencyOptions {
  /** TTL for cached responses in milliseconds. Default: 24 hours. */
  ttlMs?: number;
  /** Header name to check. Default: 'idempotency-key'. */
  headerName?: string;
  /** Max entries to cache before evicting oldest. Default: 10000. */
  maxSize?: number;
  /**
   * Custom storage backend. Defaults to in-memory.
   * Implement this interface to use Redis or another store.
   */
  store?: IdempotencyStore;
}

export interface IdempotencyStore {
  get(key: string): Promise<CachedResponse | null>;
  set(key: string, response: CachedResponse, ttlMs: number): Promise<void>;
}

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  createdAt: number;
}

/**
 * In-memory idempotency store with LRU eviction.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private cache: Map<string, CachedResponse> = new Map();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  async get(key: string): Promise<CachedResponse | null> {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, response: CachedResponse, _ttlMs: number): Promise<void> {
    // Simple LRU: evict oldest entry when at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, response);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Idempotency plugin for Ogelfy.
 * Register at the app level to protect all non-safe routes.
 */
export const idempotencyPlugin: OgelfyPlugin = async (app, options: IdempotencyOptions = {}) => {
  const {
    ttlMs = 24 * 60 * 60 * 1000, // 24 hours
    headerName = 'idempotency-key',
    maxSize = 10000,
    store = new MemoryIdempotencyStore(maxSize),
  } = options as IdempotencyOptions;

  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  app.addHook('onRequest', async (req: any, reply: any) => {
    // Only apply to non-safe methods
    if (SAFE_METHODS.has(req.method)) return;

    const idempotencyKey = req.headers.get(headerName);
    if (!idempotencyKey) return;

    // Check cache
    const cached = await store.get(idempotencyKey);
    if (!cached) return;

    // Check TTL
    if (Date.now() - cached.createdAt > ttlMs) return;

    // Return cached response immediately
    reply.status(cached.statusCode);
    Object.entries(cached.headers).forEach(([k, v]) => reply.header(k, v as string));
    reply.header('Idempotency-Replay', 'true');
    reply.send(cached.body);
  });

  app.addHook('onSend', async (req: any, reply: any, payload: any) => {
    // Only cache non-safe methods with an idempotency key
    if (SAFE_METHODS.has(req.method)) return payload;

    const idempotencyKey = req.headers.get(headerName);
    if (!idempotencyKey) return payload;

    // Don't re-cache replay responses
    if (reply.getHeader('Idempotency-Replay')) return payload;

    // Cache the response
    const headers: Record<string, string> = {};
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);

    await store.set(idempotencyKey, {
      statusCode: reply.statusCode,
      headers,
      body,
      createdAt: Date.now(),
    }, ttlMs);

    return payload;
  });
};
