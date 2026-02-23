import type { HookHandler, RouteHooks, Reply } from './hooks';
import type { Logger } from 'pino';
import type { OgelfyRequest } from './request';

export interface RouteHandler {
  (request: OgelfyRequest, reply: Reply): Promise<any> | any;
}

export interface RouteContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  cookies: Record<string, string>;
  ip: string;
  hostname: string;
  protocol: string;
  log: Logger;
  requestId: string;
}

export interface RouteConstraints {
  host?: string | string[];
  version?: string;
  [key: string]: any;
}

export interface RouteSchema {
  body?: any;
  querystring?: any;
  params?: any;
  headers?: any;
  response?: {
    [statusCode: string]: any;
  };
}

export interface RouteOptions {
  constraints?: RouteConstraints;
  schema?: RouteSchema;
  hooks?: RouteHooks; // Add lifecycle hooks to route options
}

export type RouteHandlerOrOptions = RouteHandler | RouteOptions;

export interface OgelfyOptions {
  logger?: {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    prettyPrint?: boolean;
    redact?: string[];
  };
  bodyLimit?: number; // Default: 1MB (1048576 bytes)
  fileSizeLimit?: number; // Default: 10MB (10485760 bytes)
  requestTimeout?: number; // Global request timeout in ms
  schemaCompiler?: {
    coerceTypes?: boolean;
    removeAdditional?: boolean | 'all' | 'failing';
    useDefaults?: boolean;
    strict?: boolean;
  };
}

export interface OgelfyPlugin {
  (app: any, options?: any): void | Promise<void>;
}

export interface PluginOptions {
  name?: string;
  version?: string;
  dependencies?: string[];
  ogelfy?: string;
  encapsulate?: boolean;
  prefix?: string;
}

export interface RouteChain {
  get(handler: RouteHandler): RouteChain;
  post(handler: RouteHandler): RouteChain;
  put(handler: RouteHandler): RouteChain;
  delete(handler: RouteHandler): RouteChain;
  patch(handler: RouteHandler): RouteChain;
  options(handler: RouteHandler): RouteChain;
  head(handler: RouteHandler): RouteChain;
  all(handler: RouteHandler): RouteChain;
}

export interface RouteDefinition {
  method: string | string[];
  url: string | RegExp;
  handler: RouteHandler;
  schema?: RouteSchema;
  hooks?: RouteHooks;
  constraints?: RouteConstraints;
}
