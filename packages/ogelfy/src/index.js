import { Router } from './router';
import { ErrorHandling, httpErrors } from './error-handler';
import { Testing } from './testing';
import { ContentTypeParser } from './content-parser';
import { Serializer } from './serializer';
import { SchemaCompiler, ValidationError as SchemaValidationError } from './schema-compiler';
import { HookManager, Reply } from './hooks';
import { DecoratorManager } from './decorators';
import { PluginRegistry, getPluginMetadata } from './plugin-registry';
import { createLogger, createRequestLogger } from './logger';
function parseCookies(req) {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader)
        return {};
    const cookies = {};
    for (const cookie of cookieHeader.split(';')) {
        const [name, ...rest] = cookie.trim().split('=');
        if (name && rest.length > 0) {
            cookies[name] = decodeURIComponent(rest.join('='));
        }
    }
    return cookies;
}
function getIP(req) {
    return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
}
function getHostname(req) {
    return req.headers.get('host')?.split(':')[0] || 'localhost';
}
function getProtocol(req) {
    return req.headers.get('x-forwarded-proto') || 'http';
}
export class Ogelfy {
    router;
    plugins = [];
    server;
    errorHandling;
    testing;
    contentParser;
    serializer;
    schemaCompiler;
    logger;
    // New plugin architecture components
    hookManager;
    decoratorManager;
    pluginRegistry;
    parent; // For plugin context isolation
    requestTimeout;
    /**
     * HTTP error factory methods
     */
    httpErrors = httpErrors;
    constructor(options, parent) {
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
        }
        else {
            // Root context - create new managers
            this.hookManager = new HookManager();
            this.decoratorManager = new DecoratorManager();
            this.pluginRegistry = new PluginRegistry();
        }
        // Testing needs access to error handling and logger
        this.testing = new Testing(this.router, this.errorHandling, this.logger);
    }
    /**
     * Add a lifecycle hook
     */
    addHook(name, handler) {
        this.hookManager.add(name, handler);
        return this;
    }
    /**
     * Decorate the server instance with custom properties/methods
     */
    decorate(name, value) {
        this.decoratorManager.decorateServer(this, name, value);
        return this;
    }
    /**
     * Decorate request objects
     */
    decorateRequest(name, value) {
        this.decoratorManager.decorateRequest(name, value);
        return this;
    }
    /**
     * Decorate reply objects
     */
    decorateReply(name, value) {
        this.decoratorManager.decorateReply(name, value);
        return this;
    }
    /**
     * Check if a decorator exists
     */
    hasDecorator(name) {
        return this.decoratorManager.hasServerDecorator(name);
    }
    /**
     * Check if a request decorator exists
     */
    hasRequestDecorator(name) {
        return this.decoratorManager.hasRequestDecorator(name);
    }
    /**
     * Check if a reply decorator exists
     */
    hasReplyDecorator(name) {
        return this.decoratorManager.hasReplyDecorator(name);
    }
    /**
     * Add a custom content-type parser
     */
    addContentTypeParser(contentType, parser) {
        this.contentParser.add(contentType, parser);
    }
    /**
     * Remove a content-type parser
     */
    removeContentTypeParser(contentType) {
        return this.contentParser.remove(contentType);
    }
    /**
     * Register a route with optional options (supports schemas, constraints, hooks)
     */
    addRoute(method, path, handlerOrOptions, maybeHandler) {
        let handler;
        let options;
        if (typeof handlerOrOptions === 'function') {
            handler = handlerOrOptions;
            options = undefined;
        }
        else {
            if (!maybeHandler) {
                throw new Error('Handler is required when options are provided');
            }
            options = handlerOrOptions;
            handler = maybeHandler;
        }
        this.router.add(method, path, handler, options);
    }
    get(path, handlerOrOptions, maybeHandler) {
        this.addRoute('GET', path, handlerOrOptions, maybeHandler);
    }
    post(path, handlerOrOptions, maybeHandler) {
        this.addRoute('POST', path, handlerOrOptions, maybeHandler);
    }
    put(path, handlerOrOptions, maybeHandler) {
        this.addRoute('PUT', path, handlerOrOptions, maybeHandler);
    }
    delete(path, handlerOrOptions, maybeHandler) {
        this.addRoute('DELETE', path, handlerOrOptions, maybeHandler);
    }
    patch(path, handlerOrOptions, maybeHandler) {
        this.addRoute('PATCH', path, handlerOrOptions, maybeHandler);
    }
    options(path, handlerOrOptions, maybeHandler) {
        this.addRoute('OPTIONS', path, handlerOrOptions, maybeHandler);
    }
    head(path, handlerOrOptions, maybeHandler) {
        this.addRoute('HEAD', path, handlerOrOptions, maybeHandler);
    }
    all(path, handlerOrOptions, maybeHandler) {
        this.addRoute('ALL', path, handlerOrOptions, maybeHandler);
    }
    /**
     * Route chaining API
     */
    route(path) {
        const self = this;
        return {
            get(handler) {
                self.get(path, handler);
                return this;
            },
            post(handler) {
                self.post(path, handler);
                return this;
            },
            put(handler) {
                self.put(path, handler);
                return this;
            },
            delete(handler) {
                self.delete(path, handler);
                return this;
            },
            patch(handler) {
                self.patch(path, handler);
                return this;
            },
            options(handler) {
                self.options(path, handler);
                return this;
            },
            head(handler) {
                self.head(path, handler);
                return this;
            },
            all(handler) {
                self.all(path, handler);
                return this;
            },
        };
    }
    /**
     * Register a plugin with advanced encapsulation and lifecycle management
     */
    async register(plugin, options) {
        // Extract metadata from plugin (if wrapped with fp())
        const metadata = getPluginMetadata(plugin);
        // Check if plugin should skip encapsulation
        const shouldEncapsulate = metadata?.encapsulate !== false;
        if (shouldEncapsulate) {
            // Create isolated context (child Ogelfy instance)
            const childInstance = new Ogelfy({}, this);
            // Register in plugin registry with metadata
            await this.pluginRegistry.register(async (opts) => {
                await plugin(childInstance, opts);
            }, options, metadata);
        }
        else {
            // No encapsulation - plugin modifies parent directly
            await this.pluginRegistry.register(async (opts) => {
                await plugin(this, opts);
            }, options, metadata);
        }
        this.plugins.push(plugin);
    }
    /**
     * Check if a plugin is loaded
     */
    hasPlugin(name) {
        return this.pluginRegistry.hasPlugin(name);
    }
    /**
     * Add a shared JSON schema
     */
    addSchema(id, schema) {
        this.schemaCompiler.addSchema(id, schema);
    }
    /**
     * Get the schema compiler instance
     */
    getSchemaCompiler() {
        return this.schemaCompiler;
    }
    /**
     * Set custom error handler
     */
    setErrorHandler(handler) {
        this.errorHandling.setErrorHandler(handler);
    }
    /**
     * Set custom 404 handler
     */
    setNotFoundHandler(handler) {
        this.errorHandling.setNotFoundHandler(handler);
    }
    /**
     * Inject request for testing (no HTTP server needed)
     */
    async inject(options) {
        return this.testing.inject(options);
    }
    /**
     * Handle request with full lifecycle hooks
     */
    async handleRequest(req) {
        const url = new URL(req.url);
        const startTime = Date.now();
        // Create request logger
        const log = createRequestLogger(this.logger, req);
        log.info('Incoming request');
        // Create hook request with metadata
        const hookReq = req;
        hookReq.id = crypto.randomUUID();
        hookReq.startTime = startTime;
        // Create reply object
        const reply = new Reply();
        // Apply decorators
        this.decoratorManager.applyRequestDecorators(hookReq);
        this.decoratorManager.applyReplyDecorators(reply);
        try {
            // HOOK: onRequest (earliest interception)
            await this.hookManager.run('onRequest', hookReq, reply);
            if (reply.sent)
                return reply.response;
            // Find route
            const route = this.router.find(req.method, url.pathname, req);
            if (!route) {
                return this.errorHandling.handleNotFound(req);
            }
            // HOOK: preParsing (before body parse)
            await this.hookManager.runWithRoute('preParsing', route.hooks, hookReq, reply);
            if (reply.sent)
                return reply.response;
            // Parse query parameters
            const query = {};
            url.searchParams.forEach((value, key) => {
                query[key] = value;
            });
            // Parse request body for non-GET/HEAD requests
            let body = null;
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                try {
                    body = await this.contentParser.parse(req);
                }
                catch (error) {
                    return new Response(JSON.stringify({
                        error: 'Bad Request',
                        message: error instanceof Error ? error.message : String(error)
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
            // Create route context
            const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
            const context = {
                params: route.params,
                query,
                body,
                cookies: parseCookies(req),
                ip: getIP(req),
                hostname: getHostname(req),
                protocol: getProtocol(req),
                log,
                requestId
            };
            hookReq.context = context;
            // HOOK: preValidation (before schema validation)
            await this.hookManager.runWithRoute('preValidation', route.hooks, hookReq, reply);
            if (reply.sent)
                return reply.response;
            // Validate request if schema exists
            if (route.schema) {
                await this.router.validateRequest(req, route.schema, context);
            }
            // HOOK: preHandler (after validation, before handler - auth, permissions)
            await this.hookManager.runWithRoute('preHandler', route.hooks, hookReq, reply);
            if (reply.sent)
                return reply.response;
            // Execute handler with context
            let result = await route.handler(req, context);
            // If handler returns Response, use it directly
            if (result instanceof Response) {
                return result;
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
            // Serialize response
            const responseBody = typeof responseData === 'string'
                ? responseData
                : this.serializer.serialize(responseData);
            // Set response in reply
            reply.status(statusCode);
            if (!reply.hasHeader('Content-Type')) {
                reply.header('Content-Type', 'application/json');
            }
            reply.send(responseBody);
            // HOOK: onSend (before response sent - compression, final modifications)
            await this.hookManager.runWithRoute('onSend', route.hooks, hookReq, reply);
            const response = reply.response;
            // Log successful request completion
            log.info({
                statusCode: response.status,
                duration: Date.now() - startTime
            }, 'Request completed');
            // HOOK: onResponse (after response sent - logging, metrics)
            // Note: This runs after we return the response, so it doesn't block
            setImmediate(async () => {
                try {
                    await this.hookManager.runWithRoute('onResponse', route.hooks, hookReq, reply);
                }
                catch (error) {
                    console.error('Error in onResponse hook:', error);
                }
            });
            return response;
        }
        catch (error) {
            // Log error
            log.error({ err: error }, 'Request failed');
            // HOOK: onError (on any error during lifecycle)
            await this.hookManager.runOnError(hookReq, reply, error);
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
            return this.errorHandling.handleError(error, req);
        }
    }
    async listen(options) {
        this.server = Bun.serve({
            port: options.port,
            hostname: options.hostname || 'localhost',
            fetch: (req) => this.handleRequest(req),
        });
        return this.server;
    }
    async close() {
        this.server?.stop();
    }
    /**
     * Get hook manager (for debugging)
     */
    getHookManager() {
        return this.hookManager;
    }
    /**
     * Get decorator manager (for debugging)
     */
    getDecoratorManager() {
        return this.decoratorManager;
    }
    /**
     * Get plugin registry (for debugging)
     */
    getPluginRegistry() {
        return this.pluginRegistry;
    }
}
// Export logger
export { createLogger } from './logger';
// Export all new plugin architecture components
export { HookManager } from './hooks';
export { Reply as HookReply } from './hooks';
export { Reply } from './reply';
export { DecoratorManager } from './decorators';
export { PluginRegistry, fp, getPluginMetadata } from './plugin-registry';
// Export schema compiler
export { SchemaCompiler, ValidationError as SchemaValidationError, schemaCompiler } from './schema-compiler';
// Export error handling utilities
export { HttpError, ValidationError, httpErrors, createErrorResponse, assert, errorBoundary } from './error-handler';
// Export testing utilities
export { Testing, testHelpers } from './testing';
// Export content parsing
export { ContentTypeParser, contentParser } from './content-parser';
// Export serialization
export { Serializer, serializer, createRouteSchema, Schemas } from './serializer';
// Export existing modules
export { Router } from './router';
export { validate } from './validation';
//# sourceMappingURL=index.js.map