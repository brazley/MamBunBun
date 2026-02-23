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
import type { Router } from './router';
import type { ErrorHandling } from './error-handler';
import type { Logger } from 'pino';
/**
 * Options for injecting a request
 */
export interface InjectOptions {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, string>;
    params?: Record<string, string>;
}
/**
 * Response from injected request
 */
export interface InjectResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    payload: string;
    /**
     * Parse response body as JSON
     */
    json<T = any>(): T;
}
/**
 * Testing utilities for Ogelfy
 */
export declare class Testing {
    private router;
    private errorHandling?;
    private logger?;
    constructor(router: Router, errorHandling?: ErrorHandling | undefined, logger?: Logger | undefined);
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
    inject(options: InjectOptions): Promise<InjectResponse>;
    /**
     * Helper to create InjectResponse
     */
    private createResponse;
    /**
     * Convenience method for GET requests
     */
    get(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse>;
    /**
     * Convenience method for POST requests
     */
    post(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse>;
    /**
     * Convenience method for PUT requests
     */
    put(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse>;
    /**
     * Convenience method for DELETE requests
     */
    delete(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse>;
    /**
     * Convenience method for PATCH requests
     */
    patch(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse>;
}
/**
 * Assertion helpers for testing
 */
export declare const testHelpers: {
    /**
     * Assert response status code
     */
    assertStatus(response: InjectResponse, expectedStatus: number): void;
    /**
     * Assert response contains JSON
     */
    assertJson(response: InjectResponse): void;
    /**
     * Assert response header exists
     */
    assertHeader(response: InjectResponse, header: string, expectedValue?: string): void;
    /**
     * Assert response body matches
     */
    assertBody(response: InjectResponse, expected: any): void;
    /**
     * Assert response is successful (2xx)
     */
    assertSuccess(response: InjectResponse): void;
    /**
     * Assert response is error (4xx or 5xx)
     */
    assertError(response: InjectResponse): void;
};
//# sourceMappingURL=testing.d.ts.map