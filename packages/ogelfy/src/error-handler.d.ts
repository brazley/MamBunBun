/**
 * Production-grade error handling system for Ogelfy
 *
 * Features:
 * - Custom HTTP error classes with status codes
 * - Validation error formatting
 * - Configurable error handlers
 * - 404 handler support
 * - Consistent error serialization
 */
import type { RouteHandler } from './types';
import { ZodError } from 'zod';
/**
 * Base HTTP error class with status code and error code
 */
export declare class HttpError extends Error {
    statusCode: number;
    code?: string | undefined;
    details?: any | undefined;
    constructor(statusCode: number, message: string, code?: string | undefined, details?: any | undefined);
    toJSON(): any;
}
/**
 * Validation error class for Zod validation failures
 */
export declare class ValidationError extends HttpError {
    errors: any[];
    constructor(message: string, errors: any[]);
    static fromZodError(zodError: ZodError): ValidationError;
}
/**
 * HTTP error factory functions for common status codes
 */
export declare const httpErrors: {
    /**
     * 400 Bad Request
     */
    badRequest: (message?: string, details?: any) => HttpError;
    /**
     * 401 Unauthorized
     */
    unauthorized: (message?: string, details?: any) => HttpError;
    /**
     * 403 Forbidden
     */
    forbidden: (message?: string, details?: any) => HttpError;
    /**
     * 404 Not Found
     */
    notFound: (message?: string, details?: any) => HttpError;
    /**
     * 409 Conflict
     */
    conflict: (message?: string, details?: any) => HttpError;
    /**
     * 422 Unprocessable Entity
     */
    unprocessableEntity: (message?: string, details?: any) => HttpError;
    /**
     * 429 Too Many Requests
     */
    tooManyRequests: (message?: string, details?: any) => HttpError;
    /**
     * 500 Internal Server Error
     */
    internalServerError: (message?: string, details?: any) => HttpError;
    /**
     * 501 Not Implemented
     */
    notImplemented: (message?: string, details?: any) => HttpError;
    /**
     * 503 Service Unavailable
     */
    serviceUnavailable: (message?: string, details?: any) => HttpError;
    /**
     * Create validation error from Zod validation failure
     */
    validation: (zodError: ZodError) => ValidationError;
};
/**
 * Error handler function type
 */
export type ErrorHandler = (error: Error, req: Request) => Promise<Response> | Response;
/**
 * Not found handler function type
 */
export type NotFoundHandler = RouteHandler;
/**
 * Error handling utilities
 */
export declare class ErrorHandling {
    private errorHandler?;
    private notFoundHandler?;
    /**
     * Set custom error handler
     */
    setErrorHandler(handler: ErrorHandler): void;
    /**
     * Set custom 404 handler
     */
    setNotFoundHandler(handler: NotFoundHandler): void;
    /**
     * Get the current error handler
     */
    getErrorHandler(): ErrorHandler | undefined;
    /**
     * Get the current not found handler
     */
    getNotFoundHandler(): NotFoundHandler | undefined;
    /**
     * Handle error using custom or default handler
     */
    handleError(error: Error, req: Request): Promise<Response>;
    /**
     * Handle 404 using custom or default handler
     */
    handleNotFound(req: Request): Promise<Response>;
    /**
     * Default error handler
     */
    private defaultErrorHandler;
}
/**
 * Create error response helper
 */
export declare function createErrorResponse(statusCode: number, message: string, code?: string, details?: any): Response;
/**
 * Assert helper for error throwing
 */
export declare function assert(condition: any, error: HttpError): asserts condition;
/**
 * Error boundary wrapper for async functions
 */
export declare function errorBoundary<T extends (...args: any[]) => Promise<any>>(fn: T, errorHandler?: (error: Error) => any): T;
//# sourceMappingURL=error-handler.d.ts.map