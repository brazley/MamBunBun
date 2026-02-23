/**
 * Testing utilities for Ogelfy - .inject() without HTTP
 *
 * Features:
 * - Request injection without starting server
 * - Response inspection (status, headers, body)
 * - Async support
 * - Type safety
 * - Query parameter support
 * - Custom headers
 */
import { createLogger, createRequestLogger } from './logger';
/**
 * Testing utilities for Ogelfy
 */
export class Testing {
    router;
    errorHandling;
    logger;
    constructor(router, errorHandling, logger) {
        this.router = router;
        this.errorHandling = errorHandling;
        this.logger = logger;
        // Create a default logger if none provided
        if (!this.logger) {
            this.logger = createLogger({ level: 'silent' }); // Silent for tests
        }
    }
    /**
     * Inject a request without starting HTTP server
     *
     * @example
     * const response = await app.inject({
     *   method: 'GET',
     *   url: '/user/123',
     *   headers: { 'Authorization': 'Bearer token' }
     * });
     *
     * expect(response.statusCode).toBe(200);
     * expect(response.json()).toEqual({ id: '123', name: 'John' });
     */
    async inject(options) {
        try {
            // Build URL with query params
            const baseUrl = options.url.startsWith('http')
                ? options.url
                : `http://localhost${options.url}`;
            const url = new URL(baseUrl);
            if (options.query) {
                for (const [key, value] of Object.entries(options.query)) {
                    url.searchParams.set(key, value);
                }
            }
            // Build headers
            const headers = new Headers(options.headers || {});
            // Auto-set Content-Type for JSON bodies
            if (options.body && !headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }
            // Build request body
            let body;
            if (options.body) {
                if (typeof options.body === 'string') {
                    body = options.body;
                }
                else {
                    body = JSON.stringify(options.body);
                }
            }
            // Create Request object
            const req = new Request(url.toString(), {
                method: options.method.toUpperCase(),
                headers: headers,
                body: body
            });
            // Find matching route
            const route = this.router.find(options.method.toUpperCase(), url.pathname, req);
            if (!route) {
                // Use error handling if available
                if (this.errorHandling) {
                    const response = await this.errorHandling.handleNotFound(req);
                    const responseBody = await response.text();
                    const responseHeaders = {};
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                    return {
                        statusCode: response.status,
                        headers: responseHeaders,
                        body: responseBody,
                        payload: responseBody,
                        json: () => JSON.parse(responseBody)
                    };
                }
                return this.createResponse(404, {
                    error: 'Not Found',
                    code: 'NOT_FOUND',
                    statusCode: 404,
                    path: url.pathname
                });
            }
            // Parse query parameters
            const query = {};
            url.searchParams.forEach((value, key) => {
                query[key] = value;
            });
            // Parse request body (JSON if applicable)
            let parsedBody = null;
            if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
                parsedBody = options.body;
            }
            // Create request logger
            const requestId = options.headers?.['x-request-id'] || crypto.randomUUID();
            const log = createRequestLogger(this.logger, req);
            // Parse cookies
            function parseCookies(req) {
                const cookieHeader = req.headers.get('cookie');
                if (!cookieHeader)
                    return {};
                return Object.fromEntries(cookieHeader.split(';').map((cookie) => {
                    const [key, ...values] = cookie.trim().split('=');
                    return [key, values.join('=')];
                }));
            }
            // Create route context
            const context = {
                params: route.params,
                query,
                body: parsedBody,
                cookies: parseCookies(req),
                ip: '127.0.0.1',
                hostname: 'localhost',
                protocol: 'http',
                log,
                requestId
            };
            // Validate request if schema exists
            if (route.schema) {
                try {
                    await this.router.validateRequest(req, route.schema, context);
                }
                catch (error) {
                    // Handle validation errors
                    if (error instanceof Error && error.name === 'ValidationError') {
                        return this.createResponse(400, {
                            name: error.name,
                            message: error.message,
                            errors: error.errors
                        });
                    }
                    throw error;
                }
            }
            // Execute handler
            try {
                const result = await route.handler(req, context);
                // If result is a Response object, extract its data
                if (result instanceof Response) {
                    const responseBody = await result.text();
                    const responseHeaders = {};
                    result.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                    return {
                        statusCode: result.status,
                        headers: responseHeaders,
                        body: responseBody,
                        payload: responseBody,
                        json: () => JSON.parse(responseBody)
                    };
                }
                // Determine status code
                let statusCode = 200;
                let responseData = result;
                // Handle status code in result
                if (result && typeof result === 'object' && 'statusCode' in result) {
                    statusCode = result.statusCode;
                    // Remove statusCode from response data
                    const { statusCode: _, ...rest } = result;
                    responseData = rest;
                }
                // Validate response if schema exists
                if (route.schema?.response) {
                    try {
                        responseData = this.router.validateResponse(route.schema, statusCode, responseData);
                    }
                    catch (error) {
                        // Response validation failed - return error
                        if (error instanceof Error && error.name === 'ValidationError') {
                            return this.createResponse(500, {
                                name: error.name,
                                message: 'Response validation failed',
                                errors: error.errors
                            });
                        }
                        throw error;
                    }
                }
                // Otherwise, wrap result as JSON
                return this.createResponse(statusCode, responseData);
            }
            catch (error) {
                // Use error handling if available
                if (this.errorHandling && error instanceof Error) {
                    const response = await this.errorHandling.handleError(error, req);
                    const responseBody = await response.text();
                    const responseHeaders = {};
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                    return {
                        statusCode: response.status,
                        headers: responseHeaders,
                        body: responseBody,
                        payload: responseBody,
                        json: () => JSON.parse(responseBody)
                    };
                }
                // Handle errors thrown by route handler (fallback)
                if (error instanceof Error) {
                    // Check if error has statusCode (HttpError)
                    const statusCode = error.statusCode || 500;
                    const errorResponse = {
                        error: error.message,
                        code: error.code || 'INTERNAL_ERROR',
                        statusCode: statusCode,
                        ...(process.env.NODE_ENV === 'development' && {
                            stack: error.stack
                        })
                    };
                    return this.createResponse(statusCode, errorResponse);
                }
                // Unknown error type
                return this.createResponse(500, {
                    error: 'Internal Server Error',
                    code: 'INTERNAL_ERROR',
                    statusCode: 500
                });
            }
        }
        catch (error) {
            // Handle errors during request setup
            return this.createResponse(500, {
                error: error instanceof Error ? error.message : 'Unknown error',
                code: 'SETUP_ERROR',
                statusCode: 500
            });
        }
    }
    /**
     * Helper to create InjectResponse
     */
    createResponse(statusCode, data, headers) {
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        return {
            statusCode,
            headers: {
                'content-type': 'application/json',
                ...headers
            },
            body,
            payload: body,
            json: () => JSON.parse(body)
        };
    }
    /**
     * Convenience method for GET requests
     */
    async get(url, options) {
        return this.inject({ method: 'GET', url, ...options });
    }
    /**
     * Convenience method for POST requests
     */
    async post(url, options) {
        return this.inject({ method: 'POST', url, ...options });
    }
    /**
     * Convenience method for PUT requests
     */
    async put(url, options) {
        return this.inject({ method: 'PUT', url, ...options });
    }
    /**
     * Convenience method for DELETE requests
     */
    async delete(url, options) {
        return this.inject({ method: 'DELETE', url, ...options });
    }
    /**
     * Convenience method for PATCH requests
     */
    async patch(url, options) {
        return this.inject({ method: 'PATCH', url, ...options });
    }
}
/**
 * Assertion helpers for testing
 */
export const testHelpers = {
    /**
     * Assert response status code
     */
    assertStatus(response, expectedStatus) {
        if (response.statusCode !== expectedStatus) {
            throw new Error(`Expected status ${expectedStatus} but got ${response.statusCode}.\nBody: ${response.body}`);
        }
    },
    /**
     * Assert response contains JSON
     */
    assertJson(response) {
        try {
            response.json();
        }
        catch (error) {
            throw new Error('Response body is not valid JSON');
        }
    },
    /**
     * Assert response header exists
     */
    assertHeader(response, header, expectedValue) {
        const actualValue = response.headers[header.toLowerCase()];
        if (actualValue === undefined) {
            throw new Error(`Expected header '${header}' to exist`);
        }
        if (expectedValue !== undefined && actualValue !== expectedValue) {
            throw new Error(`Expected header '${header}' to be '${expectedValue}' but got '${actualValue}'`);
        }
    },
    /**
     * Assert response body matches
     */
    assertBody(response, expected) {
        const actual = response.json();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Response body mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
        }
    },
    /**
     * Assert response is successful (2xx)
     */
    assertSuccess(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Expected successful response but got ${response.statusCode}.\nBody: ${response.body}`);
        }
    },
    /**
     * Assert response is error (4xx or 5xx)
     */
    assertError(response) {
        if (response.statusCode < 400) {
            throw new Error(`Expected error response but got ${response.statusCode}.\nBody: ${response.body}`);
        }
    }
};
//# sourceMappingURL=testing.js.map