import type { Server } from 'bun';
import type { RouteHandler, OgelfyOptions, OgelfyPlugin, RouteOptions, RouteChain } from './types';
import { HttpError, ValidationError, type ErrorHandler, type NotFoundHandler } from './error-handler';
import { SchemaCompiler } from './schema-compiler';
import { HookManager, type HookName, type HookHandler } from './hooks';
import { DecoratorManager } from './decorators';
import { PluginRegistry } from './plugin-registry';
export declare class Ogelfy {
    private router;
    private plugins;
    private server?;
    private errorHandling;
    private testing;
    private contentParser;
    private serializer;
    private schemaCompiler;
    private logger;
    private hookManager;
    private decoratorManager;
    private pluginRegistry;
    private parent?;
    private requestTimeout?;
    /**
     * HTTP error factory methods
     */
    httpErrors: {
        badRequest: (message?: string, details?: any) => HttpError;
        unauthorized: (message?: string, details?: any) => HttpError;
        forbidden: (message?: string, details?: any) => HttpError;
        notFound: (message?: string, details?: any) => HttpError;
        conflict: (message?: string, details?: any) => HttpError;
        unprocessableEntity: (message?: string, details?: any) => HttpError;
        tooManyRequests: (message?: string, details?: any) => HttpError;
        internalServerError: (message?: string, details?: any) => HttpError;
        notImplemented: (message?: string, details?: any) => HttpError;
        serviceUnavailable: (message?: string, details?: any) => HttpError;
        validation: (zodError: import("zod").ZodError) => ValidationError;
    };
    constructor(options?: OgelfyOptions, parent?: Ogelfy);
    /**
     * Add a lifecycle hook
     */
    addHook(name: HookName, handler: HookHandler): this;
    /**
     * Decorate the server instance with custom properties/methods
     */
    decorate<T = any>(name: string, value: T | (() => T)): this;
    /**
     * Decorate request objects
     */
    decorateRequest<T = any>(name: string, value: T | (() => T)): this;
    /**
     * Decorate reply objects
     */
    decorateReply<T = any>(name: string, value: T | (() => T)): this;
    /**
     * Check if a decorator exists
     */
    hasDecorator(name: string): boolean;
    /**
     * Check if a request decorator exists
     */
    hasRequestDecorator(name: string): boolean;
    /**
     * Check if a reply decorator exists
     */
    hasReplyDecorator(name: string): boolean;
    /**
     * Add a custom content-type parser
     */
    addContentTypeParser(contentType: string, parser: (req: Request) => Promise<any>): void;
    /**
     * Remove a content-type parser
     */
    removeContentTypeParser(contentType: string): boolean;
    /**
     * Register a route with optional options (supports schemas, constraints, hooks)
     */
    private addRoute;
    get(path: string | RegExp, handler: RouteHandler): void;
    get(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    post(path: string | RegExp, handler: RouteHandler): void;
    post(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    put(path: string | RegExp, handler: RouteHandler): void;
    put(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    delete(path: string | RegExp, handler: RouteHandler): void;
    delete(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    patch(path: string | RegExp, handler: RouteHandler): void;
    patch(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    options(path: string | RegExp, handler: RouteHandler): void;
    options(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    head(path: string | RegExp, handler: RouteHandler): void;
    head(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    /**
     * ALL methods route
     */
    all(path: string | RegExp, handler: RouteHandler): void;
    all(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
    /**
     * Route chaining API
     */
    route(path: string): RouteChain;
    /**
     * Register a plugin with advanced encapsulation and lifecycle management
     */
    register(plugin: OgelfyPlugin, options?: any): Promise<void>;
    /**
     * Check if a plugin is loaded
     */
    hasPlugin(name: string): boolean;
    /**
     * Add a shared JSON schema
     */
    addSchema(id: string, schema: any): void;
    /**
     * Get the schema compiler instance
     */
    getSchemaCompiler(): SchemaCompiler;
    /**
     * Set custom error handler
     */
    setErrorHandler(handler: ErrorHandler): void;
    /**
     * Set custom 404 handler
     */
    setNotFoundHandler(handler: NotFoundHandler): void;
    /**
     * Inject request for testing (no HTTP server needed)
     */
    inject(options: any): Promise<import("./testing").InjectResponse>;
    /**
     * Handle request with full lifecycle hooks
     */
    private handleRequest;
    listen(options: {
        port: number;
        hostname?: string;
    }): Promise<Server>;
    close(): Promise<void>;
    /**
     * Get hook manager (for debugging)
     */
    getHookManager(): HookManager;
    /**
     * Get decorator manager (for debugging)
     */
    getDecoratorManager(): DecoratorManager;
    /**
     * Get plugin registry (for debugging)
     */
    getPluginRegistry(): PluginRegistry;
}
export { createLogger, type LoggerOptions } from './logger';
export { HookManager, type HookName, type HookHandler, type HookRequest } from './hooks';
export { Reply as HookReply } from './hooks';
export { Reply, type CookieOptions } from './reply';
export { DecoratorManager } from './decorators';
export { PluginRegistry, fp, getPluginMetadata, type PluginMetadata } from './plugin-registry';
export { SchemaCompiler, ValidationError as SchemaValidationError, schemaCompiler } from './schema-compiler';
export { HttpError, ValidationError, httpErrors, type ErrorHandler, type NotFoundHandler, createErrorResponse, assert, errorBoundary } from './error-handler';
export { Testing, type InjectOptions, type InjectResponse, testHelpers } from './testing';
export { ContentTypeParser, contentParser, type ContentParser, type ParsedMultipart } from './content-parser';
export { Serializer, serializer, createRouteSchema, Schemas, type SerializerSchema, type RouteSchema as SerializerRouteSchema } from './serializer';
export { Router } from './router';
export type { RouteHandler, OgelfyOptions, OgelfyPlugin, RouteContext, RouteSchema, RouteOptions, RouteConstraints, RouteChain, PluginOptions } from './types';
export { validate } from './validation';
//# sourceMappingURL=index.d.ts.map