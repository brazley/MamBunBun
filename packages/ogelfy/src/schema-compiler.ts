import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export class ValidationError extends Error {
  public errors: ErrorObject[];

  constructor(errors: ErrorObject[]) {
    const message = ValidationError.formatErrors(errors);
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }

  private static formatErrors(errors: ErrorObject[]): string {
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

export interface SchemaCompilerOptions {
  coerceTypes?: boolean;
  removeAdditional?: boolean | 'all' | 'failing';
  useDefaults?: boolean;
  strict?: boolean;
}

/**
 * Custom validator compiler: given a JSON Schema, returns a function that
 * validates data and returns { valid, errors }.
 */
export type ValidatorCompiler = (schema: any) => (data: any) => { valid: boolean; errors?: any[] };

/**
 * Custom error formatter: given AJV errors and the data variable name,
 * returns a human-readable error message string.
 */
export type SchemaErrorFormatter = (errors: any[], dataVar: string) => string;

export class SchemaCompiler {
  private ajv: Ajv;
  private schemas: Map<string, any>;
  private compiledValidators: Map<string, ValidateFunction>;
  private _customCompiler?: ValidatorCompiler;
  private _errorFormatter?: SchemaErrorFormatter;

  constructor(options: SchemaCompilerOptions = {}) {
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
    } catch (error) {
      // Silently fail if ajv-formats doesn't work
      // Users can still add custom formats via addFormat() method
    }

    this.schemas = new Map();
    this.compiledValidators = new Map();
  }

  /**
   * Add a schema with an $id for reference
   */
  addSchema(id: string, schema: any): void {
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
  getSchema(id: string): any | undefined {
    return this.schemas.get(id);
  }

  /**
   * Remove a schema by id
   */
  removeSchema(id: string): boolean {
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
  compile(schema: any): ValidateFunction {
    // Check if schema has an $id and is already compiled
    if (schema.$id && this.compiledValidators.has(schema.$id)) {
      return this.compiledValidators.get(schema.$id)!;
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
  compileById(id: string): ValidateFunction {
    if (!this.schemas.has(id)) {
      throw new Error(`Schema with id "${id}" not found`);
    }

    if (this.compiledValidators.has(id)) {
      return this.compiledValidators.get(id)!;
    }

    const schema = this.schemas.get(id)!;
    const validate = this.ajv.compile(schema);
    this.compiledValidators.set(id, validate);

    return validate;
  }

  /**
   * Swap in a custom validator compiler.
   * When set, validate() uses this instead of AJV for compilation.
   */
  setCompiler(fn: ValidatorCompiler): void {
    this._customCompiler = fn;
  }

  /**
   * Swap in a custom error formatter.
   * When set, ValidationError messages are produced by this function.
   */
  setErrorFormatter(fn: SchemaErrorFormatter): void {
    this._errorFormatter = fn;
  }

  /**
   * Validate data against a schema
   */
  validate(schema: any, data: unknown): any {
    if (this._customCompiler) {
      const validateFn = this._customCompiler(schema);
      const result = validateFn(data);
      if (!result.valid) {
        const errors = result.errors ?? [];
        if (this._errorFormatter) {
          throw new Error(this._errorFormatter(errors, 'data'));
        }
        throw new ValidationError(errors as any[]);
      }
      return data;
    }

    const validate = this.compile(schema);
    const valid = validate(data);

    if (!valid && validate.errors) {
      if (this._errorFormatter) {
        throw new Error(this._errorFormatter(validate.errors, 'data'));
      }
      throw new ValidationError(validate.errors);
    }

    return data;
  }

  /**
   * Validate data against a registered schema by id
   */
  validateById(id: string, data: unknown): any {
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
  isValid(schema: any, data: unknown): boolean {
    const validate = this.compile(schema);
    return validate(data);
  }

  /**
   * Check if data is valid against a registered schema
   */
  isValidById(id: string, data: unknown): boolean {
    const validate = this.compileById(id);
    return validate(data);
  }

  /**
   * Get validation errors without throwing
   */
  getErrors(schema: any, data: unknown): ErrorObject[] | null {
    const validate = this.compile(schema);
    validate(data);
    return validate.errors || null;
  }

  /**
   * Clear all cached validators and schemas
   */
  clear(): void {
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
    } catch (error) {
      // Silently fail if ajv-formats doesn't work
    }
  }

  /**
   * Add a custom format validator
   */
  addFormat(name: string, format: string | RegExp | ((data: string) => boolean)): void {
    this.ajv.addFormat(name, format);
  }

  /**
   * Add a custom keyword
   */
  addKeyword(keyword: string, definition: any): void {
    this.ajv.addKeyword(keyword, definition);
  }
}

// Export a singleton instance for convenience
export const schemaCompiler = new SchemaCompiler();
