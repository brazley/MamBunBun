import type { RouteContext, RouteSchema } from './types'; // RouteSchema used by routeSchema property below
import type { Logger } from 'pino';

function parseCookies(raw: Request): Record<string, string> {
  const cookieHeader = raw.headers.get('cookie');
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  }
  return cookies;
}

export class OgelfyRequest {
  readonly raw: Request;
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly id: string;
  readonly ip: string;
  readonly hostname: string;
  readonly protocol: string;
  readonly log: Logger;

  params: Record<string, string>;
  query: Record<string, string>;
  body: any;

  // Lazy cookie backing fields — parsed only on first access
  private _rawReq: Request;
  private _cookies?: Record<string, string>;

  server?: any;           // Ogelfy instance back-ref (set after construction)
  routePath?: string;     // matched route pattern
  routeSchema?: RouteSchema; // schema attached to the matched route

  /** Alias for `id` — satisfies RouteContext.requestId for structural compatibility. */
  get requestId(): string { return this.id; }

  [key: string]: any; // allow decorators

  constructor(raw: Request, context: RouteContext) {
    this.raw = raw;
    this._rawReq = raw;
    this.method = raw.method;
    // Use pre-extracted pathname from context to avoid a new URL() allocation.
    // context.pathname is set by handleRequest() via extractPathname(); fall back
    // to a direct slice in the rare case it is absent (e.g. unit-test construction).
    this.url = (context as any).pathname ?? new URL(raw.url).pathname;
    this.headers = raw.headers;
    this.id = context.requestId;
    this.ip = context.ip;
    this.hostname = context.hostname;
    this.protocol = context.protocol;
    this.log = context.log;
    this.params = context.params;
    this.query = context.query;
    this.body = context.body;
  }

  get cookies(): Record<string, string> {
    if (!this._cookies) {
      this._cookies = parseCookies(this._rawReq);
    }
    return this._cookies;
  }

  set cookies(value: Record<string, string>) {
    this._cookies = value;
  }

  /**
   * Check whether the request's Content-Type matches one or more MIME types.
   * Returns the first matched type string, or false if none match.
   */
  is(type: string | string[]): string | false {
    const contentType = this.raw.headers.get('content-type') || '';
    const types = Array.isArray(type) ? type : [type];
    for (const t of types) {
      if (contentType.includes(t)) return t;
    }
    return false;
  }
}
