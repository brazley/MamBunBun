import FindMyWay from 'find-my-way';
import type { RouteHandler, RouteConstraints, RouteSchema, RouteContext } from './types';
import type { RouteHooks } from './hooks';
import { SchemaCompiler, ValidationError } from './schema-compiler';
import { build } from '../../quik-json-stringify/src/index';
import type { QuikSerializer } from '../../quik-json-stringify/src/index';

interface Route {
  method: string;
  pattern: string | RegExp;
  handler: RouteHandler;
  params?: string[];
  constraints?: RouteConstraints;
  schema?: RouteSchema;
  hooks?: RouteHooks;
  isWildcard?: boolean;
  isRegex?: boolean;
}

export interface MatchResult {
  handler: RouteHandler;
  params: Record<string, string>;
  schema?: RouteSchema;
  hooks?: RouteHooks;
  pattern?: string | RegExp;
  serializers?: Record<string, QuikSerializer>;
}

/** Metadata stored in the find-my-way trie per route. */
interface RouteStore {
  handler: RouteHandler;
  schema?: RouteSchema;
  hooks?: RouteHooks;
  pattern: string; // original string pattern — used by find() to populate MatchResult.pattern
  serializers?: Record<string, QuikSerializer>;
}

/**
 * Compile response schemas into QuikSerializer instances, one per status code.
 * Falls back gracefully — if a particular schema fails to compile, it is
 * simply omitted and the caller falls back to JSON.stringify for that code.
 */
function buildSerializers(schema?: RouteSchema): Record<string, QuikSerializer> | undefined {
  if (!schema?.response) return undefined;

  const serializers: Record<string, QuikSerializer> = {};
  for (const [statusCode, responseSchema] of Object.entries(schema.response)) {
    try {
      serializers[statusCode] = build(responseSchema);
    } catch {
      // skip — JSON.stringify fallback for this status code
    }
  }

  return Object.keys(serializers).length > 0 ? serializers : undefined;
}

/**
 * find-my-way only accepts its own HTTPMethod union. These are the methods
 * we register when a route uses the 'ALL' pseudo-method.
 */
const HTTP_METHODS = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD',
] as const satisfies FindMyWay.HTTPMethod[];

/**
 * Noop handler required by find-my-way's .on() signature.
 * Actual handler is stored in the route store object.
 */
const NOOP: FindMyWay.Handler<FindMyWay.HTTPVersion.V1> = () => {};

export class Router {
  private trie: FindMyWay.Instance<FindMyWay.HTTPVersion.V1>;
  private regexRoutes: Route[] = [];
  private allRoutes: Route[] = [];
  private schemaCompiler: SchemaCompiler;

  constructor(schemaCompiler: SchemaCompiler) {
    this.schemaCompiler = schemaCompiler;
    this.trie = FindMyWay({ ignoreTrailingSlash: false });
  }

  /**
   * Add a route with optional constraints, schema, and hooks.
   */
  add(
    method: string,
    pattern: string | RegExp,
    handler: RouteHandler,
    options?: { constraints?: RouteConstraints; schema?: RouteSchema; hooks?: RouteHooks }
  ): void {
    if (pattern instanceof RegExp) {
      const store: RouteStore = {
        handler,
        schema: options?.schema,
        hooks: options?.hooks,
        pattern: pattern.toString(),
      };
      // Regex routes fall back to linear scan — rare path
      this.regexRoutes.push({
        method,
        pattern,
        handler,
        constraints: options?.constraints,
        schema: options?.schema,
        hooks: options?.hooks,
        isRegex: true,
      });
      void store; // store not used for regex — kept for shape consistency
    } else {
      const store: RouteStore = {
        handler,
        schema: options?.schema,
        hooks: options?.hooks,
        pattern,
        serializers: buildSerializers(options?.schema),
      };

      // String pattern — register in the radix trie
      const fmwConstraints = this.buildFmwConstraints(options?.constraints);
      const routeOptions: FindMyWay.RouteOptions | undefined =
        fmwConstraints ? { constraints: fmwConstraints } : undefined;

      const methodsToRegister =
        method === 'ALL' ? HTTP_METHODS : ([method] as FindMyWay.HTTPMethod[]);

      for (const m of methodsToRegister) {
        if (routeOptions) {
          this.trie.on(m, pattern, routeOptions, NOOP, store);
        } else {
          this.trie.on(m, pattern, NOOP, store);
        }
      }

      // Auto-register HEAD for GET string routes (Fastify parity)
      // Only when 'GET' is explicitly the method — not via 'ALL' expansion.
      if (method === 'GET') {
        const headStore: RouteStore = { ...store };
        if (routeOptions) {
          this.trie.on('HEAD', pattern, routeOptions, NOOP, headStore);
        } else {
          this.trie.on('HEAD', pattern, NOOP, headStore);
        }
      }
    }

    // Keep a full snapshot of all routes for getRoutes()
    const isWildcard = typeof pattern === 'string' && pattern.includes('*');
    this.allRoutes.push({
      method,
      pattern,
      handler,
      params: typeof pattern === 'string' && !isWildcard
        ? this.extractParams(pattern)
        : [],
      constraints: options?.constraints,
      schema: options?.schema,
      hooks: options?.hooks,
      isWildcard,
      isRegex: pattern instanceof RegExp,
    });
  }

  /**
   * Find a matching route and return handler with params.
   * Checks the radix trie first, then falls back to regex routes.
   */
  find(method: string, path: string, req?: Request): MatchResult | null {
    // --- Trie lookup (string patterns) ---
    const trieMethod = method as FindMyWay.HTTPMethod;

    // Handle 'ALL' — try each registered HTTP method until one matches
    const methodsToTry: FindMyWay.HTTPMethod[] =
      method === 'ALL' ? HTTP_METHODS : [trieMethod];

    for (const m of methodsToTry) {
      const fmwConstraints = req ? this.buildConstraintsFromRequest(req) : undefined;
      const match = fmwConstraints
        ? this.trie.find(m, path, fmwConstraints)
        : this.trie.find(m, path);

      if (match) {
        const store = match.store as RouteStore;
        // Normalize params: strip undefined values (unmatched optional segments)
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(match.params)) {
          if (v !== undefined) {
            params[k] = v;
          }
        }
        return {
          handler: store.handler,
          params,
          schema: store.schema,
          hooks: store.hooks,
          pattern: store.pattern,
          serializers: store.serializers,
        };
      }
    }

    // --- Regex fallback (linear scan — rare path) ---
    for (const route of this.regexRoutes) {
      if (route.method !== method && route.method !== 'ALL') continue;

      if (route.constraints && req) {
        if (!this.matchConstraints(route.constraints, req)) continue;
      }

      if (route.isRegex && route.pattern instanceof RegExp) {
        const params = this.matchRegex(route.pattern, path);
        if (params !== null) {
          return {
            handler: route.handler,
            params,
            schema: route.schema,
            hooks: route.hooks,
            pattern: route.pattern,
          };
        }
      }
    }

    return null;
  }

  /**
   * Validate request against route schema.
   */
  async validateRequest(
    req: Request,
    schema: RouteSchema,
    context: RouteContext
  ): Promise<void> {
    // Validate params
    if (schema.params) {
      try {
        this.schemaCompiler.validate(schema.params, context.params);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError([
            {
              instancePath: '/params',
              schemaPath: '#/params',
              keyword: 'params',
              params: {},
              message: 'Parameter validation failed',
            },
            ...error.errors,
          ]);
        }
        throw error;
      }
    }

    // Validate querystring
    if (schema.querystring) {
      try {
        this.schemaCompiler.validate(schema.querystring, context.query);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError([
            {
              instancePath: '/querystring',
              schemaPath: '#/querystring',
              keyword: 'querystring',
              params: {},
              message: 'Query string validation failed',
            },
            ...error.errors,
          ]);
        }
        throw error;
      }
    }

    // Validate body
    if (schema.body && context.body !== undefined) {
      try {
        context.body = this.schemaCompiler.validate(schema.body, context.body);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError([
            {
              instancePath: '/body',
              schemaPath: '#/body',
              keyword: 'body',
              params: {},
              message: 'Request body validation failed',
            },
            ...error.errors,
          ]);
        }
        throw error;
      }
    }

    // Validate headers
    if (schema.headers) {
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      try {
        this.schemaCompiler.validate(schema.headers, headers);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError([
            {
              instancePath: '/headers',
              schemaPath: '#/headers',
              keyword: 'headers',
              params: {},
              message: 'Header validation failed',
            },
            ...error.errors,
          ]);
        }
        throw error;
      }
    }
  }

  /**
   * Validate response against schema.
   */
  validateResponse(schema: RouteSchema, statusCode: number, data: any): any {
    if (!schema.response) {
      return data;
    }

    const responseSchema = schema.response[String(statusCode)];
    if (!responseSchema) {
      return data;
    }

    try {
      return this.schemaCompiler.validate(responseSchema, data);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError([
          {
            instancePath: '/response',
            schemaPath: '#/response',
            keyword: 'response',
            params: {},
            message: `Response validation failed for status ${statusCode}`,
          },
          ...error.errors,
        ]);
      }
      throw error;
    }
  }

  /**
   * Get all registered routes (for debugging/introspection).
   */
  getRoutes(): Route[] {
    return [...this.allRoutes];
  }

  /**
   * Return true if a route is registered for the given method + path combination.
   */
  has(method: string, path: string): boolean {
    return this.find(method, path) !== null;
  }

  /**
   * Clear all routes. Resets both the trie and the regex fallback list.
   */
  clear(): void {
    this.trie.reset();
    this.regexRoutes = [];
    this.allRoutes = [];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract parameter names from a path pattern like /users/:id/posts/:postId.
   */
  private extractParams(path: string): string[] {
    const params: string[] = [];
    for (const segment of path.split('/')) {
      if (segment.startsWith(':')) {
        params.push(segment.slice(1));
      }
    }
    return params;
  }

  /**
   * Match a regex pattern against a request path, returning a params object
   * where numbered capture groups are keyed by zero-based index strings.
   */
  private matchRegex(pattern: RegExp, path: string): Record<string, string> | null {
    const match = path.match(pattern);
    if (!match) return null;

    const params: Record<string, string> = {};
    for (let i = 1; i < match.length; i++) {
      params[String(i - 1)] = match[i];
    }
    return params;
  }

  /**
   * Build a find-my-way constraints object from RouteConstraints, keeping only
   * the fields find-my-way understands natively (host, version).
   * Custom constraint keys are handled at the application level via matchConstraints.
   */
  private buildFmwConstraints(
    constraints: RouteConstraints | undefined
  ): Record<string, any> | null {
    if (!constraints) return null;

    const fmw: Record<string, any> = {};
    if (constraints.host) {
      // find-my-way expects a single string for its host constraint
      fmw.host = Array.isArray(constraints.host)
        ? constraints.host[0]
        : constraints.host;
    }
    if (constraints.version) {
      fmw.version = constraints.version;
    }

    return Object.keys(fmw).length > 0 ? fmw : null;
  }

  /**
   * Extract constraint values from a live Request for trie lookup.
   * Uses the Host header directly instead of new URL() to avoid full URL parsing.
   * Host header format is "hostname" or "hostname:port" — strip the port.
   */
  private buildConstraintsFromRequest(req: Request): Record<string, any> | undefined {
    const result: Record<string, any> = {};
    const hostHeader = req.headers.get('host');
    if (hostHeader) {
      // Strip optional port — e.g. "example.com:8080" → "example.com"
      const colonIdx = hostHeader.indexOf(':');
      result.host = colonIdx === -1 ? hostHeader : hostHeader.slice(0, colonIdx);
    }
    const version = req.headers.get('accept-version');
    if (version) result.version = version;
    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Full constraint check used for regex routes.
   * Uses the Host header directly instead of new URL() to avoid full URL parsing.
   */
  private matchConstraints(constraints: RouteConstraints, req: Request): boolean {
    if (constraints.host) {
      const hostHeader = req.headers.get('host') ?? '';
      const colonIdx = hostHeader.indexOf(':');
      const hostname = colonIdx === -1 ? hostHeader : hostHeader.slice(0, colonIdx);
      const hosts = Array.isArray(constraints.host) ? constraints.host : [constraints.host];
      if (!hosts.includes(hostname)) return false;
    }

    if (constraints.version) {
      const acceptVersion = req.headers.get('accept-version');
      if (acceptVersion !== constraints.version) return false;
    }

    for (const [key, value] of Object.entries(constraints)) {
      if (key === 'host' || key === 'version') continue;
      const header = req.headers.get(key);
      if (header !== value) return false;
    }

    return true;
  }
}
