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
import { ZodError } from 'zod';
/**
 * Base HTTP error class with status code and error code
 */
export class HttpError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, message, code, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'HttpError';
        Error.captureStackTrace(this, this.constructor);
    }
    toJSON() {
        return {
            error: this.message,
            code: this.code,
            statusCode: this.statusCode,
            ...(this.details && { details: this.details })
        };
    }
}
/**
 * Validation error class for Zod validation failures
 */
export class ValidationError extends HttpError {
    errors;
    constructor(message, errors) {
        super(400, message, 'VALIDATION_ERROR', errors);
        this.errors = errors;
        this.name = 'ValidationError';
    }
    static fromZodError(zodError) {
        const formattedErrors = zodError.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code
        }));
        return new ValidationError('Validation failed', formattedErrors);
    }
}
/**
 * HTTP error factory functions for common status codes
 */
export const httpErrors = {
    /**
     * 400 Bad Request
     */
    badRequest: (message = 'Bad Request', details) => new HttpError(400, message, 'BAD_REQUEST', details),
    /**
     * 401 Unauthorized
     */
    unauthorized: (message = 'Unauthorized', details) => new HttpError(401, message, 'UNAUTHORIZED', details),
    /**
     * 403 Forbidden
     */
    forbidden: (message = 'Forbidden', details) => new HttpError(403, message, 'FORBIDDEN', details),
    /**
     * 404 Not Found
     */
    notFound: (message = 'Not Found', details) => new HttpError(404, message, 'NOT_FOUND', details),
    /**
     * 409 Conflict
     */
    conflict: (message = 'Conflict', details) => new HttpError(409, message, 'CONFLICT', details),
    /**
     * 422 Unprocessable Entity
     */
    unprocessableEntity: (message = 'Unprocessable Entity', details) => new HttpError(422, message, 'UNPROCESSABLE_ENTITY', details),
    /**
     * 429 Too Many Requests
     */
    tooManyRequests: (message = 'Too Many Requests', details) => new HttpError(429, message, 'TOO_MANY_REQUESTS', details),
    /**
     * 500 Internal Server Error
     */
    internalServerError: (message = 'Internal Server Error', details) => new HttpError(500, message, 'INTERNAL_ERROR', details),
    /**
     * 501 Not Implemented
     */
    notImplemented: (message = 'Not Implemented', details) => new HttpError(501, message, 'NOT_IMPLEMENTED', details),
    /**
     * 503 Service Unavailable
     */
    serviceUnavailable: (message = 'Service Unavailable', details) => new HttpError(503, message, 'SERVICE_UNAVAILABLE', details),
    /**
     * Create validation error from Zod validation failure
     */
    validation: (zodError) => ValidationError.fromZodError(zodError),
};
/**
 * Error handling utilities
 */
export class ErrorHandling {
    errorHandler;
    notFoundHandler;
    /**
     * Set custom error handler
     */
    setErrorHandler(handler) {
        this.errorHandler = handler;
    }
    /**
     * Set custom 404 handler
     */
    setNotFoundHandler(handler) {
        this.notFoundHandler = handler;
    }
    /**
     * Get the current error handler
     */
    getErrorHandler() {
        return this.errorHandler;
    }
    /**
     * Get the current not found handler
     */
    getNotFoundHandler() {
        return this.notFoundHandler;
    }
    /**
     * Handle error using custom or default handler
     */
    async handleError(error, req) {
        // Use custom error handler if set
        if (this.errorHandler) {
            return this.errorHandler(error, req);
        }
        // Default error handling
        return this.defaultErrorHandler(error, req);
    }
    /**
     * Handle 404 using custom or default handler
     */
    async handleNotFound(req) {
        // Use custom not found handler if set
        if (this.notFoundHandler) {
            const result = await this.notFoundHandler(req);
            return new Response(JSON.stringify(result), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Default 404 response
        return new Response(JSON.stringify({
            error: 'Not Found',
            code: 'NOT_FOUND',
            statusCode: 404,
            path: new URL(req.url).pathname
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    /**
     * Default error handler
     */
    defaultErrorHandler(error, req) {
        // Handle Zod validation errors
        if (error instanceof ZodError) {
            const validationError = ValidationError.fromZodError(error);
            return new Response(JSON.stringify(validationError.toJSON()), {
                status: validationError.statusCode,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Handle ValidationError
        if (error instanceof ValidationError) {
            return new Response(JSON.stringify(error.toJSON()), {
                status: error.statusCode,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Handle HttpError
        if (error instanceof HttpError) {
            return new Response(JSON.stringify(error.toJSON()), {
                status: error.statusCode,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Handle unknown errors
        console.error('Unhandled error:', error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
            statusCode: 500,
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
/**
 * Create error response helper
 */
export function createErrorResponse(statusCode, message, code, details) {
    return new Response(JSON.stringify({
        error: message,
        code,
        statusCode,
        ...(details && { details })
    }), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
    });
}
/**
 * Assert helper for error throwing
 */
export function assert(condition, error) {
    if (!condition) {
        throw error;
    }
}
/**
 * Error boundary wrapper for async functions
 */
export function errorBoundary(fn, errorHandler) {
    return (async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            if (errorHandler) {
                return errorHandler(error);
            }
            throw error;
        }
    });
}
//# sourceMappingURL=error-handler.js.map