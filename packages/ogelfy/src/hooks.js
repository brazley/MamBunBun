/**
 * Ogelfy Lifecycle Hooks System
 *
 * Comprehensive hook management covering entire request lifecycle:
 * onRequest → preParsing → preValidation → preHandler → handler → preSerialization → onSend → onResponse
 *
 * Error path: onError
 * Timeout path: onTimeout
 */
/**
 * Reply object for building HTTP responses
 */
export class Reply {
    _statusCode = 200;
    _headers = new Map();
    _body = null;
    _sent = false;
    _response;
    get statusCode() {
        return this._statusCode;
    }
    get sent() {
        return this._sent;
    }
    get response() {
        if (this._response) {
            return this._response;
        }
        // Build response from current state
        const headers = {};
        this._headers.forEach((value, key) => {
            headers[key] = value;
        });
        if (!headers['Content-Type'] && this._body !== null) {
            headers['Content-Type'] = 'application/json';
        }
        const body = typeof this._body === 'string'
            ? this._body
            : this._body !== null
                ? JSON.stringify(this._body)
                : null;
        this._response = new Response(body, {
            status: this._statusCode,
            headers,
        });
        return this._response;
    }
    /**
     * Set response status code
     */
    status(code) {
        if (this._sent) {
            throw new Error('Cannot set status after response sent');
        }
        this._statusCode = code;
        return this;
    }
    /**
     * Set response header
     */
    header(name, value) {
        if (this._sent) {
            throw new Error('Cannot set header after response sent');
        }
        this._headers.set(name, value);
        return this;
    }
    /**
     * Set multiple headers at once
     */
    headers(headers) {
        if (this._sent) {
            throw new Error('Cannot set headers after response sent');
        }
        Object.entries(headers).forEach(([name, value]) => {
            this._headers.set(name, value);
        });
        return this;
    }
    /**
     * Send response
     */
    send(payload) {
        if (this._sent) {
            throw new Error('Reply already sent');
        }
        this._body = payload;
        this._sent = true;
        return this;
    }
    /**
     * Convenience method - set status and send in one call
     */
    code(statusCode) {
        return this.status(statusCode);
    }
    /**
     * Get header value
     */
    getHeader(name) {
        return this._headers.get(name);
    }
    /**
     * Remove header
     */
    removeHeader(name) {
        this._headers.delete(name);
        return this;
    }
    /**
     * Check if header exists
     */
    hasHeader(name) {
        return this._headers.has(name);
    }
    /**
     * Set raw Response object (for advanced usage)
     */
    setResponse(response) {
        this._response = response;
        this._sent = true;
    }
}
/**
 * Hook Manager - manages lifecycle hooks with proper execution order
 */
export class HookManager {
    hooks = new Map();
    constructor() {
        // Initialize empty arrays for all hook types
        this.hooks.set('onRequest', []);
        this.hooks.set('preParsing', []);
        this.hooks.set('preValidation', []);
        this.hooks.set('preHandler', []);
        this.hooks.set('preSerialization', []);
        this.hooks.set('onSend', []);
        this.hooks.set('onResponse', []);
        this.hooks.set('onError', []);
        this.hooks.set('onTimeout', []);
    }
    /**
     * Add a hook handler for a specific lifecycle event
     */
    add(name, handler) {
        const handlers = this.hooks.get(name);
        if (!handlers) {
            throw new Error(`Invalid hook name: ${name}`);
        }
        handlers.push(handler);
    }
    /**
     * Execute all hooks for a specific lifecycle event
     * Returns transformed payload if hook returns a value
     */
    async run(name, req, reply, payload, error) {
        const handlers = this.hooks.get(name);
        if (!handlers || handlers.length === 0) {
            return payload;
        }
        let currentPayload = payload;
        for (const handler of handlers) {
            // Stop execution if reply was sent during hook
            if (reply.sent) {
                return currentPayload;
            }
            try {
                const result = await handler(req, reply, currentPayload, error);
                // If hook returns a value, use it as transformed payload
                // This is important for preSerialization hooks
                if (result !== undefined && name === 'preSerialization') {
                    currentPayload = result;
                }
            }
            catch (err) {
                // If error occurs in hook, propagate it
                throw err;
            }
        }
        return currentPayload;
    }
    /**
     * Execute route-level hooks followed by global hooks
     * Route hooks execute BEFORE global hooks for the same phase
     */
    async runWithRoute(name, routeHooks, req, reply, payload, error) {
        let currentPayload = payload;
        // Execute route-level hooks first
        if (routeHooks) {
            const routeHandlers = routeHooks[name];
            if (routeHandlers && routeHandlers.length > 0) {
                for (const handler of routeHandlers) {
                    if (reply.sent)
                        return currentPayload;
                    try {
                        const result = await handler(req, reply, currentPayload, error);
                        if (result !== undefined && name === 'preSerialization') {
                            currentPayload = result;
                        }
                    }
                    catch (err) {
                        throw err;
                    }
                }
            }
        }
        // Then execute global hooks
        return await this.run(name, req, reply, currentPayload, error);
    }
    /**
     * Check if any hooks are registered for a lifecycle event
     */
    has(name) {
        const handlers = this.hooks.get(name);
        return Boolean(handlers && handlers.length > 0);
    }
    /**
     * Get all hooks for a lifecycle event
     */
    get(name) {
        return this.hooks.get(name) || [];
    }
    /**
     * Clear all hooks for a lifecycle event
     */
    clear(name) {
        if (name) {
            this.hooks.set(name, []);
        }
        else {
            // Clear all hooks
            this.hooks.forEach((_, hookName) => {
                this.hooks.set(hookName, []);
            });
        }
    }
    /**
     * Get count of hooks for a lifecycle event
     */
    count(name) {
        return this.hooks.get(name)?.length || 0;
    }
    /**
     * Clone hook manager (for plugin context isolation)
     * Creates a new manager with copies of all hook arrays
     */
    clone() {
        const cloned = new HookManager();
        this.hooks.forEach((handlers, name) => {
            // Shallow copy of handler arrays - handlers are shared but arrays are independent
            cloned.hooks.set(name, [...handlers]);
        });
        return cloned;
    }
    /**
     * Merge hooks from parent manager (for plugin inheritance)
     * Adds parent hooks before child hooks in execution order
     */
    inherit(parent) {
        parent.hooks.forEach((parentHandlers, name) => {
            const childHandlers = this.hooks.get(name) || [];
            // Parent hooks execute first, then child hooks
            this.hooks.set(name, [...parentHandlers, ...childHandlers]);
        });
    }
    /**
     * Execute onError hook with proper error handling
     * If onError hooks throw, catch and log but don't propagate
     */
    async runOnError(req, reply, error) {
        const handlers = this.hooks.get('onError');
        if (!handlers || handlers.length === 0) {
            return;
        }
        for (const handler of handlers) {
            try {
                await handler(req, reply, undefined, error);
                // If reply was sent during error hook, stop processing
                if (reply.sent) {
                    return;
                }
            }
            catch (hookError) {
                // Log error in hook but don't throw - we're already handling an error
                console.error('Error in onError hook:', hookError);
            }
        }
    }
    /**
     * Execute onTimeout hook when request exceeds time limit
     */
    async runOnTimeout(req, reply) {
        const handlers = this.hooks.get('onTimeout');
        if (!handlers || handlers.length === 0) {
            // Default timeout response
            if (!reply.sent) {
                reply.status(408).send({
                    error: 'Request Timeout',
                    message: 'Request exceeded time limit',
                    statusCode: 408
                });
            }
            return;
        }
        for (const handler of handlers) {
            try {
                await handler(req, reply);
                if (reply.sent) {
                    return;
                }
            }
            catch (error) {
                console.error('Error in onTimeout hook:', error);
            }
        }
        // If no hook sent a response, send default timeout response
        if (!reply.sent) {
            reply.status(408).send({
                error: 'Request Timeout',
                message: 'Request exceeded time limit',
                statusCode: 408
            });
        }
    }
    /**
     * Get all registered hook names with their counts
     */
    stats() {
        const stats = {};
        this.hooks.forEach((handlers, name) => {
            stats[name] = handlers.length;
        });
        return stats;
    }
}
/**
 * Create a new hook manager instance
 */
export function createHookManager() {
    return new HookManager();
}
/**
 * Helper to create timeout wrapper for request handling
 */
export function createTimeoutHandler(timeoutMs, onTimeout) {
    return async (req, reply, handler) => {
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(async () => {
                if (!reply.sent) {
                    await onTimeout(req, reply);
                }
                resolve();
            }, timeoutMs);
        });
        const handlerPromise = handler();
        await Promise.race([handlerPromise, timeoutPromise]);
    };
}
//# sourceMappingURL=hooks.js.map