/**
 * Ogelfy Plugin Registry & Context Management
 *
 * Handles plugin lifecycle, dependency resolution, and context isolation.
 * Each plugin gets its own isolated context that inherits from parent but
 * doesn't leak to siblings - mimicking Fastify's avvio-based encapsulation.
 */
import { HookManager } from './hooks';
import { DecoratorManager } from './decorators';
import type { OgelfyPlugin } from './types';
/**
 * Plugin metadata for tracking and validation
 */
export interface PluginMetadata {
    name?: string;
    version?: string;
    dependencies?: string[];
    ogelfy?: string;
    encapsulate?: boolean;
}
/**
 * Complete plugin registration with metadata
 */
export interface PluginRegistration {
    plugin: OgelfyPlugin;
    options?: any;
    metadata?: PluginMetadata;
}
/**
 * Plugin context - isolated Ogelfy instance for each plugin
 */
export interface PluginContext {
    hooks: HookManager;
    decorators: DecoratorManager;
    metadata?: PluginMetadata;
    parent?: PluginContext;
}
/**
 * Plugin Registry - manages plugin loading, dependencies, and contexts
 */
export declare class PluginRegistry {
    private plugins;
    private loaded;
    private loading;
    private contexts;
    constructor();
    /**
     * Register a plugin with optional metadata
     */
    register(plugin: OgelfyPlugin, options?: any, metadata?: PluginMetadata): Promise<void>;
    /**
     * Check if plugin is loaded
     */
    hasPlugin(name: string): boolean;
    /**
     * Check if plugin is currently loading
     */
    isLoading(name: string): boolean;
    /**
     * Get plugin metadata
     */
    getMetadata(name: string): PluginMetadata | undefined;
    /**
     * Get all loaded plugin names
     */
    getLoadedPlugins(): string[];
    /**
     * Get all loading plugin names (for debugging circular deps)
     */
    getLoadingPlugins(): string[];
    /**
     * Validate that all dependencies are loaded
     */
    private validateDependencies;
    /**
     * Validate Ogelfy version constraint
     * Supports: >=1.0.0, <=2.0.0, ^1.0.0, ~1.0.0, =1.0.0
     */
    private validateVersionConstraint;
    /**
     * Check if version matches constraint
     * Basic implementation - production should use semver library
     */
    private matchesVersionConstraint;
    /**
     * Compare two semantic versions
     * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    private compareVersions;
    /**
     * Generate unique plugin name for anonymous plugins
     */
    private generatePluginName;
    /**
     * Clear all plugin state (for testing)
     */
    clear(): void;
    /**
     * Get plugin statistics
     */
    stats(): {
        total: number;
        loaded: number;
        loading: number;
        plugins: string[];
    };
}
/**
 * Topological sort for plugin dependency resolution
 * Returns plugins in correct loading order
 */
export declare function resolvePluginOrder(plugins: PluginRegistration[]): PluginRegistration[];
/**
 * Create plugin wrapper that adds metadata (like fastify-plugin)
 */
export declare function fp<T extends OgelfyPlugin>(plugin: T, metadata?: PluginMetadata): T;
/**
 * Extract plugin metadata from wrapped plugin
 */
export declare function getPluginMetadata(plugin: OgelfyPlugin): PluginMetadata | undefined;
/**
 * Create a new plugin registry instance
 */
export declare function createPluginRegistry(): PluginRegistry;
//# sourceMappingURL=plugin-registry.d.ts.map