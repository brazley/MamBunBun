/**
 * Ogelfy Lifecycle Hooks System
 *
 * Comprehensive hook management covering entire request lifecycle:
 * onRequest → preParsing → preValidation → preHandler → handler → preSerialization → onSend → onResponse
 *
 * Error path: onError
 * Timeout path: onTimeout
 */

import type { RouteContext } from './types';
import { createSSEResponse, type SSEEvent } from './ai/sse';

export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'strict' | 'lax' | 'none';
  secure?: boolean;
}

/**
 * Hook names representing different stages in request lifecycle
 */
export type HookName =
  | 'onRequest'        // Earliest interception - before any processing
  | 'preParsing'       // Before body parsing - rate limiting, decompression
  | 'preValidation'    // After parsing, before schema validation
  | 'preHandler'       // After validation, before handler - auth, permissions
  | 'preSerialization' // After handler, before JSON serialization - transform data
  | 'onSend'           // Before response sent - compression, final modifications
  | 'onResponse'       // After response sent - logging, metrics, cleanup
  | 'onError'          // On any error during lifecycle
  | 'onTimeout'        // On request timeout
  | 'onClose'          // On server shutdown
  | 'onRequestAbort';  // On client abort (AbortSignal fired)

/**
 * Extended request with hook-related metadata
 */
export interface HookRequest extends Request {
  id?: string;
  startTime?: number;
  context?: RouteContext;
  [key: string]: any; // Allow decorators
}

/**
 * Reply object for building HTTP responses
 */
export class Reply {
  private _statusCode: number = 200;
  private _headers: Map<string, string> = new Map();
  private _body: any = null;
  private _sent: boolean = false;
  private _response?: Response;
  private _startTime?: number;
  private _hijacked: boolean = false;

  /** Injected by handleRequest — triggers the 404 handler from within a route. */
  callNotFound?: () => Response | Promise<Response>;

  [key: string]: any; // Allow decorators

  get statusCode(): number {
    return this._statusCode;
  }

  get sent(): boolean {
    return this._sent;
  }

  get response(): Response {
    if (this._response) {
      return this._response;
    }

    // Build response from current state
    const headers: Record<string, string> = {};
    this._headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (!headers['Content-Type'] && this._body !== null) {
      headers['Content-Type'] = 'application/json';
    }

    const body = typeof this._body === 'string'
      ? this._body
      : this._body !== null
        ? JSON.stringify(this._body)
        : null;

    this._response = new Response(body, {
      status: this._statusCode,
      headers,
    });

    return this._response;
  }

  /**
   * Set response status code
   */
  status(code: number): this {
    if (this._sent) {
      throw new Error('Cannot set status after response sent');
    }
    this._statusCode = code;
    return this;
  }

  /**
   * Set response header
   */
  header(name: string, value: string): this {
    if (this._sent) {
      throw new Error('Cannot set header after response sent');
    }
    this._headers.set(name, value);
    return this;
  }

  /**
   * Set multiple headers at once
   */
  headers(headers: Record<string, string>): this {
    if (this._sent) {
      throw new Error('Cannot set headers after response sent');
    }
    Object.entries(headers).forEach(([name, value]) => {
      this._headers.set(name, value);
    });
    return this;
  }

  /**
   * Send response
   */
  send(payload: any): this {
    if (this._sent) {
      throw new Error('Reply already sent');
    }
    this._body = payload;
    this._sent = true;
    return this;
  }

  /**
   * Convenience method - set status and send in one call
   */
  code(statusCode: number): this {
    return this.status(statusCode);
  }

  /**
   * Get header value
   */
  getHeader(name: string): string | undefined {
    return this._headers.get(name);
  }

  /**
   * Remove header
   */
  removeHeader(name: string): this {
    this._headers.delete(name);
    return this;
  }

  /**
   * Check if header exists
   */
  hasHeader(name: string): boolean {
    return this._headers.has(name);
  }

  /**
   * Set raw Response object (for advanced usage)
   */
  setResponse(response: Response): void {
    this._response = response;
    this._sent = true;
  }

  /**
   * Send a Server-Sent Events streaming response.
   * Returns a streaming Response — the handler should return the result of reply.sse().
   *
   * @example
   * app.get('/stream', async (req, reply) => {
   *   async function* tokens() {
   *     yield 'Hello ';
   *     yield 'world';
   *   }
   *   return reply.sse(tokens());
   * });
   */
  sse(
    source: AsyncIterable<SSEEvent | string> | Iterable<SSEEvent | string> | ReadableStream<SSEEvent | string>,
    options?: { headers?: Record<string, string>; heartbeatMs?: number }
  ): Response {
    const response = createSSEResponse(source, options);
    this.setResponse(response);
    return response;
  }

  /**
   * Send a generic chunked streaming response.
   *
   * Accepts an AsyncIterable or ReadableStream and pipes it directly into a
   * streaming Response body. Useful for large JSON exports, file downloads, or
   * any chunked transfer that is NOT Server-Sent Events (use reply.sse() for SSE).
   *
   * Returns the Response — the handler should return the result of reply.stream().
   *
   * @example
   * app.get('/export', async (req, reply) => {
   *   async function* generate() {
   *     yield '["row1"';
   *     yield ',"row2"';
   *     yield ']';
   *   }
   *   return reply.stream(generate(), { contentType: 'application/json' });
   * });
   */
  stream(
    source: AsyncIterable<string | Uint8Array> | ReadableStream<string | Uint8Array>,
    opts?: { contentType?: string; status?: number }
  ): Response {
    const status = opts?.status ?? 200;
    const contentType = opts?.contentType ?? 'application/octet-stream';
    const encoder = new TextEncoder();

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (source instanceof ReadableStream) {
            const reader = source.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (typeof value === 'string') {
                controller.enqueue(encoder.encode(value));
              } else {
                controller.enqueue(value);
              }
            }
          } else {
            for await (const chunk of source) {
              if (typeof chunk === 'string') {
                controller.enqueue(encoder.encode(chunk));
              } else {
                controller.enqueue(chunk);
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    const response = new Response(readable, {
      status,
      headers: { 'Content-Type': contentType },
    });

    this.setResponse(response);
    return response;
  }

  /**
   * Set the Content-Type header
   */
  type(contentType: string): this {
    return this.header('content-type', contentType);
  }

  /**
   * Send a redirect response
   */
  redirect(url: string): void;
  redirect(statusCode: number, url: string): void;
  redirect(statusCodeOrUrl: number | string, url?: string): void {
    const status = typeof statusCodeOrUrl === 'number' ? statusCodeOrUrl : 302;
    const location = typeof statusCodeOrUrl === 'string' ? statusCodeOrUrl : url!;
    this._statusCode = status;
    this._headers.set('location', location);
    this._body = null;
    this._sent = true;
    this._response = new Response(null, { status, headers: { location } });
  }

  /**
   * Set a cookie on the response
   */
  setCookie(name: string, value: string, options?: CookieOptions): this {
    const cookie = this._serializeCookie(name, value, options);
    const existing = this._headers.get('set-cookie');
    this._headers.set('set-cookie', existing ? `${existing}, ${cookie}` : cookie);
    return this;
  }

  /**
   * Clear a cookie by setting it with maxAge 0
   */
  clearCookie(name: string, options?: CookieOptions): this {
    return this.setCookie(name, '', { ...options, maxAge: 0 });
  }

  private _serializeCookie(name: string, value: string, options?: CookieOptions): string {
    let cookie = `${name}=${encodeURIComponent(value)}`;
    if (options?.domain) cookie += `; Domain=${options.domain}`;
    if (options?.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
    if (options?.httpOnly) cookie += `; HttpOnly`;
    if (options?.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
    if (options?.path) cookie += `; Path=${options.path}`;
    if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`;
    if (options?.secure) cookie += `; Secure`;
    return cookie;
  }

  /**
   * Record the request start timestamp so getResponseTime() can compute elapsed ms.
   * Called by handleRequest() immediately after creating the Reply instance.
   */
  setStartTime(t: number): void {
    this._startTime = t;
  }

  /**
   * Return elapsed milliseconds since the request started.
   * Returns 0 if setStartTime() was never called.
   */
  getResponseTime(): number {
    return this._startTime !== undefined ? Date.now() - this._startTime : 0;
  }

  /**
   * Whether this reply has been hijacked (raw control taken by the handler).
   */
  get hijacked(): boolean {
    return this._hijacked;
  }

  /**
   * Take raw control of the connection.
   * Signals the framework to skip all serialization and hook finalization.
   * Also marks the reply as sent so no further send() calls are attempted.
   */
  hijack(): void {
    this._hijacked = true;
    this._sent = true;
  }
}

/**
 * Hook handler function signature
 */
export type HookHandler = (
  req: HookRequest,
  reply: Reply,
  payload?: any,
  error?: Error
) => Promise<void | any> | void | any;

/**
 * Hook context for route-level hooks
 */
export interface RouteHooks {
  onRequest?: HookHandler[];
  preParsing?: HookHandler[];
  preValidation?: HookHandler[];
  preHandler?: HookHandler[];
  preSerialization?: HookHandler[];
  onSend?: HookHandler[];
  onResponse?: HookHandler[];
  onError?: HookHandler[];
  onTimeout?: HookHandler[];
}

/**
 * Hook Manager - manages lifecycle hooks with proper execution order
 */
export class HookManager {
  private hooks: Map<HookName, HookHandler[]> = new Map();

  constructor() {
    // Initialize empty arrays for all hook types
    this.hooks.set('onRequest', []);
    this.hooks.set('preParsing', []);
    this.hooks.set('preValidation', []);
    this.hooks.set('preHandler', []);
    this.hooks.set('preSerialization', []);
    this.hooks.set('onSend', []);
    this.hooks.set('onResponse', []);
    this.hooks.set('onError', []);
    this.hooks.set('onTimeout', []);
    this.hooks.set('onClose', []);
    this.hooks.set('onRequestAbort', []);
  }

  /**
   * Add a hook handler for a specific lifecycle event
   */
  add(name: HookName, handler: HookHandler): void {
    const handlers = this.hooks.get(name);
    if (!handlers) {
      throw new Error(`Invalid hook name: ${name}`);
    }
    handlers.push(handler);
  }

  /**
   * Execute all hooks for a specific lifecycle event
   * Returns transformed payload if hook returns a value
   */
  async run(
    name: HookName,
    req: HookRequest,
    reply: Reply,
    payload?: any,
    error?: Error
  ): Promise<any> {
    const handlers = this.hooks.get(name);
    if (!handlers || handlers.length === 0) {
      return payload;
    }

    let currentPayload = payload;

    for (const handler of handlers) {
      // Stop execution if reply was sent during hook
      if (reply.sent) {
        return currentPayload;
      }

      try {
        const result = await handler(req, reply, currentPayload, error);

        // If hook returns a value, use it as transformed payload.
        // Applies to preSerialization (transform data) and onSend (transform serialized body).
        if (result !== undefined && (name === 'preSerialization' || name === 'onSend')) {
          currentPayload = result;
        }
      } catch (err) {
        // If error occurs in hook, propagate it
        throw err;
      }
    }

    return currentPayload;
  }

  /**
   * Execute route-level hooks followed by global hooks
   * Route hooks execute BEFORE global hooks for the same phase
   */
  async runWithRoute(
    name: HookName,
    routeHooks: RouteHooks | undefined,
    req: HookRequest,
    reply: Reply,
    payload?: any,
    error?: Error
  ): Promise<any> {
    // Fast path: skip entirely when no hooks are registered for this phase anywhere
    const globalHandlers = this.hooks.get(name);
    const routeHandlers = routeHooks?.[name as keyof RouteHooks];
    if ((!globalHandlers || globalHandlers.length === 0) &&
        (!routeHandlers || routeHandlers.length === 0)) {
      return payload;
    }

    let currentPayload = payload;

    // Execute route-level hooks first
    if (routeHooks) {
      const routeHandlers = routeHooks[name as keyof RouteHooks];
      if (routeHandlers && routeHandlers.length > 0) {
        for (const handler of routeHandlers) {
          if (reply.sent) return currentPayload;

          try {
            const result = await handler(req, reply, currentPayload, error);
            if (result !== undefined && (name === 'preSerialization' || name === 'onSend')) {
              currentPayload = result;
            }
          } catch (err) {
            throw err;
          }
        }
      }
    }

    // Then execute global hooks
    return await this.run(name, req, reply, currentPayload, error);
  }

  /**
   * Check if any hooks are registered for a lifecycle event
   */
  has(name: HookName): boolean {
    const handlers = this.hooks.get(name);
    return Boolean(handlers && handlers.length > 0);
  }

  /**
   * Get all hooks for a lifecycle event
   */
  get(name: HookName): HookHandler[] {
    return this.hooks.get(name) || [];
  }

  /**
   * Clear all hooks for a lifecycle event
   */
  clear(name?: HookName): void {
    if (name) {
      this.hooks.set(name, []);
    } else {
      // Clear all hooks
      this.hooks.forEach((_, hookName) => {
        this.hooks.set(hookName, []);
      });
    }
  }

  /**
   * Get count of hooks for a lifecycle event
   */
  count(name: HookName): number {
    return this.hooks.get(name)?.length || 0;
  }

  /**
   * Clone hook manager (for plugin context isolation)
   * Creates a new manager with copies of all hook arrays
   */
  clone(): HookManager {
    const cloned = new HookManager();
    this.hooks.forEach((handlers, name) => {
      // Shallow copy of handler arrays - handlers are shared but arrays are independent
      cloned.hooks.set(name, [...handlers]);
    });
    return cloned;
  }

  /**
   * Merge hooks from parent manager (for plugin inheritance)
   * Adds parent hooks before child hooks in execution order
   */
  inherit(parent: HookManager): void {
    parent.hooks.forEach((parentHandlers, name) => {
      const childHandlers = this.hooks.get(name) || [];
      // Parent hooks execute first, then child hooks
      this.hooks.set(name, [...parentHandlers, ...childHandlers]);
    });
  }

  /**
   * Execute onError hook with proper error handling
   * If onError hooks throw, catch and log but don't propagate
   */
  async runOnError(req: HookRequest, reply: Reply, error: Error): Promise<void> {
    const handlers = this.hooks.get('onError');
    if (!handlers || handlers.length === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(req, reply, undefined, error);

        // If reply was sent during error hook, stop processing
        if (reply.sent) {
          return;
        }
      } catch (hookError) {
        // Log error in hook but don't throw - we're already handling an error
        console.error('Error in onError hook:', hookError);
      }
    }
  }

  /**
   * Execute onTimeout hook when request exceeds time limit
   */
  async runOnTimeout(req: HookRequest, reply: Reply): Promise<void> {
    const handlers = this.hooks.get('onTimeout');
    if (!handlers || handlers.length === 0) {
      // Default timeout response
      if (!reply.sent) {
        reply.status(408).send({
          error: 'Request Timeout',
          message: 'Request exceeded time limit',
          statusCode: 408
        });
      }
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(req, reply);

        if (reply.sent) {
          return;
        }
      } catch (error) {
        console.error('Error in onTimeout hook:', error);
      }
    }

    // If no hook sent a response, send default timeout response
    if (!reply.sent) {
      reply.status(408).send({
        error: 'Request Timeout',
        message: 'Request exceeded time limit',
        statusCode: 408
      });
    }
  }

  /**
   * Execute onClose hooks when the server is shutting down.
   * These handlers take no request/reply arguments — they are server-level lifecycle hooks.
   */
  async runOnClose(): Promise<void> {
    const handlers = this.hooks.get('onClose');
    if (!handlers || handlers.length === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        await (handler as () => Promise<void> | void)();
      } catch (error) {
        console.error('Error in onClose hook:', error);
      }
    }
  }

  /**
   * Return true if any hook has at least one registered handler.
   * Used by the fast-path dispatcher to decide whether to skip the full pipeline.
   */
  hasAnyHooks(): boolean {
    for (const handlers of this.hooks.values()) {
      if (handlers.length > 0) return true;
    }
    return false;
  }

  /**
   * Get all registered hook names with their counts
   */
  stats(): Record<HookName, number> {
    const stats: Record<string, number> = {};
    this.hooks.forEach((handlers, name) => {
      stats[name] = handlers.length;
    });
    return stats as Record<HookName, number>;
  }
}

/**
 * Create a new hook manager instance
 */
export function createHookManager(): HookManager {
  return new HookManager();
}

/**
 * Helper to create timeout wrapper for request handling
 */
export function createTimeoutHandler(
  timeoutMs: number,
  onTimeout: (req: HookRequest, reply: Reply) => Promise<void>
): (req: HookRequest, reply: Reply, handler: () => Promise<void>) => Promise<void> {
  return async (req: HookRequest, reply: Reply, handler: () => Promise<void>) => {
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(async () => {
        if (!reply.sent) {
          await onTimeout(req, reply);
        }
        resolve();
      }, timeoutMs);
    });

    const handlerPromise = handler();

    await Promise.race([handlerPromise, timeoutPromise]);
  };
}
