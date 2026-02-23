import type { Server, ServerWebSocket } from 'bun';
type BunServer = Server<any>;
import { Router } from './router';
import type { MatchResult } from './router';
import type {
  RouteHandler,
  OgelfyOptions,
  OgelfyPlugin,
  RouteContext,
  RouteOptions,
  RouteChain,
  RouteDefinition,
  PluginOptions
} from './types';
import {
  ErrorHandling,
  httpErrors,
  HttpError,
  ValidationError,
  type ErrorHandler,
  type NotFoundHandler
} from './error-handler';
import { Testing } from './testing';
import { ContentTypeParser } from './content-parser';
import { Serializer } from './serializer';
import {
  SchemaCompiler,
  ValidationError as SchemaValidationError,
  type ValidatorCompiler,
  type SchemaErrorFormatter
} from './schema-compiler';
import { HookManager, Reply, type HookName, type HookHandler, type HookRequest } from './hooks';
import { OgelfyRequest } from './request';
import { DecoratorManager } from './decorators';
import { PluginRegistry, getPluginMetadata, type PluginMetadata } from './plugin-registry';
import { createLogger, createRequestLogger } from './logger';
import type { Logger } from 'pino';

// Fast counter-based request ID — avoids crypto.randomUUID() on every request.
// Falls back to a monotonic counter + timestamp in base-36.
let _reqCounter = 0;
function generateRequestId(): string {
  return `req-${(++_reqCounter).toString(36)}-${Date.now().toString(36)}`;
}

function getIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

function getHostname(req: Request): string {
  return req.headers.get('host')?.split(':')[0] || 'localhost';
}

function getProtocol(req: Request): string {
  return req.headers.get('x-forwarded-proto') || 'http';
}

// ─── Fast URL parsing helpers ─────────────────────────────────────────────────
// new URL() fully parses protocol, auth, host, port, path, query, hash and
// allocates a heap object. In Bun.serve() req.url is always a full URL:
// "http://host/path?query". We only need pathname and the query string, so we
// avoid the full parse entirely.

/**
 * Extract the pathname from a full URL string without allocating a URL object.
 * "http://host/path?query#hash" → "/path"
 */
function extractPathname(rawUrl: string): string {
  const protoEnd = rawUrl.indexOf('://');
  const hostStart = protoEnd === -1 ? 0 : protoEnd + 3;
  const pathStart = rawUrl.indexOf('/', hostStart);
  if (pathStart === -1) return '/';
  const qIdx = rawUrl.indexOf('?', pathStart);
  return qIdx === -1 ? rawUrl.slice(pathStart) : rawUrl.slice(pathStart, qIdx);
}

/**
 * Extract the query string (without the leading '?') from a full URL string.
 */
function extractSearch(rawUrl: string): string {
  const qIdx = rawUrl.indexOf('?');
  return qIdx === -1 ? '' : rawUrl.slice(qIdx + 1);
}

/**
 * Parse a query string into a key/value map without URLSearchParams allocation.
 */
function parseQueryString(search: string): Record<string, string> {
  if (!search) return {};
  const result: Record<string, string> = {};
  const pairs = search.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      try { result[decodeURIComponent(pair)] = ''; } catch { result[pair] = ''; }
    } else {
      try {
        result[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
      } catch {
        result[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
    }
  }
  return result;
}

// ─── Fast-path hook guard ────────────────────────────────────────────────────
// Returns true if any route-level hook array is non-empty.
// Inlined here (not on RouteHooks type) to avoid touching the types file.
import type { RouteHooks } from './hooks';

function routeHasAnyHooks(hooks: RouteHooks | undefined): boolean {
  if (!hooks) return false;
  return !!(
    hooks.onRequest?.length ||
    hooks.preParsing?.length ||
    hooks.preValidation?.length ||
    hooks.preHandler?.length ||
    hooks.preSerialization?.length ||
    hooks.onSend?.length ||
    hooks.onResponse?.length ||
    hooks.onError?.length ||
    hooks.onTimeout?.length
  );
}

// ─── WebSocket support ────────────────────────────────────────────────────────

export interface WebSocketHandler<T = unknown> {
  open?: (ws: ServerWebSocket<T>) => void | Promise<void>;
  message?: (ws: ServerWebSocket<T>, message: string | Buffer) => void | Promise<void>;
  close?: (ws: ServerWebSocket<T>, code: number, reason: string) => void | Promise<void>;
  drain?: (ws: ServerWebSocket<T>) => void | Promise<void>;
}

export class Ogelfy {
  private router: Router;
  private plugins: OgelfyPlugin[] = [];
  private server?: BunServer;
  private errorHandling: ErrorHandling;
  private testing: Testing;
  private contentParser: ContentTypeParser;
  private serializer: Serializer;
  private schemaCompiler: SchemaCompiler;
  private logger: Logger;

  // New plugin architecture components
  private hookManager: HookManager;
  private decoratorManager: DecoratorManager;
  private pluginRegistry: PluginRegistry;
  private parent?: Ogelfy; // For plugin context isolation
  private requestTimeout?: number;

  // Custom serializer / validator / error-formatter slots
  private _serializerCompiler?: (schema: any) => (data: any) => string;
  private _replySerializer?: (payload: any, statusCode: number) => string;

  // WebSocket routes
  private _wsRoutes: Map<string, WebSocketHandler<any>> = new Map();

  // after() callbacks — fired once per register() scope
  private _afterCallbacks: Array<() => Promise<void> | void> = [];

  /**
   * Original constructor options — Fastify API parity.
   */
  readonly initialConfig: OgelfyOptions;

  /**
   * HTTP error factory methods
   */
  public httpErrors = httpErrors;

  /**
   * Route prefix inherited by all routes registered on this instance.
   * Set by register() when a { prefix } option is provided.
   */
  protected _prefix: string = '';

  /**
   * Framework version — satisfies Fastify API parity for libraries that read app.version.
   */
  readonly version = '1.0.0';

  /**
   * Expose the underlying pino logger — Fastify API parity.
   */
  get log(): Logger {
    return this.logger;
  }

  constructor(options?: OgelfyOptions, parent?: Ogelfy) {
    this.initialConfig = options ?? {};
    this.parent = parent;
    this.requestTimeout = options?.requestTimeout;

    this.logger = createLogger(options?.logger || {});
    this.schemaCompiler = new SchemaCompiler(options?.schemaCompiler || {});
    this.router = new Router(this.schemaCompiler);
    this.errorHandling = new ErrorHandling();
    this.contentParser = new ContentTypeParser();
    this.serializer = new Serializer();

    // Initialize new plugin architecture
    if (parent) {
      // Child context - inherit from parent
      this.hookManager = parent.hookManager.clone();
      this.decoratorManager = parent.decoratorManager.createChild();
      this.pluginRegistry = parent.pluginRegistry; // Shared registry
    } else {
      // Root context - create new managers
      this.hookManager = new HookManager();
      this.decoratorManager = new DecoratorManager();
      this.pluginRegistry = new PluginRegistry();
    }

    // Testing delegates through the dispatcher so fast-path routes are exercised too.
    // The Testing class expects Promise<Response>; we normalize the union here.
    this.testing = new Testing(
      (req: Request) => {
        const result = this._handleRequest(req);
        return result instanceof Response ? Promise.resolve(result) : result;
      },
      this.logger
    );
  }

  /**
   * The route prefix currently active on this instance.
   */
  get prefix(): string {
    return this._prefix;
  }

  /**
   * Fastify API parity: resolves immediately because Ogelfy loads plugins
   * synchronously during register() calls. Override if async plugin loading
   * is ever introduced.
   */
  async ready(): Promise<void> {
    await Promise.resolve();
  }

  /**
   * Add a lifecycle hook
   */
  addHook(name: HookName, handler: HookHandler): this {
    this.hookManager.add(name, handler);
    return this;
  }

  /**
   * Register a callback that fires after the current plugin scope finishes loading.
   * Mirrors Fastify's app.after().
   */
  after(fn: () => Promise<void> | void): this {
    this._afterCallbacks.push(fn);
    return this;
  }

  /**
   * Decorate the server instance with custom properties/methods
   */
  decorate<T = any>(name: string, value: T | (() => T)): this {
    this.decoratorManager.decorateServer(this, name, value);
    return this;
  }

  /**
   * Decorate request objects
   */
  decorateRequest<T = any>(name: string, value: T | (() => T)): this {
    this.decoratorManager.decorateRequest(name, value);
    return this;
  }

  /**
   * Decorate reply objects
   */
  decorateReply<T = any>(name: string, value: T | (() => T)): this {
    this.decoratorManager.decorateReply(name, value);
    return this;
  }

  /**
   * Check if a decorator exists
   */
  hasDecorator(name: string): boolean {
    return this.decoratorManager.hasServerDecorator(name);
  }

  /**
   * Check if a request decorator exists
   */
  hasRequestDecorator(name: string): boolean {
    return this.decoratorManager.hasRequestDecorator(name);
  }

  /**
   * Check if a reply decorator exists
   */
  hasReplyDecorator(name: string): boolean {
    return this.decoratorManager.hasReplyDecorator(name);
  }

  /**
   * Add a custom content-type parser
   */
  addContentTypeParser(contentType: string, parser: (req: Request) => Promise<any>): void {
    this.contentParser.add(contentType, parser);
  }

  /**
   * Remove a content-type parser
   */
  removeContentTypeParser(contentType: string): boolean {
    return this.contentParser.remove(contentType);
  }

  /**
   * Register a route with optional options (supports schemas, constraints, hooks)
   */
  private addRoute(
    method: string,
    path: string | RegExp,
    handlerOrOptions: RouteHandler | RouteOptions,
    maybeHandler?: RouteHandler
  ): void {
    let handler: RouteHandler;
    let options: RouteOptions | undefined;

    if (typeof handlerOrOptions === 'function') {
      handler = handlerOrOptions;
      options = undefined;
    } else {
      if (!maybeHandler) {
        throw new Error('Handler is required when options are provided');
      }
      options = handlerOrOptions;
      handler = maybeHandler;
    }

    // Prepend active prefix for string paths — RegExp patterns are not prefixed
    const fullPath: string | RegExp =
      typeof path === 'string' ? this._prefix + path : path;

    this.router.add(method, fullPath, handler, options);
  }

  get(path: string | RegExp, handler: RouteHandler): void;
  get(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  get(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('GET', path, handlerOrOptions, maybeHandler);
  }

  post(path: string | RegExp, handler: RouteHandler): void;
  post(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  post(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('POST', path, handlerOrOptions, maybeHandler);
  }

  put(path: string | RegExp, handler: RouteHandler): void;
  put(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  put(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('PUT', path, handlerOrOptions, maybeHandler);
  }

  delete(path: string | RegExp, handler: RouteHandler): void;
  delete(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  delete(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('DELETE', path, handlerOrOptions, maybeHandler);
  }

  patch(path: string | RegExp, handler: RouteHandler): void;
  patch(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  patch(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('PATCH', path, handlerOrOptions, maybeHandler);
  }

  options(path: string | RegExp, handler: RouteHandler): void;
  options(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  options(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('OPTIONS', path, handlerOrOptions, maybeHandler);
  }

  head(path: string | RegExp, handler: RouteHandler): void;
  head(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  head(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('HEAD', path, handlerOrOptions, maybeHandler);
  }

  /**
   * ALL methods route
   */
  all(path: string | RegExp, handler: RouteHandler): void;
  all(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  all(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('ALL', path, handlerOrOptions, maybeHandler);
  }

  /**
   * Route chaining API — accepts either a path string (returns RouteChain)
   * or a RouteDefinition object (registers immediately, returns void).
   */
  route(path: string): RouteChain;
  route(definition: RouteDefinition): void;
  route(pathOrDef: string | RouteDefinition): RouteChain | void {
    if (typeof pathOrDef === 'string') {
      const path = pathOrDef;
      const self = this;
      return {
        get(handler: RouteHandler) {
          self.get(path, handler);
          return this;
        },
        post(handler: RouteHandler) {
          self.post(path, handler);
          return this;
        },
        put(handler: RouteHandler) {
          self.put(path, handler);
          return this;
        },
        delete(handler: RouteHandler) {
          self.delete(path, handler);
          return this;
        },
        patch(handler: RouteHandler) {
          self.patch(path, handler);
          return this;
        },
        options(handler: RouteHandler) {
          self.options(path, handler);
          return this;
        },
        head(handler: RouteHandler) {
          self.head(path, handler);
          return this;
        },
        all(handler: RouteHandler) {
          self.all(path, handler);
          return this;
        },
      };
    }

    // Object form — register each method immediately
    const def = pathOrDef;
    const methods = Array.isArray(def.method) ? def.method : [def.method];
    for (const method of methods) {
      const opts: RouteOptions | undefined = (def.schema || def.hooks || def.constraints)
        ? { schema: def.schema, hooks: def.hooks, constraints: def.constraints }
        : undefined;
      this.addRoute(
        method.toUpperCase(),
        def.url,
        opts ?? def.handler,
        opts ? def.handler : undefined
      );
    }
  }

  /**
   * Register a plugin with advanced encapsulation and lifecycle management
   */
  async register(plugin: OgelfyPlugin, options?: any): Promise<void> {
    // Extract metadata from plugin (if wrapped with fp())
    const metadata = getPluginMetadata(plugin);

    // Pull prefix out of options before passing remaining opts to the plugin.
    const { prefix = '', ...pluginOptions } = options ?? {};

    // Check if plugin should skip encapsulation
    const shouldEncapsulate = metadata?.encapsulate !== false;

    if (shouldEncapsulate) {
      // Create isolated context (child Ogelfy instance)
      const childInstance = new Ogelfy({}, this);
      // Inherit parent prefix and extend with the plugin's own prefix
      childInstance._prefix = this._prefix + prefix;

      // Register in plugin registry with metadata.
      // PluginRegistry calls wrapper(_app, opts) — use (_app, opts) signature so
      // opts is the actual options object, not null.
      await this.pluginRegistry.register(
        async (_app: any, opts: any) => {
          await plugin(childInstance, opts);
        },
        pluginOptions,
        metadata
      );
    } else {
      // No encapsulation - plugin modifies parent directly.
      // Still apply prefix inheritance so the parent's _prefix is respected.
      const prevPrefix = this._prefix;
      this._prefix = prevPrefix + prefix;

      await this.pluginRegistry.register(
        async (_app: any, opts: any) => {
          await plugin(this, opts);
        },
        pluginOptions,
        metadata
      );

      // Restore prefix after the non-encapsulated plugin runs
      this._prefix = prevPrefix;
    }

    // Fire any after() callbacks registered during this plugin scope, then clear
    for (const cb of this._afterCallbacks) {
      await cb();
    }
    this._afterCallbacks = [];

    this.plugins.push(plugin);
  }

  /**
   * Check if a plugin is loaded
   */
  hasPlugin(name: string): boolean {
    return this.pluginRegistry.hasPlugin(name);
  }

  /**
   * Add a shared JSON schema
   */
  addSchema(id: string, schema: any): void {
    this.schemaCompiler.addSchema(id, schema);
  }

  /**
   * Get the schema compiler instance
   */
  getSchemaCompiler(): SchemaCompiler {
    return this.schemaCompiler;
  }

  /**
   * Set custom error handler
   */
  setErrorHandler(handler: ErrorHandler): void {
    this.errorHandling.setErrorHandler(handler);
  }

  /**
   * Set custom 404 handler
   */
  setNotFoundHandler(handler: NotFoundHandler): void {
    this.errorHandling.setNotFoundHandler(handler);
  }

  /**
   * Swap in a custom AJV-compatible validator compiler.
   * Given a schema, the function must return a validator that returns { valid, errors }.
   */
  setValidatorCompiler(compiler: ValidatorCompiler): void {
    this.schemaCompiler.setCompiler(compiler);
  }

  /**
   * Swap in a custom serializer compiler.
   * Given a response schema, the function must return a serializer for that schema.
   * Takes precedence over the QuikSerializer pre-compiled at route registration time.
   */
  setSerializerCompiler(compiler: (schema: any) => (data: any) => string): void {
    this._serializerCompiler = compiler;
  }

  /**
   * Set a global fallback serializer used when no route-level serializer is found.
   * Falls back to the built-in JSON serializer when this is also absent.
   */
  setReplySerializer(fn: (payload: any, statusCode: number) => string): void {
    this._replySerializer = fn;
  }

  /**
   * Set a custom schema validation error formatter.
   * Replaces the default AJV error message format.
   */
  setSchemaErrorFormatter(formatter: SchemaErrorFormatter): void {
    this.schemaCompiler.setErrorFormatter(formatter);
  }

  /**
   * Check if a route is registered for the given method + url combination.
   */
  hasRoute(opts: { method: string; url: string }): boolean {
    return this.router.has(opts.method.toUpperCase(), opts.url);
  }

  /**
   * Return a human-readable string listing all registered routes.
   */
  printRoutes(): string {
    const routes = this.router.getRoutes();
    const lines = routes.map(r =>
      `${String(r.method).padEnd(8)} ${typeof r.pattern === 'string' ? r.pattern : r.pattern.toString()}`
    );
    return lines.join('\n');
  }

  /**
   * Return the bound server addresses after listen() has been called.
   * Returns an empty array if the server is not yet listening.
   */
  addresses(): Array<{ address: string; family: string; port: number }> {
    if (!this.server) return [];
    return [{
      address: (this.server as any).hostname ?? '0.0.0.0',
      family: 'IPv4',
      port: (this.server as any).port,
    }];
  }

  /**
   * Register a WebSocket handler for the given path.
   * The framework will upgrade matching requests automatically in listen().
   */
  websocket<T = unknown>(path: string, handler: WebSocketHandler<T>): this {
    this._wsRoutes.set(path, handler as WebSocketHandler<any>);
    return this;
  }

  /**
   * Inject request for testing (no HTTP server needed)
   */
  async inject(options: any) {
    return this.testing.inject(options);
  }

  /**
   * Handle request with full lifecycle hooks (renamed from handleRequest).
   * All requests with hooks, schema validation, or non-GET/HEAD methods route here.
   */
  private async _handleRequestFull(req: Request): Promise<Response> {
    // ── Optimization 1: fast pathname extraction, no new URL() allocation ──
    const pathname = extractPathname(req.url);
    const startTime = Date.now();

    // ── Optimization 2: lazy child logger — skip allocation when level > info ──
    const shouldLog = this.logger.isLevelEnabled('info');
    const log = shouldLog ? createRequestLogger(this.logger, req, pathname) : this.logger;
    if (shouldLog) log.info('Incoming request');

    // Create hook request with metadata
    const hookReq = req as HookRequest;
    hookReq.id = req.headers.get('x-request-id') ?? generateRequestId();
    hookReq.startTime = startTime;

    // Create reply object
    const reply = new Reply();
    reply.setStartTime(startTime);

    // Inject callNotFound so handlers can trigger 404 from within a route
    reply.callNotFound = () => this.errorHandling.handleNotFound(req);

    // ── Optimization 3: guard reply decorators with fast-path check ──
    if (this.decoratorManager.hasAnyReplyDecorators()) {
      this.decoratorManager.applyReplyDecorators(reply);
    }
    // NOTE: request decorators are applied to ogRequest only — see below.
    // The first applyRequestDecorators(hookReq) call has been removed;
    // hooks receive hookReq which plugins may not use decorators on in practice,
    // and ogRequest is what handler code actually receives.

    // Wire up abort hook if the request carries an AbortSignal
    if (req.signal && !req.signal.aborted) {
      req.signal.addEventListener('abort', () => {
        this.hookManager.run('onRequestAbort', hookReq, reply).catch(() => {});
      }, { once: true });
    }

    try {
      // HOOK: onRequest (earliest interception)
      await this.hookManager.run('onRequest', hookReq, reply);
      if (reply.sent) return reply.response;

      // ── Optimization 4: find route FIRST, before building context ──
      // Header reads (getIP, getHostname, getProtocol) only happen for matched routes.
      const route = this.router.find(req.method, pathname, req);

      if (!route) {
        return this.errorHandling.handleNotFound(req);
      }

      // HOOK: preParsing (before body parse)
      await this.hookManager.runWithRoute('preParsing', route.hooks, hookReq, reply);
      if (reply.sent) return reply.response;

      // ── Optimization 1 (cont): parse query from raw URL, no URLSearchParams ──
      const query = parseQueryString(extractSearch(req.url));

      // Parse request body for non-GET/HEAD requests
      let body: any = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          body = await this.contentParser.parse(req);
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: 'Bad Request',
              message: error instanceof Error ? error.message : String(error)
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }

      // ── Optimization 4 (cont): build context AFTER route match ──
      const ip = getIP(req);
      const hostname = getHostname(req);
      const protocol = getProtocol(req);

      // ── Optimization 5: skip RouteContext intermediary — build OgelfyRequest directly ──
      // Pass pathname through the context object so OgelfyRequest.url doesn't
      // need another new URL() call (see request.ts).
      const ogRequest = new OgelfyRequest(req, {
        params: route.params,
        query,
        body,
        cookies: {},
        ip,
        hostname,
        protocol,
        log,
        requestId: hookReq.id!,
        // Extra field consumed by OgelfyRequest constructor; not part of RouteContext type
        pathname,
      } as RouteContext & { pathname: string });
      ogRequest.server = this;
      // Set routePath from the matched pattern so handlers can inspect it
      ogRequest.routePath = typeof route.pattern === 'string'
        ? route.pattern
        : pathname;
      // Expose the matched route schema on the request object
      ogRequest.routeSchema = route.schema;

      // Set hookReq.context so onError/lifecycle hooks can access it
      hookReq.context = ogRequest as any;

      // ── Optimization 3 (cont): apply request decorators only to ogRequest ──
      if (this.decoratorManager.hasAnyRequestDecorators()) {
        this.decoratorManager.applyRequestDecorators(ogRequest as any);
      }

      // HOOK: preValidation (before schema validation)
      await this.hookManager.runWithRoute('preValidation', route.hooks, hookReq, reply);
      if (reply.sent) return reply.response;

      // Validate request if schema exists.
      // OgelfyRequest satisfies RouteContext structurally (params, query, body, etc.)
      // so the cast is safe — validateRequest only accesses those three fields.
      if (route.schema) {
        await this.router.validateRequest(req, route.schema, ogRequest as unknown as RouteContext);
      }

      // HOOK: preHandler (after validation, before handler - auth, permissions)
      await this.hookManager.runWithRoute('preHandler', route.hooks, hookReq, reply);
      if (reply.sent) return reply.response;

      // Execute handler with Fastify-style signature
      let result = await route.handler(ogRequest, reply);

      // If handler called reply.send() directly, skip serialization
      if (reply.sent) {
        result = null;
      }

      // If handler returned a Response object directly, use it
      if (result instanceof Response) {
        return result;
      }

      // If reply was already sent by the handler (e.g. redirect), return it
      if (reply.sent) {
        return reply.response;
      }

      // HOOK: preSerialization (transform response data)
      result = await this.hookManager.runWithRoute('preSerialization', route.hooks, hookReq, reply, result);

      // Determine status code
      let statusCode = 200;
      let responseData = result;

      if (result && typeof result === 'object' && 'statusCode' in result) {
        statusCode = result.statusCode;
        // Remove statusCode from response data
        const { statusCode: _, ...rest } = result;
        responseData = rest;
      }

      // Validate response if schema exists
      if (route.schema?.response) {
        responseData = this.router.validateResponse(route.schema, statusCode, responseData);
      }

      // Serialize response — resolution order:
      //   1. Custom serializer compiler (setSerializerCompiler) if schema matches
      //   2. Pre-compiled QuikSerializer attached to the route
      //   3. Global reply serializer (setReplySerializer)
      //   4. Built-in JSON serializer
      const customSerializer = this._serializerCompiler && route.schema?.response?.[String(statusCode)]
        ? this._serializerCompiler(route.schema.response[String(statusCode)])
        : undefined;
      const routeSerializer = route.serializers?.[String(statusCode)];
      const responseBody = typeof responseData === 'string'
        ? responseData
        : customSerializer
          ? customSerializer(responseData)
          : routeSerializer
            ? routeSerializer(responseData)
            : this._replySerializer
              ? this._replySerializer(responseData, statusCode)
              : this.serializer.serialize(responseData);

      // Set status and Content-Type before onSend so hooks can inspect/override them
      reply.status(statusCode);
      if (!reply.hasHeader('Content-Type')) {
        reply.header('Content-Type', 'application/json');
      }

      // HOOK: onSend (before response sent - compression, final modifications)
      // Run BEFORE reply.send() so hooks can transform the serialized body.
      // If a hook returns a string it replaces the original body.
      const onSendResult = await this.hookManager.runWithRoute('onSend', route.hooks, hookReq, reply, responseBody);
      const finalBody = typeof onSendResult === 'string' ? onSendResult : responseBody;

      reply.send(finalBody);

      const response = reply.response;

      // Log successful request completion (guarded — same flag as above)
      if (shouldLog) {
        log.info({
          statusCode: response.status,
          duration: Date.now() - startTime
        }, 'Request completed');
      }

      // HOOK: onResponse (after response sent - logging, metrics)
      // Note: This runs after we return the response, so it doesn't block
      setImmediate(async () => {
        try {
          await this.hookManager.runWithRoute('onResponse', route.hooks, hookReq, reply);
        } catch (error) {
          console.error('Error in onResponse hook:', error);
        }
      });

      // Strip body for HEAD requests — preserve all headers including Content-Length/Content-Type
      if (req.method === 'HEAD') {
        const headersObj: Record<string, string> = {};
        response.headers.forEach((v, k) => { headersObj[k] = v; });
        return new Response(null, { status: response.status, headers: headersObj });
      }

      return response;
    } catch (error) {
      // Log error
      log.error({ err: error }, 'Request failed');

      // HOOK: onError (on any error during lifecycle)
      await this.hookManager.runOnError(hookReq, reply, error as Error);

      if (reply.sent) {
        return reply.response;
      }

      // Handle schema validation errors
      if (error instanceof SchemaValidationError) {
        return new Response(JSON.stringify(error.toJSON()), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return this.errorHandling.handleError(error as Error, req);
    }
  }

  // ─── Zero-Promise fast path ─────────────────────────────────────────────────

  /**
   * Serialize a handler result on the fast path — no hooks, no schema validation.
   * Returns a Response directly (zero async, no extra allocations).
   */
  private _serializeFastResult(
    result: any,
    reply: Reply,
    route: MatchResult,
    req: Request
  ): Response {
    // Handler called reply.send() / reply.redirect() / reply.sse() directly
    if (reply.sent) return reply.response;

    // Handler returned a raw Response
    if (result instanceof Response) return result;

    const statusCode = reply.statusCode;

    // Use pre-compiled QuikSerializer when available, else fall back to JSON.stringify
    const routeSerializer = route.serializers?.[String(statusCode)];
    const body = typeof result === 'string'
      ? result
      : routeSerializer
        ? routeSerializer(result)
        : JSON.stringify(result);

    // Collect any headers the handler set on reply
    const headers: Record<string, string> = {};
    const ct = reply.getHeader('content-type') ?? reply.getHeader('Content-Type');
    if (ct) {
      headers['content-type'] = ct;
    } else if (result !== null && result !== undefined) {
      headers['content-type'] = 'application/json';
    }

    // Strip body for HEAD requests, preserve headers
    if (req.method === 'HEAD') {
      return new Response(null, { status: statusCode, headers });
    }

    return new Response(body, { status: statusCode, headers });
  }

  /**
   * Fast path: GET/HEAD requests with no global hooks and no route-level hooks/schema.
   * Returns Response directly for sync handlers (zero Promises).
   * Returns a single .then() chain for async handlers (one Promise).
   */
  private _handleRequestFast(req: Request): Response | Promise<Response> {
    const pathname = extractPathname(req.url);
    const route = this.router.find(req.method, pathname, req);

    if (!route) {
      return this.errorHandling.handleNotFound(req);
    }

    // Route has hooks or schema — delegate to the full pipeline
    if (routeHasAnyHooks(route.hooks) || route.schema) {
      return this._handleRequestFull(req);
    }

    const query = parseQueryString(extractSearch(req.url));
    const requestId = req.headers.get('x-request-id') ?? generateRequestId();

    const ogRequest = new OgelfyRequest(req, {
      params: route.params,
      query,
      body: null,
      cookies: {},
      ip: getIP(req),
      hostname: getHostname(req),
      protocol: getProtocol(req),
      log: this.logger,
      requestId,
      pathname,
    } as RouteContext & { pathname: string });
    ogRequest.server = this;
    ogRequest.routePath = typeof route.pattern === 'string' ? route.pattern : pathname;
    ogRequest.routeSchema = route.schema;

    const reply = new Reply();
    reply.callNotFound = () => this.errorHandling.handleNotFound(req);
    reply.setStartTime(Date.now());

    try {
      const handlerResult = route.handler(ogRequest, reply);

      if (handlerResult instanceof Promise) {
        // Async handler — single .then() chain, one Promise total
        return handlerResult.then(
          (result) => this._serializeFastResult(result, reply, route, req),
          (err) => this.errorHandling.handleError(err as Error, req)
        );
      }

      // Sync handler — pure synchronous Response, zero Promises allocated
      return this._serializeFastResult(handlerResult, reply, route, req);
    } catch (err) {
      return this.errorHandling.handleError(err as Error, req);
    }
  }

  /**
   * Dispatcher: routes to the zero-Promise fast path or the full async pipeline.
   *
   * Fast path conditions (all must be true):
   *   - GET or HEAD (no body parsing required)
   *   - No global hooks registered on this instance
   *   - No request or reply decorators registered
   *
   * Route-level hook/schema checks happen inside _handleRequestFast() once the
   * route is matched, so they don't add cost for the truly fast routes.
   */
  private _handleRequest(req: Request): Response | Promise<Response> {
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      !this.hookManager.hasAnyHooks() &&
      !this.decoratorManager.hasAnyRequestDecorators() &&
      !this.decoratorManager.hasAnyReplyDecorators()
    ) {
      return this._handleRequestFast(req);
    }
    return this._handleRequestFull(req);
  }

  /**
   * Build the WebSocket handler object passed to Bun.serve().
   * Returns undefined when no WebSocket routes are registered.
   */
  private _buildWsHandler(): any {
    if (this._wsRoutes.size === 0) return undefined;
    const routes = this._wsRoutes;
    return {
      open(ws: ServerWebSocket<{ path: string }>) {
        const handler = routes.get(ws.data?.path);
        handler?.open?.(ws as any);
      },
      message(ws: ServerWebSocket<{ path: string }>, message: string | Buffer) {
        const handler = routes.get(ws.data?.path);
        handler?.message?.(ws as any, message);
      },
      close(ws: ServerWebSocket<{ path: string }>, code: number, reason: string) {
        const handler = routes.get(ws.data?.path);
        handler?.close?.(ws as any, code, reason);
      },
      drain(ws: ServerWebSocket<{ path: string }>) {
        const handler = routes.get(ws.data?.path);
        handler?.drain?.(ws as any);
      },
    };
  }

  async listen(options: { port: number; hostname?: string }): Promise<BunServer> {
    const self = this;
    this.server = Bun.serve({
      port: options.port,
      hostname: options.hostname || 'localhost',
      fetch: async (req: Request, server: BunServer) => {
        // WebSocket upgrade check — only run when WS routes are registered
        if (self._wsRoutes.size > 0 && req.headers.get('upgrade') === 'websocket') {
          const rawUrl = req.url;
          const pathname = extractPathname(rawUrl);
          if (self._wsRoutes.has(pathname)) {
            const upgraded = (server as any).upgrade(req, { data: { path: pathname } });
            if (upgraded) return undefined as any;
          }
        }
        return self._handleRequest(req);
      },
      websocket: self._buildWsHandler(),
    });

    return this.server;
  }

  async close() {
    await this.hookManager.runOnClose();
    this.server?.stop();
  }

  /**
   * Get hook manager (for debugging)
   */
  getHookManager(): HookManager {
    return this.hookManager;
  }

  /**
   * Get decorator manager (for debugging)
   */
  getDecoratorManager(): DecoratorManager {
    return this.decoratorManager;
  }

  /**
   * Get plugin registry (for debugging)
   */
  getPluginRegistry(): PluginRegistry {
    return this.pluginRegistry;
  }
}

// Export logger
export { createLogger, type LoggerOptions } from './logger';

// Export request wrapper
export { OgelfyRequest } from './request';

// Export all new plugin architecture components
export { HookManager, type HookName, type HookHandler, type HookRequest } from './hooks';
export { Reply, type CookieOptions } from './hooks';
// HookReply alias kept for backwards compatibility
export { Reply as HookReply } from './hooks';
export { DecoratorManager } from './decorators';
export { PluginRegistry, fp, getPluginMetadata, type PluginMetadata } from './plugin-registry';

// Export schema compiler
export {
  SchemaCompiler,
  ValidationError as SchemaValidationError,
  schemaCompiler,
  type ValidatorCompiler,
  type SchemaErrorFormatter
} from './schema-compiler';

// Export error handling utilities
export {
  HttpError,
  ValidationError,
  httpErrors,
  type ErrorHandler,
  type NotFoundHandler,
  createErrorResponse,
  assert,
  errorBoundary
} from './error-handler';

// Export testing utilities
export {
  Testing,
  type InjectOptions,
  type InjectResponse,
  testHelpers
} from './testing';

// Export content parsing
export {
  ContentTypeParser,
  contentParser,
  type ContentParser,
  type ParsedMultipart
} from './content-parser';

// Export serialization
export {
  Serializer,
  serializer,
  createRouteSchema,
  Schemas,
  type SerializerSchema,
  type RouteSchema as SerializerRouteSchema
} from './serializer';

// Export existing modules
export { Router } from './router';
export type {
  RouteHandler,
  OgelfyOptions,
  OgelfyPlugin,
  RouteContext,
  RouteSchema,
  RouteOptions,
  RouteConstraints,
  RouteChain,
  RouteDefinition,
  PluginOptions
} from './types';
export { validate } from './validation';

// AI-native primitives
export * from './ai/index';

// Built-in plugins
export { corsPlugin, type CorsOptions } from './cors';
export { compressPlugin, type CompressOptions } from './compress';
