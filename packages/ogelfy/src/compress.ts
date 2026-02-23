/**
 * Ogelfy — Compress Plugin
 *
 * Response compression using Bun's native gzip API (Bun.gzipSync).
 *
 * Compression policy:
 *   - Negotiates via Accept-Encoding; supports gzip and identity
 *   - 'br' in Accept-Encoding is accepted and served as gzip (Bun 1.x lacks
 *     a sync brotli API; update when Bun.brotliCompressSync ships)
 *   - Only compresses text content types: application/json, text/*
 *   - Skips payloads below the threshold (default 1024 bytes)
 *   - Sets Content-Encoding: gzip and Vary: Accept-Encoding
 *
 * Usage:
 *   import { compressPlugin } from 'ogelfy/compress';
 *   app.register(compressPlugin);
 *
 *   // Custom threshold:
 *   app.register(compressPlugin, { threshold: 2048 });
 */

import type { OgelfyPlugin } from './types';
import { fp } from './plugin-registry';

export interface CompressOptions {
  /**
   * Minimum response size in bytes before compression is applied.
   * Default: 1024
   */
  threshold?: number;

  /**
   * Encoding preference order. Currently only 'gzip' is executed synchronously;
   * 'br' is accepted via Accept-Encoding negotiation but served as gzip until
   * Bun exposes a synchronous brotli API.
   * Default: ['br', 'gzip']
   */
  encodings?: Array<'br' | 'gzip'>;

  /**
   * Custom predicate to decide whether to compress a given Content-Type.
   * Default: compresses application/json and text/* content types.
   */
  shouldCompress?: (contentType: string) => boolean;
}

/**
 * Default compressible content-type check.
 */
function defaultShouldCompress(contentType: string): boolean {
  if (!contentType) return false;
  const bare = contentType.split(';')[0]!.trim().toLowerCase();
  return bare === 'application/json' || bare.startsWith('text/');
}

/**
 * Parse Accept-Encoding header into a set of accepted encoding names.
 * Encodings with q=0 are explicitly rejected and excluded.
 */
function parseAcceptEncoding(header: string | null): Set<string> {
  const accepted = new Set<string>();
  if (!header) return accepted;

  for (const part of header.split(',')) {
    const eqIdx = part.indexOf(';');
    const encoding = (eqIdx === -1 ? part : part.slice(0, eqIdx)).trim().toLowerCase();
    if (!encoding) continue;

    const qMatch = part.match(/;\s*q\s*=\s*([0-9.]+)/);
    const q = qMatch ? parseFloat(qMatch[1]!) : 1;
    if (q > 0) accepted.add(encoding);
  }

  return accepted;
}

/**
 * Compress a string with gzip using Bun's native gzipSync.
 * TextEncoder always produces Uint8Array<ArrayBuffer> at runtime; the cast
 * satisfies the Bun type overload which requires the narrower buffer type.
 */
function gzipString(data: string): Uint8Array<ArrayBuffer> {
  const input = new TextEncoder().encode(data) as unknown as Uint8Array<ArrayBuffer>;
  return Bun.gzipSync(input);
}

/**
 * Compress plugin — not encapsulated so it applies to all routes globally.
 */
const _compressPlugin: OgelfyPlugin = async (app, options: CompressOptions = {}) => {
  const {
    threshold = 1024,
    encodings = ['br', 'gzip'],
    shouldCompress = defaultShouldCompress,
  } = options;

  // Build the set of encodings we will accept from the client.
  // 'br' is treated as 'gzip' since Bun 1.x has no sync brotli API.
  const acceptableEncodings = new Set<string>(encodings);
  // Always include 'gzip' as a fallback when 'br' is requested
  if (acceptableEncodings.has('br')) {
    acceptableEncodings.add('gzip');
  }

  app.addHook('onSend', async (req: any, reply: any, payload: any) => {
    // Only compress string bodies; streaming/binary/null pass through untouched
    if (typeof payload !== 'string') return payload;

    // Below threshold — not worth compressing
    if (payload.length < threshold) return payload;

    // Check Content-Type compressibility
    const contentType: string = reply.getHeader('content-type')
      ?? reply.getHeader('Content-Type')
      ?? '';

    if (!shouldCompress(contentType)) return payload;

    // Negotiate encoding from client's Accept-Encoding
    const acceptEncoding: string | null = req.headers?.get
      ? req.headers.get('accept-encoding')
      : (req.headers?.['accept-encoding'] ?? null);

    const clientAccepted = parseAcceptEncoding(acceptEncoding);

    // Check if client accepts any encoding we can produce.
    // 'br' in client header → we serve gzip (closest we have synchronously).
    const canCompress =
      clientAccepted.has('*') ||
      clientAccepted.has('gzip') ||
      (clientAccepted.has('br') && acceptableEncodings.has('br'));

    if (!canCompress) return payload;

    // Compress
    let compressed: Uint8Array<ArrayBuffer>;
    try {
      compressed = gzipString(payload);
    } catch {
      // Compression failed — fall back to uncompressed
      return payload;
    }

    // Apply compression headers
    reply.header('Content-Encoding', 'gzip');
    reply.header('Vary', 'Accept-Encoding');
    // Invalidate Content-Length — byte count has changed
    reply.removeHeader('Content-Length');
    reply.removeHeader('content-length');

    return compressed;
  });
};

export const compressPlugin = fp(_compressPlugin, {
  name: 'ogelfy-compress',
  encapsulate: false,
});
