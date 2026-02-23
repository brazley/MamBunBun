import { type ValidateFunction, type ErrorObject } from 'ajv';
export declare class ValidationError extends Error {
    errors: ErrorObject[];
    constructor(errors: ErrorObject[]);
    private static formatErrors;
    toJSON(): {
        name: string;
        message: string;
        errors: {
            path: string;
            message: string | undefined;
            params: Record<string, any>;
        }[];
    };
}
export interface SchemaCompilerOptions {
    coerceTypes?: boolean;
    removeAdditional?: boolean | 'all' | 'failing';
    useDefaults?: boolean;
    strict?: boolean;
}
export declare class SchemaCompiler {
    private ajv;
    private schemas;
    private compiledValidators;
    constructor(options?: SchemaCompilerOptions);
    /**
     * Add a schema with an $id for reference
     */
    addSchema(id: string, schema: any): void;
    /**
     * Get a registered schema by id
     */
    getSchema(id: string): any | undefined;
    /**
     * Remove a schema by id
     */
    removeSchema(id: string): boolean;
    /**
     * Compile a schema into a validation function
     */
    compile(schema: any): ValidateFunction;
    /**
     * Compile a schema by its registered id
     */
    compileById(id: string): ValidateFunction;
    /**
     * Validate data against a schema
     */
    validate(schema: any, data: unknown): any;
    /**
     * Validate data against a registered schema by id
     */
    validateById(id: string, data: unknown): any;
    /**
     * Check if data is valid without throwing
     */
    isValid(schema: any, data: unknown): boolean;
    /**
     * Check if data is valid against a registered schema
     */
    isValidById(id: string, data: unknown): boolean;
    /**
     * Get validation errors without throwing
     */
    getErrors(schema: any, data: unknown): ErrorObject[] | null;
    /**
     * Clear all cached validators and schemas
     */
    clear(): void;
    /**
     * Add a custom format validator
     */
    addFormat(name: string, format: string | RegExp | ((data: string) => boolean)): void;
    /**
     * Add a custom keyword
     */
    addKeyword(keyword: string, definition: any): void;
}
export declare const schemaCompiler: SchemaCompiler;
//# sourceMappingURL=schema-compiler.d.ts.map