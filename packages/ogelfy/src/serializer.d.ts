/**
 * Fast JSON Serialization Engine
 *
 * Uses fast-json-stringify for 3x faster serialization
 * Handles Date, BigInt, and custom types automatically
 */
export interface SerializerSchema {
    type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'integer';
    properties?: Record<string, SerializerSchema>;
    items?: SerializerSchema;
    format?: 'date-time' | 'date' | 'time' | 'bigint';
    required?: string[];
    additionalProperties?: boolean | SerializerSchema;
    nullable?: boolean;
    allOf?: SerializerSchema[];
    anyOf?: SerializerSchema[];
    oneOf?: SerializerSchema[];
}
export interface RouteSchema {
    response?: {
        [statusCode: number]: SerializerSchema;
    };
    body?: SerializerSchema;
}
type CompiledSerializer = (obj: any) => string;
export declare class Serializer {
    private compiled;
    /**
     * Compile a schema into a fast serialization function using fast-json-stringify
     */
    compile(schema: SerializerSchema): CompiledSerializer;
    /**
     * Serialize an object with optional schema
     */
    serialize(obj: any, schema?: SerializerSchema): string;
    /**
     * Default serialization with Date/BigInt support
     */
    private defaultSerialize;
    /**
     * Clear compiled cache
     */
    clear(): void;
    /**
     * Get cache size
     */
    get cacheSize(): number;
    /**
     * Remove a specific compiled schema
     */
    remove(schema: SerializerSchema): boolean;
    /**
     * Check if a schema is compiled
     */
    has(schema: SerializerSchema): boolean;
}
export declare const serializer: Serializer;
/**
 * Utility to create route schemas
 */
export declare function createRouteSchema(config: {
    response?: {
        [statusCode: number]: SerializerSchema;
    };
    body?: SerializerSchema;
}): RouteSchema;
/**
 * Create schema key for route-based serialization
 */
export declare function createSchemaKey(route: string, statusCode: number): string;
/**
 * Create response schema key with method
 */
export declare function createResponseSchemaKey(route: string, method: string, statusCode: number): string;
/**
 * Common schema builders
 */
export declare const Schemas: {
    string: (format?: "date-time" | "date" | "time") => SerializerSchema;
    number: () => SerializerSchema;
    integer: () => SerializerSchema;
    boolean: () => SerializerSchema;
    null: () => SerializerSchema;
    bigint: () => SerializerSchema;
    date: () => SerializerSchema;
    array: (items: SerializerSchema) => SerializerSchema;
    object: (properties: Record<string, SerializerSchema>, required?: string[]) => SerializerSchema;
    nullable: (schema: SerializerSchema) => SerializerSchema;
    /**
     * Create a schema that accepts any of the provided schemas
     */
    anyOf: (...schemas: SerializerSchema[]) => SerializerSchema;
    /**
     * Create a schema that must match all provided schemas
     */
    allOf: (...schemas: SerializerSchema[]) => SerializerSchema;
    /**
     * Create a schema that matches exactly one of the provided schemas
     */
    oneOf: (...schemas: SerializerSchema[]) => SerializerSchema;
};
/**
 * Benchmark serializer performance
 */
export declare function benchmark(schema: SerializerSchema, data: any, iterations?: number): {
    fastTime: number;
    slowTime: number;
    speedup: number;
};
export {};
//# sourceMappingURL=serializer.d.ts.map