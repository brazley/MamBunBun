import type { Server } from 'bun';
import { Router } from './router';
import type { RouteHandler, OgelfyOptions, OgelfyPlugin, RouteContext, RouteOptions, RouteChain } from './types';
import {
  ErrorHandling,
  httpErrors,
  HttpError,
  ValidationError,
  type ErrorHandler,
  type NotFoundHandler
} from './error-handler';
import { Testing } from './testing';
import { ContentTypeParser } from './content-parser';
import { Serializer } from './serializer';
import { SchemaCompiler, ValidationError as SchemaValidationError } from './schema-compiler';

export class Ogelfy {
  private router: Router;
  private plugins: OgelfyPlugin[] = [];
  private server?: Server;
  private errorHandling: ErrorHandling;
  private testing: Testing;
  private contentParser: ContentTypeParser;
  private serializer: Serializer;
  private schemaCompiler: SchemaCompiler;

  /**
   * HTTP error factory methods
   */
  public httpErrors = httpErrors;

  constructor(options?: OgelfyOptions) {
    this.schemaCompiler = new SchemaCompiler(options?.schemaCompiler || {});
    this.router = new Router(this.schemaCompiler);
    this.errorHandling = new ErrorHandling();
    this.contentParser = new ContentTypeParser({
      bodyLimit: options?.bodyLimit,
      fileSizeLimit: options?.fileSizeLimit
    });
    this.serializer = new Serializer();

    // Testing needs access to error handling
    this.testing = new Testing(this.router, this.errorHandling);
  }

  /**
   * Add a custom content-type parser
   */
  addContentTypeParser(contentType: string, parser: (req: Request) => Promise<any>): void {
    this.contentParser.add(contentType, parser);
  }

  /**
   * Remove a content-type parser
   */
  removeContentTypeParser(contentType: string): boolean {
    return this.contentParser.remove(contentType);
  }

  /**
   * Register a route with optional options (supports schemas and constraints)
   */
  private addRoute(
    method: string,
    path: string | RegExp,
    handlerOrOptions: RouteHandler | RouteOptions,
    maybeHandler?: RouteHandler
  ): void {
    let handler: RouteHandler;
    let options: RouteOptions | undefined;

    if (typeof handlerOrOptions === 'function') {
      handler = handlerOrOptions;
      options = undefined;
    } else {
      if (!maybeHandler) {
        throw new Error('Handler is required when options are provided');
      }
      options = handlerOrOptions;
      handler = maybeHandler;
    }

    this.router.add(method, path, handler, options);
  }

  get(path: string | RegExp, handler: RouteHandler): void;
  get(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  get(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('GET', path, handlerOrOptions, maybeHandler);
  }

  post(path: string | RegExp, handler: RouteHandler): void;
  post(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  post(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('POST', path, handlerOrOptions, maybeHandler);
  }

  put(path: string | RegExp, handler: RouteHandler): void;
  put(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  put(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('PUT', path, handlerOrOptions, maybeHandler);
  }

  delete(path: string | RegExp, handler: RouteHandler): void;
  delete(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  delete(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('DELETE', path, handlerOrOptions, maybeHandler);
  }

  patch(path: string | RegExp, handler: RouteHandler): void;
  patch(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  patch(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('PATCH', path, handlerOrOptions, maybeHandler);
  }

  options(path: string | RegExp, handler: RouteHandler): void;
  options(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  options(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('OPTIONS', path, handlerOrOptions, maybeHandler);
  }

  head(path: string | RegExp, handler: RouteHandler): void;
  head(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  head(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('HEAD', path, handlerOrOptions, maybeHandler);
  }

  /**
   * ALL methods route
   */
  all(path: string | RegExp, handler: RouteHandler): void;
  all(path: string | RegExp, options: RouteOptions, handler: RouteHandler): void;
  all(path: string | RegExp, handlerOrOptions: RouteHandler | RouteOptions, maybeHandler?: RouteHandler): void {
    this.addRoute('ALL', path, handlerOrOptions, maybeHandler);
  }

  /**
   * Route chaining API
   */
  route(path: string): RouteChain {
    const self = this;
    return {
      get(handler: RouteHandler) {
        self.get(path, handler);
        return this;
      },
      post(handler: RouteHandler) {
        self.post(path, handler);
        return this;
      },
      put(handler: RouteHandler) {
        self.put(path, handler);
        return this;
      },
      delete(handler: RouteHandler) {
        self.delete(path, handler);
        return this;
      },
      patch(handler: RouteHandler) {
        self.patch(path, handler);
        return this;
      },
      options(handler: RouteHandler) {
        self.options(path, handler);
        return this;
      },
      head(handler: RouteHandler) {
        self.head(path, handler);
        return this;
      },
      all(handler: RouteHandler) {
        self.all(path, handler);
        return this;
      },
    };
  }

  register(plugin: OgelfyPlugin, options?: any) {
    this.plugins.push(plugin);
  }

  /**
   * Add a shared JSON schema
   */
  addSchema(id: string, schema: any): void {
    this.schemaCompiler.addSchema(id, schema);
  }

  /**
   * Get the schema compiler instance
   */
  getSchemaCompiler(): SchemaCompiler {
    return this.schemaCompiler;
  }

  /**
   * Set custom error handler
   */
  setErrorHandler(handler: ErrorHandler): void {
    this.errorHandling.setErrorHandler(handler);
  }

  /**
   * Set custom 404 handler
   */
  setNotFoundHandler(handler: NotFoundHandler): void {
    this.errorHandling.setNotFoundHandler(handler);
  }

  /**
   * Inject request for testing (no HTTP server needed)
   */
  async inject(options: any) {
    return this.testing.inject(options);
  }

  async listen(options: { port: number; hostname?: string }): Promise<Server> {
    this.server = Bun.serve({
      port: options.port,
      hostname: options.hostname || 'localhost',
      fetch: async (req) => {
        const url = new URL(req.url);
        const route = this.router.find(req.method, url.pathname, req);

        if (!route) {
          return this.errorHandling.handleNotFound(req);
        }

        try {
          // Parse query parameters
          const query: Record<string, string> = {};
          url.searchParams.forEach((value, key) => {
            query[key] = value;
          });

          // Parse request body for non-GET/HEAD requests
          let body: any = null;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            try {
              body = await this.contentParser.parse(req);
            } catch (error) {
              // Content parsing error - return 400 Bad Request
              return new Response(
                JSON.stringify({
                  error: 'Bad Request',
                  message: error instanceof Error ? error.message : String(error)
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            }
          }

          // Create route context
          const context: RouteContext = {
            params: route.params,
            query,
            body
          };

          // Validate request if schema exists
          if (route.schema) {
            await this.router.validateRequest(req, route.schema, context);
          }

          // Execute handler with context (context contains params, query, body)
          const result = await route.handler(req, context);

          // If handler returns Response, use it directly
          if (result instanceof Response) {
            return result;
          }

          // Determine status code
          let statusCode = 200;
          let responseData = result;

          // Handle status code in result
          if (result && typeof result === 'object' && 'statusCode' in result) {
            statusCode = result.statusCode;
            responseData = result.data || result;
          }

          // Validate response if schema exists
          if (route.schema?.response) {
            responseData = this.router.validateResponse(route.schema, statusCode, responseData);
          }

          // Serialize response using fast serialization
          const responseBody = typeof responseData === 'string'
            ? responseData
            : this.serializer.serialize(responseData);

          return new Response(responseBody, {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          // Handle schema validation errors
          if (error instanceof SchemaValidationError) {
            return new Response(JSON.stringify(error.toJSON()), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          return this.errorHandling.handleError(error as Error, req);
        }
      }
    });

    return this.server;
  }

  async close() {
    this.server?.stop();
  }
}

// Export schema compiler
export {
  SchemaCompiler,
  ValidationError as SchemaValidationError,
  schemaCompiler
} from './schema-compiler';

// Export error handling utilities
export {
  HttpError,
  ValidationError,
  httpErrors,
  type ErrorHandler,
  type NotFoundHandler,
  createErrorResponse,
  assert,
  errorBoundary
} from './error-handler';

// Export testing utilities
export {
  Testing,
  type InjectOptions,
  type InjectResponse,
  testHelpers
} from './testing';

// Export content parsing
export {
  ContentTypeParser,
  contentParser,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  parseMultipartFiles,
  type ContentParser,
  type ParsedMultipart,
  type ContentTypeParserOptions
} from './content-parser';

// Export serialization
export {
  Serializer,
  serializer,
  createRouteSchema,
  createSchemaKey,
  createResponseSchemaKey,
  benchmark,
  Schemas,
  type SerializerSchema,
  type RouteSchema as SerializerRouteSchema
} from './serializer';

// Export existing modules
export { Router } from './router';
export type {
  RouteHandler,
  OgelfyOptions,
  OgelfyPlugin,
  RouteContext,
  RouteSchema,
  RouteOptions,
  RouteConstraints,
  RouteChain
} from './types';
export { validate } from './validation';
