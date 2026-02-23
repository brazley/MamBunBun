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
/**
 * Hook names representing different stages in request lifecycle
 */
export type HookName = 'onRequest' | 'preParsing' | 'preValidation' | 'preHandler' | 'preSerialization' | 'onSend' | 'onResponse' | 'onError' | 'onTimeout';
/**
 * Extended request with hook-related metadata
 */
export interface HookRequest extends Request {
    id?: string;
    startTime?: number;
    context?: RouteContext;
    [key: string]: any;
}
/**
 * Reply object for building HTTP responses
 */
export declare class Reply {
    private _statusCode;
    private _headers;
    private _body;
    private _sent;
    private _response?;
    [key: string]: any;
    get statusCode(): number;
    get sent(): boolean;
    get response(): Response;
    /**
     * Set response status code
     */
    status(code: number): this;
    /**
     * Set response header
     */
    header(name: string, value: string): this;
    /**
     * Set multiple headers at once
     */
    headers(headers: Record<string, string>): this;
    /**
     * Send response
     */
    send(payload: any): this;
    /**
     * Convenience method - set status and send in one call
     */
    code(statusCode: number): this;
    /**
     * Get header value
     */
    getHeader(name: string): string | undefined;
    /**
     * Remove header
     */
    removeHeader(name: string): this;
    /**
     * Check if header exists
     */
    hasHeader(name: string): boolean;
    /**
     * Set raw Response object (for advanced usage)
     */
    setResponse(response: Response): void;
}
/**
 * Hook handler function signature
 */
export type HookHandler = (req: HookRequest, reply: Reply, payload?: any, error?: Error) => Promise<void | any> | void | any;
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
export declare class HookManager {
    private hooks;
    constructor();
    /**
     * Add a hook handler for a specific lifecycle event
     */
    add(name: HookName, handler: HookHandler): void;
    /**
     * Execute all hooks for a specific lifecycle event
     * Returns transformed payload if hook returns a value
     */
    run(name: HookName, req: HookRequest, reply: Reply, payload?: any, error?: Error): Promise<any>;
    /**
     * Execute route-level hooks followed by global hooks
     * Route hooks execute BEFORE global hooks for the same phase
     */
    runWithRoute(name: HookName, routeHooks: RouteHooks | undefined, req: HookRequest, reply: Reply, payload?: any, error?: Error): Promise<any>;
    /**
     * Check if any hooks are registered for a lifecycle event
     */
    has(name: HookName): boolean;
    /**
     * Get all hooks for a lifecycle event
     */
    get(name: HookName): HookHandler[];
    /**
     * Clear all hooks for a lifecycle event
     */
    clear(name?: HookName): void;
    /**
     * Get count of hooks for a lifecycle event
     */
    count(name: HookName): number;
    /**
     * Clone hook manager (for plugin context isolation)
     * Creates a new manager with copies of all hook arrays
     */
    clone(): HookManager;
    /**
     * Merge hooks from parent manager (for plugin inheritance)
     * Adds parent hooks before child hooks in execution order
     */
    inherit(parent: HookManager): void;
    /**
     * Execute onError hook with proper error handling
     * If onError hooks throw, catch and log but don't propagate
     */
    runOnError(req: HookRequest, reply: Reply, error: Error): Promise<void>;
    /**
     * Execute onTimeout hook when request exceeds time limit
     */
    runOnTimeout(req: HookRequest, reply: Reply): Promise<void>;
    /**
     * Get all registered hook names with their counts
     */
    stats(): Record<HookName, number>;
}
/**
 * Create a new hook manager instance
 */
export declare function createHookManager(): HookManager;
/**
 * Helper to create timeout wrapper for request handling
 */
export declare function createTimeoutHandler(timeoutMs: number, onTimeout: (req: HookRequest, reply: Reply) => Promise<void>): (req: HookRequest, reply: Reply, handler: () => Promise<void>) => Promise<void>;
//# sourceMappingURL=hooks.d.ts.map