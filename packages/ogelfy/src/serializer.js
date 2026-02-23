/**
 * Fast JSON Serialization Engine
 *
 * Uses fast-json-stringify for 3x faster serialization
 * Handles Date, BigInt, and custom types automatically
 */
import fastJson from 'fast-json-stringify';
export class Serializer {
    compiled = new Map();
    /**
     * Compile a schema into a fast serialization function using fast-json-stringify
     */
    compile(schema) {
        const key = JSON.stringify(schema);
        if (this.compiled.has(key)) {
            return this.compiled.get(key);
        }
        try {
            // Use fast-json-stringify for compilation
            const stringify = fastJson(schema);
            this.compiled.set(key, stringify);
            return stringify;
        }
        catch (error) {
            // Fallback to default serialization if compilation fails
            console.error('Failed to compile serializer:', error);
            const fallback = (obj) => this.defaultSerialize(obj);
            this.compiled.set(key, fallback);
            return fallback;
        }
    }
    /**
     * Serialize an object with optional schema
     */
    serialize(obj, schema) {
        if (!schema) {
            return this.defaultSerialize(obj);
        }
        const stringify = this.compile(schema);
        return stringify(obj);
    }
    /**
     * Default serialization with Date/BigInt support
     */
    defaultSerialize(obj) {
        return JSON.stringify(obj, (key, value) => {
            if (value instanceof Date) {
                return value.toISOString();
            }
            if (typeof value === 'bigint') {
                return value.toString();
            }
            return value;
        });
    }
    /**
     * Clear compiled cache
     */
    clear() {
        this.compiled.clear();
    }
    /**
     * Get cache size
     */
    get cacheSize() {
        return this.compiled.size;
    }
    /**
     * Remove a specific compiled schema
     */
    remove(schema) {
        const key = JSON.stringify(schema);
        return this.compiled.delete(key);
    }
    /**
     * Check if a schema is compiled
     */
    has(schema) {
        const key = JSON.stringify(schema);
        return this.compiled.has(key);
    }
}
// Export a singleton instance
export const serializer = new Serializer();
/**
 * Utility to create route schemas
 */
export function createRouteSchema(config) {
    return config;
}
/**
 * Create schema key for route-based serialization
 */
export function createSchemaKey(route, statusCode) {
    return `${route}:${statusCode}`;
}
/**
 * Create response schema key with method
 */
export function createResponseSchemaKey(route, method, statusCode) {
    return `${method}:${route}:${statusCode}`;
}
/**
 * Common schema builders
 */
export const Schemas = {
    string: (format) => {
        const schema = { type: 'string' };
        if (format)
            schema.format = format;
        return schema;
    },
    number: () => ({ type: 'number' }),
    integer: () => ({ type: 'integer' }),
    boolean: () => ({ type: 'boolean' }),
    null: () => ({ type: 'null' }),
    bigint: () => ({ type: 'number', format: 'bigint' }),
    date: () => ({ type: 'string', format: 'date-time' }),
    array: (items) => ({
        type: 'array',
        items
    }),
    object: (properties, required) => ({
        type: 'object',
        properties,
        required,
        additionalProperties: false
    }),
    nullable: (schema) => ({
        ...schema,
        nullable: true
    }),
    /**
     * Create a schema that accepts any of the provided schemas
     */
    anyOf: (...schemas) => ({
        type: 'object',
        anyOf: schemas
    }),
    /**
     * Create a schema that must match all provided schemas
     */
    allOf: (...schemas) => ({
        type: 'object',
        allOf: schemas
    }),
    /**
     * Create a schema that matches exactly one of the provided schemas
     */
    oneOf: (...schemas) => ({
        type: 'object',
        oneOf: schemas
    })
};
/**
 * Benchmark serializer performance
 */
export function benchmark(schema, data, iterations = 10000) {
    const serializer = new Serializer();
    const stringify = serializer.compile(schema);
    // Measure fast-json-stringify
    const start1 = performance.now();
    for (let i = 0; i < iterations; i++) {
        stringify(data);
    }
    const end1 = performance.now();
    const fastTime = end1 - start1;
    // Measure JSON.stringify
    const start2 = performance.now();
    for (let i = 0; i < iterations; i++) {
        JSON.stringify(data);
    }
    const end2 = performance.now();
    const slowTime = end2 - start2;
    return {
        fastTime,
        slowTime,
        speedup: slowTime / fastTime
    };
}
//# sourceMappingURL=serializer.js.map