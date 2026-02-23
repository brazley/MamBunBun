import Ajv from 'ajv';
import addFormats from 'ajv-formats';
export class ValidationError extends Error {
    errors;
    constructor(errors) {
        const message = ValidationError.formatErrors(errors);
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
    }
    static formatErrors(errors) {
        return errors
            .map((err) => {
            const path = err.instancePath || 'root';
            return `${path}: ${err.message}`;
        })
            .join(', ');
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            errors: this.errors.map((err) => ({
                path: err.instancePath,
                message: err.message,
                params: err.params,
            })),
        };
    }
}
export class SchemaCompiler {
    ajv;
    schemas;
    compiledValidators;
    constructor(options = {}) {
        this.ajv = new Ajv({
            coerceTypes: options.coerceTypes ?? true,
            removeAdditional: options.removeAdditional ?? true,
            useDefaults: options.useDefaults ?? true,
            strict: options.strict ?? false,
            allErrors: true
        });
        // Add format validators (email, uri, date, etc.)
        // Note: ajv-formats has compatibility issues with Bun, so we skip it for now
        // The formats can be added manually if needed using addFormat()
        try {
            addFormats(this.ajv);
        }
        catch (error) {
            // Silently fail if ajv-formats doesn't work
            // Users can still add custom formats via addFormat() method
        }
        this.schemas = new Map();
        this.compiledValidators = new Map();
    }
    /**
     * Add a schema with an $id for reference
     */
    addSchema(id, schema) {
        if (this.schemas.has(id)) {
            throw new Error(`Schema with id "${id}" already exists`);
        }
        const schemaWithId = { ...schema, $id: id };
        this.schemas.set(id, schemaWithId);
        this.ajv.addSchema(schemaWithId);
    }
    /**
     * Get a registered schema by id
     */
    getSchema(id) {
        return this.schemas.get(id);
    }
    /**
     * Remove a schema by id
     */
    removeSchema(id) {
        if (!this.schemas.has(id)) {
            return false;
        }
        this.ajv.removeSchema(id);
        this.schemas.delete(id);
        this.compiledValidators.delete(id);
        return true;
    }
    /**
     * Compile a schema into a validation function
     */
    compile(schema) {
        // Check if schema has an $id and is already compiled
        if (schema.$id && this.compiledValidators.has(schema.$id)) {
            return this.compiledValidators.get(schema.$id);
        }
        const validate = this.ajv.compile(schema);
        // Cache compiled validator if schema has an $id
        if (schema.$id) {
            this.compiledValidators.set(schema.$id, validate);
        }
        return validate;
    }
    /**
     * Compile a schema by its registered id
     */
    compileById(id) {
        if (!this.schemas.has(id)) {
            throw new Error(`Schema with id "${id}" not found`);
        }
        if (this.compiledValidators.has(id)) {
            return this.compiledValidators.get(id);
        }
        const schema = this.schemas.get(id);
        const validate = this.ajv.compile(schema);
        this.compiledValidators.set(id, validate);
        return validate;
    }
    /**
     * Validate data against a schema
     */
    validate(schema, data) {
        const validate = this.compile(schema);
        const valid = validate(data);
        if (!valid && validate.errors) {
            throw new ValidationError(validate.errors);
        }
        return data;
    }
    /**
     * Validate data against a registered schema by id
     */
    validateById(id, data) {
        const validate = this.compileById(id);
        const valid = validate(data);
        if (!valid && validate.errors) {
            throw new ValidationError(validate.errors);
        }
        return data;
    }
    /**
     * Check if data is valid without throwing
     */
    isValid(schema, data) {
        const validate = this.compile(schema);
        return validate(data);
    }
    /**
     * Check if data is valid against a registered schema
     */
    isValidById(id, data) {
        const validate = this.compileById(id);
        return validate(data);
    }
    /**
     * Get validation errors without throwing
     */
    getErrors(schema, data) {
        const validate = this.compile(schema);
        validate(data);
        return validate.errors || null;
    }
    /**
     * Clear all cached validators and schemas
     */
    clear() {
        this.schemas.clear();
        this.compiledValidators.clear();
        this.ajv = new Ajv({
            coerceTypes: true,
            removeAdditional: true,
            useDefaults: true,
            strict: false,
            allErrors: true
        });
        try {
            addFormats(this.ajv);
        }
        catch (error) {
            // Silently fail if ajv-formats doesn't work
        }
    }
    /**
     * Add a custom format validator
     */
    addFormat(name, format) {
        this.ajv.addFormat(name, format);
    }
    /**
     * Add a custom keyword
     */
    addKeyword(keyword, definition) {
        this.ajv.addKeyword(keyword, definition);
    }
}
// Export a singleton instance for convenience
export const schemaCompiler = new SchemaCompiler();
//# sourceMappingURL=schema-compiler.js.map