import type { RouteHandler, RouteConstraints, RouteSchema, RouteContext } from './types';
import type { RouteHooks } from './hooks';
import { SchemaCompiler } from './schema-compiler';
interface Route {
    method: string;
    pattern: string | RegExp;
    handler: RouteHandler;
    params?: string[];
    constraints?: RouteConstraints;
    schema?: RouteSchema;
    hooks?: RouteHooks;
    isWildcard?: boolean;
    isRegex?: boolean;
}
interface MatchResult {
    handler: RouteHandler;
    params: Record<string, string>;
    schema?: RouteSchema;
    hooks?: RouteHooks;
}
export declare class Router {
    private routes;
    private schemaCompiler;
    constructor(schemaCompiler: SchemaCompiler);
    /**
     * Add a route with optional constraints, schema, and hooks
     */
    add(method: string, pattern: string | RegExp, handler: RouteHandler, options?: {
        constraints?: RouteConstraints;
        schema?: RouteSchema;
        hooks?: RouteHooks;
    }): void;
    /**
     * Find a matching route and return handler with params
     */
    find(method: string, path: string, req?: Request): MatchResult | null;
    /**
     * Extract parameter names from a path pattern
     */
    private extractParams;
    /**
     * Match a path pattern against a request path
     */
    private matchPath;
    /**
     * Match a wildcard pattern against a request path
     */
    private matchWildcard;
    /**
     * Match a regex pattern against a request path
     */
    private matchRegex;
    /**
     * Check if request matches route constraints
     */
    private matchConstraints;
    /**
     * Validate request against route schema
     */
    validateRequest(req: Request, schema: RouteSchema, context: RouteContext): Promise<void>;
    /**
     * Validate response against schema
     */
    validateResponse(schema: RouteSchema, statusCode: number, data: any): any;
    /**
     * Get all registered routes (for debugging)
     */
    getRoutes(): Route[];
    /**
     * Clear all routes
     */
    clear(): void;
}
export {};
//# sourceMappingURL=router.d.ts.map