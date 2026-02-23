/**
 * Ogelfy Plugin Registry & Context Management
 *
 * Handles plugin lifecycle, dependency resolution, and context isolation.
 * Each plugin gets its own isolated context that inherits from parent but
 * doesn't leak to siblings - mimicking Fastify's avvio-based encapsulation.
 */
/**
 * Plugin Registry - manages plugin loading, dependencies, and contexts
 */
export class PluginRegistry {
    plugins = new Map();
    loaded = new Set();
    loading = new Set(); // For circular dependency detection
    contexts = new Map();
    constructor() { }
    /**
     * Register a plugin with optional metadata
     */
    async register(plugin, options, metadata) {
        const pluginName = metadata?.name || this.generatePluginName();
        try {
            // 1. Validate Ogelfy version constraint
            if (metadata?.ogelfy) {
                this.validateVersionConstraint(metadata.ogelfy);
            }
            // 2. Check for circular dependencies
            if (this.loading.has(pluginName)) {
                throw new Error(`Circular dependency detected: ${pluginName}`);
            }
            // 3. Check dependencies are loaded
            if (metadata?.dependencies && metadata.dependencies.length > 0) {
                this.validateDependencies(pluginName, metadata.dependencies);
            }
            // 4. Mark as loading
            this.loading.add(pluginName);
            // 5. Store metadata
            if (metadata?.name) {
                this.plugins.set(pluginName, metadata);
            }
            // 6. Execute plugin
            await plugin(null, options); // Pass app and options
            // 7. Mark as loaded
            this.loaded.add(pluginName);
            this.loading.delete(pluginName);
        }
        catch (error) {
            // Clean up on error
            this.loading.delete(pluginName);
            if (metadata?.name) {
                this.plugins.delete(pluginName);
            }
            throw error;
        }
    }
    /**
     * Check if plugin is loaded
     */
    hasPlugin(name) {
        return this.loaded.has(name);
    }
    /**
     * Check if plugin is currently loading
     */
    isLoading(name) {
        return this.loading.has(name);
    }
    /**
     * Get plugin metadata
     */
    getMetadata(name) {
        return this.plugins.get(name);
    }
    /**
     * Get all loaded plugin names
     */
    getLoadedPlugins() {
        return Array.from(this.loaded);
    }
    /**
     * Get all loading plugin names (for debugging circular deps)
     */
    getLoadingPlugins() {
        return Array.from(this.loading);
    }
    /**
     * Validate that all dependencies are loaded
     */
    validateDependencies(pluginName, dependencies) {
        const missing = [];
        for (const dep of dependencies) {
            if (!this.loaded.has(dep)) {
                missing.push(dep);
            }
        }
        if (missing.length > 0) {
            throw new Error(`Plugin "${pluginName}" has unmet dependencies: ${missing.join(', ')}`);
        }
    }
    /**
     * Validate Ogelfy version constraint
     * Supports: >=1.0.0, <=2.0.0, ^1.0.0, ~1.0.0, =1.0.0
     */
    validateVersionConstraint(constraint) {
        const OGELFY_VERSION = '1.0.0'; // Current Ogelfy version
        // Simple version validation - can be enhanced with semver library
        if (!this.matchesVersionConstraint(OGELFY_VERSION, constraint)) {
            throw new Error(`Plugin requires Ogelfy ${constraint}, but current version is ${OGELFY_VERSION}`);
        }
    }
    /**
     * Check if version matches constraint
     * Basic implementation - production should use semver library
     */
    matchesVersionConstraint(version, constraint) {
        // Remove whitespace
        constraint = constraint.trim();
        // Exact match
        if (constraint.startsWith('=')) {
            return version === constraint.slice(1).trim();
        }
        // Greater than or equal
        if (constraint.startsWith('>=')) {
            const requiredVersion = constraint.slice(2);
            return this.compareVersions(version, requiredVersion) >= 0;
        }
        // Less than or equal
        if (constraint.startsWith('<=')) {
            const requiredVersion = constraint.slice(2);
            return this.compareVersions(version, requiredVersion) <= 0;
        }
        // Greater than
        if (constraint.startsWith('>')) {
            const requiredVersion = constraint.slice(1);
            return this.compareVersions(version, requiredVersion) > 0;
        }
        // Less than
        if (constraint.startsWith('<')) {
            const requiredVersion = constraint.slice(1);
            return this.compareVersions(version, requiredVersion) < 0;
        }
        // Caret (^) - compatible with major version
        if (constraint.startsWith('^')) {
            const requiredVersion = constraint.slice(1);
            const [vMajor] = version.split('.');
            const [rMajor] = requiredVersion.split('.');
            return vMajor === rMajor && this.compareVersions(version, requiredVersion) >= 0;
        }
        // Tilde (~) - compatible with minor version
        if (constraint.startsWith('~')) {
            const requiredVersion = constraint.slice(1);
            const [vMajor, vMinor] = version.split('.');
            const [rMajor, rMinor] = requiredVersion.split('.');
            return (vMajor === rMajor &&
                vMinor === rMinor &&
                this.compareVersions(version, requiredVersion) >= 0);
        }
        // Default: exact match
        return version === constraint;
    }
    /**
     * Compare two semantic versions
     * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;
            if (part1 > part2)
                return 1;
            if (part1 < part2)
                return -1;
        }
        return 0;
    }
    /**
     * Generate unique plugin name for anonymous plugins
     */
    generatePluginName() {
        return `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    /**
     * Clear all plugin state (for testing)
     */
    clear() {
        this.plugins.clear();
        this.loaded.clear();
        this.loading.clear();
        this.contexts.clear();
    }
    /**
     * Get plugin statistics
     */
    stats() {
        return {
            total: this.plugins.size,
            loaded: this.loaded.size,
            loading: this.loading.size,
            plugins: Array.from(this.plugins.keys()),
        };
    }
}
/**
 * Topological sort for plugin dependency resolution
 * Returns plugins in correct loading order
 */
export function resolvePluginOrder(plugins) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();
    // Build name to plugin map
    const pluginMap = new Map();
    plugins.forEach((p) => {
        const name = p.metadata?.name || 'anonymous';
        pluginMap.set(name, p);
    });
    function visit(plugin) {
        const name = plugin.metadata?.name || 'anonymous';
        if (visited.has(name))
            return;
        if (visiting.has(name)) {
            throw new Error(`Circular dependency detected: ${name}`);
        }
        visiting.add(name);
        // Visit dependencies first
        if (plugin.metadata?.dependencies) {
            for (const depName of plugin.metadata.dependencies) {
                const depPlugin = pluginMap.get(depName);
                if (!depPlugin) {
                    throw new Error(`Missing dependency: ${depName} (required by ${name})`);
                }
                visit(depPlugin);
            }
        }
        visiting.delete(name);
        visited.add(name);
        sorted.push(plugin);
    }
    // Visit all plugins
    for (const plugin of plugins) {
        visit(plugin);
    }
    return sorted;
}
/**
 * Plugin with metadata symbol
 */
const PLUGIN_METADATA_SYMBOL = Symbol.for('plugin-metadata');
/**
 * Create plugin wrapper that adds metadata (like fastify-plugin)
 */
export function fp(plugin, metadata) {
    const wrapped = plugin;
    wrapped[PLUGIN_METADATA_SYMBOL] = metadata || {};
    return wrapped;
}
/**
 * Extract plugin metadata from wrapped plugin
 */
export function getPluginMetadata(plugin) {
    return plugin[PLUGIN_METADATA_SYMBOL];
}
/**
 * Create a new plugin registry instance
 */
export function createPluginRegistry() {
    return new PluginRegistry();
}
//# sourceMappingURL=plugin-registry.js.map