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

import type { Logger } from 'pino';
import { createLogger } from './logger';

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
  payload: string; // Alias for body (Fastify compat)

  /**
   * Parse response body as JSON
   */
  json<T = any>(): T;
}

/**
 * Testing utilities for Ogelfy
 */
export class Testing {
  constructor(
    private handleRequest: (req: Request) => Promise<Response>,
    private logger?: Logger
  ) {
    if (!this.logger) {
      this.logger = createLogger({ level: 'trace' });
    }
  }

  /**
   * Inject a request without starting HTTP server.
   * Runs through the full handleRequest() pipeline so hooks fire during tests.
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
  async inject(options: InjectOptions): Promise<InjectResponse> {
    try {
      const baseUrl = options.url.startsWith('http')
        ? options.url
        : `http://localhost${options.url}`;

      const url = new URL(baseUrl);

      if (options.query) {
        for (const [k, v] of Object.entries(options.query)) {
          url.searchParams.set(k, v);
        }
      }

      const headers = new Headers(options.headers || {});

      if (options.body && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }

      let body: string | undefined;
      if (options.body) {
        body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }

      const req = new Request(url.toString(), {
        method: options.method.toUpperCase(),
        headers,
        body
      });

      const response = await this.handleRequest(req);

      const responseBody = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      return {
        statusCode: response.status,
        headers: responseHeaders,
        body: responseBody,
        payload: responseBody,
        json: <T = any>(): T => JSON.parse(responseBody)
      };
    } catch (error) {
      const body = JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'SETUP_ERROR',
        statusCode: 500
      });
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body,
        payload: body,
        json: () => JSON.parse(body)
      };
    }
  }

  /**
   * Convenience method for GET requests
   */
  async get(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse> {
    return this.inject({ method: 'GET', url, ...options });
  }

  /**
   * Convenience method for POST requests
   */
  async post(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse> {
    return this.inject({ method: 'POST', url, ...options });
  }

  /**
   * Convenience method for PUT requests
   */
  async put(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse> {
    return this.inject({ method: 'PUT', url, ...options });
  }

  /**
   * Convenience method for DELETE requests
   */
  async delete(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse> {
    return this.inject({ method: 'DELETE', url, ...options });
  }

  /**
   * Convenience method for PATCH requests
   */
  async patch(url: string, options?: Omit<InjectOptions, 'method' | 'url'>): Promise<InjectResponse> {
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
  assertStatus(response: InjectResponse, expectedStatus: number): void {
    if (response.statusCode !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus} but got ${response.statusCode}.\nBody: ${response.body}`
      );
    }
  },

  /**
   * Assert response contains JSON
   */
  assertJson(response: InjectResponse): void {
    try {
      response.json();
    } catch (error) {
      throw new Error('Response body is not valid JSON');
    }
  },

  /**
   * Assert response header exists
   */
  assertHeader(response: InjectResponse, header: string, expectedValue?: string): void {
    const actualValue = response.headers[header.toLowerCase()];

    if (actualValue === undefined) {
      throw new Error(`Expected header '${header}' to exist`);
    }

    if (expectedValue !== undefined && actualValue !== expectedValue) {
      throw new Error(
        `Expected header '${header}' to be '${expectedValue}' but got '${actualValue}'`
      );
    }
  },

  /**
   * Assert response body matches
   */
  assertBody(response: InjectResponse, expected: any): void {
    const actual = response.json();

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Response body mismatch.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`
      );
    }
  },

  /**
   * Assert response is successful (2xx)
   */
  assertSuccess(response: InjectResponse): void {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `Expected successful response but got ${response.statusCode}.\nBody: ${response.body}`
      );
    }
  },

  /**
   * Assert response is error (4xx or 5xx)
   */
  assertError(response: InjectResponse): void {
    if (response.statusCode < 400) {
      throw new Error(
        `Expected error response but got ${response.statusCode}.\nBody: ${response.body}`
      );
    }
  }
};
