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
  dependencies?: string[]; // For checking decorator ordering
}

/**
 * Decorator Manager - manages decorators with inheritance and isolation
 */
export class DecoratorManager {
  private serverDecorators: Map<string, DecoratorMetadata> = new Map();
  private requestDecorators: Map<string, DecoratorMetadata> = new Map();
  private replyDecorators: Map<string, DecoratorMetadata> = new Map();
  private parent?: DecoratorManager;

  constructor(parent?: DecoratorManager) {
    this.parent = parent;
  }

  /**
   * Add a server decorator (extends app instance)
   */
  decorateServer<T = any>(
    target: any,
    name: string,
    value: DecoratorValue<T>,
    dependencies?: string[]
  ): void {
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
        get: value as () => T,
        enumerable: true,
        configurable: true,
      });
    } else {
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
  decorateRequest<T = any>(
    name: string,
    value: DecoratorValue<T>,
    dependencies?: string[]
  ): void {
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
  decorateReply<T = any>(
    name: string,
    value: DecoratorValue<T>,
    dependencies?: string[]
  ): void {
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
  applyRequestDecorators(req: HookRequest): void {
    // Apply parent decorators first
    if (this.parent) {
      this.parent.applyRequestDecorators(req);
    }

    // Then apply local decorators
    this.requestDecorators.forEach((meta) => {
      if (meta.isGetter) {
        Object.defineProperty(req, meta.name, {
          get: meta.value as () => any,
          enumerable: true,
          configurable: true,
        });
      } else {
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
  applyReplyDecorators(reply: Reply): void {
    // Apply parent decorators first
    if (this.parent) {
      this.parent.applyReplyDecorators(reply);
    }

    // Then apply local decorators
    this.replyDecorators.forEach((meta) => {
      if (meta.isGetter) {
        Object.defineProperty(reply, meta.name, {
          get: meta.value as () => any,
          enumerable: true,
          configurable: true,
        });
      } else {
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
   * Fast-path guard: true if any request decorators exist (including inherited).
   * Used in handleRequest() to skip applyRequestDecorators() when no decorators
   * have been registered, avoiding unnecessary Object.defineProperty overhead.
   */
  hasAnyRequestDecorators(): boolean {
    if (this.requestDecorators.size > 0) return true;
    if (this.parent) return this.parent.hasAnyRequestDecorators();
    return false;
  }

  /**
   * Fast-path guard: true if any reply decorators exist (including inherited).
   */
  hasAnyReplyDecorators(): boolean {
    if (this.replyDecorators.size > 0) return true;
    if (this.parent) return this.parent.hasAnyReplyDecorators();
    return false;
  }

  /**
   * Check if a server decorator exists (check parents too)
   */
  hasServerDecorator(name: string): boolean {
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
  hasRequestDecorator(name: string): boolean {
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
  hasReplyDecorator(name: string): boolean {
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
  getServerDecorator(name: string): DecoratorMetadata | undefined {
    const local = this.serverDecorators.get(name);
    if (local) return local;
    if (this.parent) {
      return this.parent.getServerDecorator(name);
    }
    return undefined;
  }

  /**
   * Get request decorator metadata
   */
  getRequestDecorator(name: string): DecoratorMetadata | undefined {
    const local = this.requestDecorators.get(name);
    if (local) return local;
    if (this.parent) {
      return this.parent.getRequestDecorator(name);
    }
    return undefined;
  }

  /**
   * Get reply decorator metadata
   */
  getReplyDecorator(name: string): DecoratorMetadata | undefined {
    const local = this.replyDecorators.get(name);
    if (local) return local;
    if (this.parent) {
      return this.parent.getReplyDecorator(name);
    }
    return undefined;
  }

  /**
   * Validate decorator name - check for conflicts
   */
  private validateDecoratorName(name: string, type: 'server' | 'request' | 'reply'): void {
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
  private checkDependencies(dependencies: string[] | undefined, type: 'server' | 'request' | 'reply'): void {
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
  clone(): DecoratorManager {
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
  createChild(): DecoratorManager {
    return new DecoratorManager(this);
  }

  /**
   * Get all decorator names
   */
  getServerDecoratorNames(): string[] {
    const names = new Set<string>();

    // Collect from parent first
    if (this.parent) {
      this.parent.getServerDecoratorNames().forEach(name => names.add(name));
    }

    // Add local decorators
    this.serverDecorators.forEach((_, name) => names.add(name));

    return Array.from(names);
  }

  getRequestDecoratorNames(): string[] {
    const names = new Set<string>();

    if (this.parent) {
      this.parent.getRequestDecoratorNames().forEach(name => names.add(name));
    }

    this.requestDecorators.forEach((_, name) => names.add(name));

    return Array.from(names);
  }

  getReplyDecoratorNames(): string[] {
    const names = new Set<string>();

    if (this.parent) {
      this.parent.getReplyDecoratorNames().forEach(name => names.add(name));
    }

    this.replyDecorators.forEach((_, name) => names.add(name));

    return Array.from(names);
  }

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
  } {
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
  clear(): void {
    this.serverDecorators.clear();
    this.requestDecorators.clear();
    this.replyDecorators.clear();
  }
}

/**
 * Create a new decorator manager instance
 */
export function createDecoratorManager(parent?: DecoratorManager): DecoratorManager {
  return new DecoratorManager(parent);
}
