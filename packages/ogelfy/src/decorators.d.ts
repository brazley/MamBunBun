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
import type { HookRequest, Reply } from './hooks';
/**
 * Decorator getter function for lazy initialization
 */
export type DecoratorGetter<T = any> = () => T;
/**
 * Decorator value (direct value or getter function)
 */
export type DecoratorValue<T = any> = T | DecoratorGetter<T>;
/**
 * Decorator metadata
 */
interface DecoratorMetadata {
    name: string;
    value: any;
    isGetter: boolean;
    dependencies?: string[];
}
/**
 * Decorator Manager - manages decorators with inheritance and isolation
 */
export declare class DecoratorManager {
    private serverDecorators;
    private requestDecorators;
    private replyDecorators;
    private parent?;
    constructor(parent?: DecoratorManager);
    /**
     * Add a server decorator (extends app instance)
     */
    decorateServer<T = any>(target: any, name: string, value: DecoratorValue<T>, dependencies?: string[]): void;
    /**
     * Add a request decorator (extends request object)
     */
    decorateRequest<T = any>(name: string, value: DecoratorValue<T>, dependencies?: string[]): void;
    /**
     * Add a reply decorator (extends reply object)
     */
    decorateReply<T = any>(name: string, value: DecoratorValue<T>, dependencies?: string[]): void;
    /**
     * Apply request decorators to a request object
     */
    applyRequestDecorators(req: HookRequest): void;
    /**
     * Apply reply decorators to a reply object
     */
    applyReplyDecorators(reply: Reply): void;
    /**
     * Check if a server decorator exists (check parents too)
     */
    hasServerDecorator(name: string): boolean;
    /**
     * Check if a request decorator exists (check parents too)
     */
    hasRequestDecorator(name: string): boolean;
    /**
     * Check if a reply decorator exists (check parents too)
     */
    hasReplyDecorator(name: string): boolean;
    /**
     * Get server decorator metadata
     */
    getServerDecorator(name: string): DecoratorMetadata | undefined;
    /**
     * Get request decorator metadata
     */
    getRequestDecorator(name: string): DecoratorMetadata | undefined;
    /**
     * Get reply decorator metadata
     */
    getReplyDecorator(name: string): DecoratorMetadata | undefined;
    /**
     * Validate decorator name - check for conflicts
     */
    private validateDecoratorName;
    /**
     * Check if decorator dependencies are satisfied
     */
    private checkDependencies;
    /**
     * Clone decorator manager (for plugin context)
     * Creates shallow copy of decorator metadata
     */
    clone(): DecoratorManager;
    /**
     * Create child decorator manager (for plugin encapsulation)
     */
    createChild(): DecoratorManager;
    /**
     * Get all decorator names
     */
    getServerDecoratorNames(): string[];
    getRequestDecoratorNames(): string[];
    getReplyDecoratorNames(): string[];
    /**
     * Get decorator statistics
     */
    stats(): {
        server: number;
        request: number;
        reply: number;
        inherited: {
            server: number;
            request: number;
            reply: number;
        };
    };
    /**
     * Clear all decorators (useful for testing)
     */
    clear(): void;
}
/**
 * Create a new decorator manager instance
 */
export declare function createDecoratorManager(parent?: DecoratorManager): DecoratorManager;
export {};
//# sourceMappingURL=decorators.d.ts.map