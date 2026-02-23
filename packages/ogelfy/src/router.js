import { ValidationError } from './schema-compiler';
export class Router {
    routes = [];
    schemaCompiler;
    constructor(schemaCompiler) {
        this.schemaCompiler = schemaCompiler;
    }
    /**
     * Add a route with optional constraints, schema, and hooks
     */
    add(method, pattern, handler, options) {
        if (pattern instanceof RegExp) {
            this.routes.push({
                method,
                pattern,
                handler,
                constraints: options?.constraints,
                schema: options?.schema,
                hooks: options?.hooks,
                isRegex: true,
            });
        }
        else {
            const isWildcard = pattern.includes('*');
            const params = isWildcard ? [] : this.extractParams(pattern);
            this.routes.push({
                method,
                pattern,
                handler,
                params,
                constraints: options?.constraints,
                schema: options?.schema,
                hooks: options?.hooks,
                isWildcard,
                isRegex: false,
            });
        }
        // Sort routes: exact matches first, then params, then wildcards, then regex
        this.routes.sort((a, b) => {
            if (a.isRegex && !b.isRegex)
                return 1;
            if (!a.isRegex && b.isRegex)
                return -1;
            if (a.isWildcard && !b.isWildcard)
                return 1;
            if (!a.isWildcard && b.isWildcard)
                return -1;
            if (a.params && !b.params)
                return 1;
            if (!a.params && b.params)
                return -1;
            return 0;
        });
    }
    /**
     * Find a matching route and return handler with params
     */
    find(method, path, req) {
        for (const route of this.routes) {
            // Method check
            if (route.method !== method && route.method !== 'ALL')
                continue;
            // Constraint checks
            if (route.constraints && req) {
                if (!this.matchConstraints(route.constraints, req)) {
                    continue;
                }
            }
            // Pattern matching
            let params = null;
            if (route.isRegex && route.pattern instanceof RegExp) {
                params = this.matchRegex(route.pattern, path);
            }
            else if (route.isWildcard && typeof route.pattern === 'string') {
                params = this.matchWildcard(route.pattern, path);
            }
            else if (typeof route.pattern === 'string') {
                params = this.matchPath(route.pattern, path);
            }
            if (params !== null) {
                return {
                    handler: route.handler,
                    params,
                    schema: route.schema,
                    hooks: route.hooks,
                };
            }
        }
        return null;
    }
    /**
     * Extract parameter names from a path pattern
     */
    extractParams(path) {
        const params = [];
        const segments = path.split('/');
        for (const segment of segments) {
            if (segment.startsWith(':')) {
                params.push(segment.slice(1));
            }
        }
        return params;
    }
    /**
     * Match a path pattern against a request path
     */
    matchPath(routePath, requestPath) {
        const routeSegments = routePath.split('/');
        const requestSegments = requestPath.split('/');
        if (routeSegments.length !== requestSegments.length) {
            return null;
        }
        const params = {};
        for (let i = 0; i < routeSegments.length; i++) {
            const routeSegment = routeSegments[i];
            const requestSegment = requestSegments[i];
            if (routeSegment.startsWith(':')) {
                params[routeSegment.slice(1)] = requestSegment;
            }
            else if (routeSegment !== requestSegment) {
                return null;
            }
        }
        return params;
    }
    /**
     * Match a wildcard pattern against a request path
     */
    matchWildcard(routePath, requestPath) {
        const routeSegments = routePath.split('/');
        const requestSegments = requestPath.split('/');
        const params = {};
        let routeIndex = 0;
        let requestIndex = 0;
        while (routeIndex < routeSegments.length && requestIndex < requestSegments.length) {
            const routeSegment = routeSegments[routeIndex];
            const requestSegment = requestSegments[requestIndex];
            if (routeSegment === '*') {
                // Check if this is the last segment in route
                if (routeIndex === routeSegments.length - 1) {
                    // Match remaining path
                    const remaining = requestSegments.slice(requestIndex).join('/');
                    params['*'] = remaining;
                    return params;
                }
                else {
                    // Match only this segment
                    params['*'] = requestSegment;
                    routeIndex++;
                    requestIndex++;
                }
            }
            else if (routeSegment.startsWith(':')) {
                // Named parameter
                params[routeSegment.slice(1)] = requestSegment;
                routeIndex++;
                requestIndex++;
            }
            else if (routeSegment === requestSegment) {
                // Exact match
                routeIndex++;
                requestIndex++;
            }
            else {
                // No match
                return null;
            }
        }
        // Check if we consumed all segments
        if (routeIndex === routeSegments.length && requestIndex === requestSegments.length) {
            return params;
        }
        return null;
    }
    /**
     * Match a regex pattern against a request path
     */
    matchRegex(pattern, path) {
        const match = path.match(pattern);
        if (!match) {
            return null;
        }
        const params = {};
        // Add numbered capture groups (skip index 0 which is full match)
        for (let i = 1; i < match.length; i++) {
            params[String(i - 1)] = match[i];
        }
        return params;
    }
    /**
     * Check if request matches route constraints
     */
    matchConstraints(constraints, req) {
        const url = new URL(req.url);
        // Host constraint
        if (constraints.host) {
            const hosts = Array.isArray(constraints.host) ? constraints.host : [constraints.host];
            if (!hosts.includes(url.hostname)) {
                return false;
            }
        }
        // Version constraint (check accept-version header)
        if (constraints.version) {
            const acceptVersion = req.headers.get('accept-version');
            if (acceptVersion !== constraints.version) {
                return false;
            }
        }
        // Custom constraint checks
        for (const [key, value] of Object.entries(constraints)) {
            if (key === 'host' || key === 'version')
                continue;
            const header = req.headers.get(key);
            if (header !== value) {
                return false;
            }
        }
        return true;
    }
    /**
     * Validate request against route schema
     */
    async validateRequest(req, schema, context) {
        // Validate params
        if (schema.params) {
            try {
                this.schemaCompiler.validate(schema.params, context.params);
            }
            catch (error) {
                if (error instanceof ValidationError) {
                    throw new ValidationError([
                        {
                            instancePath: '/params',
                            schemaPath: '#/params',
                            keyword: 'params',
                            params: {},
                            message: 'Parameter validation failed',
                        },
                        ...error.errors,
                    ]);
                }
                throw error;
            }
        }
        // Validate querystring
        if (schema.querystring) {
            try {
                this.schemaCompiler.validate(schema.querystring, context.query);
            }
            catch (error) {
                if (error instanceof ValidationError) {
                    throw new ValidationError([
                        {
                            instancePath: '/querystring',
                            schemaPath: '#/querystring',
                            keyword: 'querystring',
                            params: {},
                            message: 'Query string validation failed',
                        },
                        ...error.errors,
                    ]);
                }
                throw error;
            }
        }
        // Validate body
        if (schema.body && context.body !== undefined) {
            try {
                context.body = this.schemaCompiler.validate(schema.body, context.body);
            }
            catch (error) {
                if (error instanceof ValidationError) {
                    throw new ValidationError([
                        {
                            instancePath: '/body',
                            schemaPath: '#/body',
                            keyword: 'body',
                            params: {},
                            message: 'Request body validation failed',
                        },
                        ...error.errors,
                    ]);
                }
                throw error;
            }
        }
        // Validate headers
        if (schema.headers) {
            const headers = {};
            req.headers.forEach((value, key) => {
                headers[key.toLowerCase()] = value;
            });
            try {
                this.schemaCompiler.validate(schema.headers, headers);
            }
            catch (error) {
                if (error instanceof ValidationError) {
                    throw new ValidationError([
                        {
                            instancePath: '/headers',
                            schemaPath: '#/headers',
                            keyword: 'headers',
                            params: {},
                            message: 'Header validation failed',
                        },
                        ...error.errors,
                    ]);
                }
                throw error;
            }
        }
    }
    /**
     * Validate response against schema
     */
    validateResponse(schema, statusCode, data) {
        if (!schema.response) {
            return data;
        }
        const responseSchema = schema.response[String(statusCode)];
        if (!responseSchema) {
            return data;
        }
        try {
            return this.schemaCompiler.validate(responseSchema, data);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                throw new ValidationError([
                    {
                        instancePath: '/response',
                        schemaPath: '#/response',
                        keyword: 'response',
                        params: {},
                        message: `Response validation failed for status ${statusCode}`,
                    },
                    ...error.errors,
                ]);
            }
            throw error;
        }
    }
    /**
     * Get all registered routes (for debugging)
     */
    getRoutes() {
        return [...this.routes];
    }
    /**
     * Clear all routes
     */
    clear() {
        this.routes = [];
    }
}
//# sourceMappingURL=router.js.map