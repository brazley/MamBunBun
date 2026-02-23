/**
 * Ogelfy Decorator System
 *
 * Allows safe extension of server, request, and reply objects with custom properties and methods.
 * Supports:
 * - Server decorators: Add utilities, connections, config to app instance
 * - Request decorators: Add user, session, metadata to requests
 * - Reply decorators: Add custom response methods
 * - Getter decorators: Lazy initialization
 * - Decorator inheritance in plugin contexts
 */
/**
 * Decorator Manager - manages decorators with inheritance and isolation
 */
export class DecoratorManager {
    serverDecorators = new Map();
    requestDecorators = new Map();
    replyDecorators = new Map();
    parent;
    constructor(parent) {
        this.parent = parent;
    }
    /**
     * Add a server decorator (extends app instance)
     */
    decorateServer(target, name, value, dependencies) {
        this.validateDecoratorName(name, 'server');
        this.checkDependencies(dependencies, 'server');
        const isGetter = typeof value === 'function' && value.length === 0;
        this.serverDecorators.set(name, {
            name,
            value,
            isGetter,
            dependencies,
        });
        // Add to target object
        if (isGetter) {
            Object.defineProperty(target, name, {
                get: value,
                enumerable: true,
                configurable: true,
            });
        }
        else {
            Object.defineProperty(target, name, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }
    }
    /**
     * Add a request decorator (extends request object)
     */
    decorateRequest(name, value, dependencies) {
        this.validateDecoratorName(name, 'request');
        this.checkDependencies(dependencies, 'request');
        const isGetter = typeof value === 'function' && value.length === 0;
        this.requestDecorators.set(name, {
            name,
            value,
            isGetter,
            dependencies,
        });
    }
    /**
     * Add a reply decorator (extends reply object)
     */
    decorateReply(name, value, dependencies) {
        this.validateDecoratorName(name, 'reply');
        this.checkDependencies(dependencies, 'reply');
        // Reply decorators are never treated as getters - they're always methods or values
        const isGetter = false;
        this.replyDecorators.set(name, {
            name,
            value,
            isGetter,
            dependencies,
        });
    }
    /**
     * Apply request decorators to a request object
     */
    applyRequestDecorators(req) {
        // Apply parent decorators first
        if (this.parent) {
            this.parent.applyRequestDecorators(req);
        }
        // Then apply local decorators
        this.requestDecorators.forEach((meta) => {
            if (meta.isGetter) {
                Object.defineProperty(req, meta.name, {
                    get: meta.value,
                    enumerable: true,
                    configurable: true,
                });
            }
            else {
                Object.defineProperty(req, meta.name, {
                    value: meta.value,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
        });
    }
    /**
     * Apply reply decorators to a reply object
     */
    applyReplyDecorators(reply) {
        // Apply parent decorators first
        if (this.parent) {
            this.parent.applyReplyDecorators(reply);
        }
        // Then apply local decorators
        this.replyDecorators.forEach((meta) => {
            if (meta.isGetter) {
                Object.defineProperty(reply, meta.name, {
                    get: meta.value,
                    enumerable: true,
                    configurable: true,
                });
            }
            else {
                Object.defineProperty(reply, meta.name, {
                    value: meta.value,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
        });
    }
    /**
     * Check if a server decorator exists (check parents too)
     */
    hasServerDecorator(name) {
        if (this.serverDecorators.has(name)) {
            return true;
        }
        if (this.parent) {
            return this.parent.hasServerDecorator(name);
        }
        return false;
    }
    /**
     * Check if a request decorator exists (check parents too)
     */
    hasRequestDecorator(name) {
        if (this.requestDecorators.has(name)) {
            return true;
        }
        if (this.parent) {
            return this.parent.hasRequestDecorator(name);
        }
        return false;
    }
    /**
     * Check if a reply decorator exists (check parents too)
     */
    hasReplyDecorator(name) {
        if (this.replyDecorators.has(name)) {
            return true;
        }
        if (this.parent) {
            return this.parent.hasReplyDecorator(name);
        }
        return false;
    }
    /**
     * Get server decorator metadata
     */
    getServerDecorator(name) {
        const local = this.serverDecorators.get(name);
        if (local)
            return local;
        if (this.parent) {
            return this.parent.getServerDecorator(name);
        }
        return undefined;
    }
    /**
     * Get request decorator metadata
     */
    getRequestDecorator(name) {
        const local = this.requestDecorators.get(name);
        if (local)
            return local;
        if (this.parent) {
            return this.parent.getRequestDecorator(name);
        }
        return undefined;
    }
    /**
     * Get reply decorator metadata
     */
    getReplyDecorator(name) {
        const local = this.replyDecorators.get(name);
        if (local)
            return local;
        if (this.parent) {
            return this.parent.getReplyDecorator(name);
        }
        return undefined;
    }
    /**
     * Validate decorator name - check for conflicts
     */
    validateDecoratorName(name, type) {
        // Check for reserved names
        const reservedNames = [
            'constructor',
            'prototype',
            '__proto__',
            'toString',
            'valueOf',
            'hasOwnProperty',
        ];
        if (reservedNames.includes(name)) {
            throw new Error(`Cannot use reserved name '${name}' as decorator`);
        }
        // Check if already exists in this context or parent
        let exists = false;
        switch (type) {
            case 'server':
                exists = this.hasServerDecorator(name);
                break;
            case 'request':
                exists = this.hasRequestDecorator(name);
                break;
            case 'reply':
                exists = this.hasReplyDecorator(name);
                break;
        }
        if (exists) {
            throw new Error(`${type} decorator '${name}' already exists`);
        }
    }
    /**
     * Check if decorator dependencies are satisfied
     */
    checkDependencies(dependencies, type) {
        if (!dependencies || dependencies.length === 0) {
            return;
        }
        for (const dep of dependencies) {
            let exists = false;
            switch (type) {
                case 'server':
                    exists = this.hasServerDecorator(dep);
                    break;
                case 'request':
                    exists = this.hasRequestDecorator(dep);
                    break;
                case 'reply':
                    exists = this.hasReplyDecorator(dep);
                    break;
            }
            if (!exists) {
                throw new Error(`Decorator dependency '${dep}' not found for ${type} decorator`);
            }
        }
    }
    /**
     * Clone decorator manager (for plugin context)
     * Creates shallow copy of decorator metadata
     */
    clone() {
        const cloned = new DecoratorManager(this.parent);
        this.serverDecorators.forEach((meta, name) => {
            cloned.serverDecorators.set(name, { ...meta });
        });
        this.requestDecorators.forEach((meta, name) => {
            cloned.requestDecorators.set(name, { ...meta });
        });
        this.replyDecorators.forEach((meta, name) => {
            cloned.replyDecorators.set(name, { ...meta });
        });
        return cloned;
    }
    /**
     * Create child decorator manager (for plugin encapsulation)
     */
    createChild() {
        return new DecoratorManager(this);
    }
    /**
     * Get all decorator names
     */
    getServerDecoratorNames() {
        const names = new Set();
        // Collect from parent first
        if (this.parent) {
            this.parent.getServerDecoratorNames().forEach(name => names.add(name));
        }
        // Add local decorators
        this.serverDecorators.forEach((_, name) => names.add(name));
        return Array.from(names);
    }
    getRequestDecoratorNames() {
        const names = new Set();
        if (this.parent) {
            this.parent.getRequestDecoratorNames().forEach(name => names.add(name));
        }
        this.requestDecorators.forEach((_, name) => names.add(name));
        return Array.from(names);
    }
    getReplyDecoratorNames() {
        const names = new Set();
        if (this.parent) {
            this.parent.getReplyDecoratorNames().forEach(name => names.add(name));
        }
        this.replyDecorators.forEach((_, name) => names.add(name));
        return Array.from(names);
    }
    /**
     * Get decorator statistics
     */
    stats() {
        const parentStats = this.parent?.stats();
        return {
            server: this.serverDecorators.size,
            request: this.requestDecorators.size,
            reply: this.replyDecorators.size,
            inherited: {
                server: parentStats?.server || 0,
                request: parentStats?.request || 0,
                reply: parentStats?.reply || 0,
            },
        };
    }
    /**
     * Clear all decorators (useful for testing)
     */
    clear() {
        this.serverDecorators.clear();
        this.requestDecorators.clear();
        this.replyDecorators.clear();
    }
}
/**
 * Create a new decorator manager instance
 */
export function createDecoratorManager(parent) {
    return new DecoratorManager(parent);
}
//# sourceMappingURL=decorators.js.map