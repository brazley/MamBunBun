import pino, { Logger } from 'pino';

export interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyPrint?: boolean;
  redact?: string[];
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const config: any = {
    level: options.level || 'info',
    redact: options.redact || [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'secret'
    ]
  };

  if (options.prettyPrint) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    };
  }

  return pino(config);
}

/**
 * Create a child logger for a single request.
 *
 * @param baseLogger - Root pino logger
 * @param req        - Incoming request
 * @param pathname   - Pre-extracted pathname (avoids a second new URL() allocation
 *                     when the caller already parsed the URL). When omitted the
 *                     function falls back to new URL() for backwards compatibility.
 */
export function createRequestLogger(baseLogger: Logger, req: Request, pathname?: string): Logger {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const path = pathname ?? new URL(req.url).pathname;

  return baseLogger.child({
    requestId,
    method: req.method,
    path,
  });
}
