import { Logger } from 'pino';
export interface LoggerOptions {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    prettyPrint?: boolean;
    redact?: string[];
}
export declare function createLogger(options?: LoggerOptions): Logger;
export declare function createRequestLogger(baseLogger: Logger, req: Request): Logger;
//# sourceMappingURL=logger.d.ts.map