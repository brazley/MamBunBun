/**
 * Ogelfy Plugin Utilities
 *
 * Helper functions for creating and managing plugins
 */

export { fp, getPluginMetadata, type PluginMetadata, type PluginRegistration } from './plugin-registry';
export type { PluginOptions } from './types';

/**
 * Helper to create a plugin with metadata
 * Alternative to fp() for more explicit plugin creation
 */
export function createPlugin(
  handler: (app: any, opts?: any) => Promise<void> | void,
  metadata?: {
    name?: string;
    version?: string;
    dependencies?: string[];
    ogelfy?: string;
    encapsulate?: boolean;
  }
) {
  const plugin = handler;
  if (metadata) {
    (plugin as any)[Symbol.for('plugin-metadata')] = metadata;
  }
  return plugin;
}

/**
 * Check if value is a valid plugin
 */
export function isPlugin(value: any): boolean {
  return typeof value === 'function';
}
