export type ContentParser = (req: Request, payload: ReadableStream | null) => Promise<any>;
export interface ParsedMultipart {
    fields: Record<string, string>;
    files: Array<{
        fieldname: string;
        filename: string;
        encoding: string;
        mimetype: string;
        data: Uint8Array;
    }>;
}
export declare class PayloadTooLargeError extends Error {
    statusCode: number;
    constructor(actual: number, limit: number);
}
export declare class UnsupportedMediaTypeError extends Error {
    statusCode: number;
    constructor(contentType: string | null);
}
export interface ContentTypeParserOptions {
    bodyLimit?: number;
    fileSizeLimit?: number;
}
export declare class ContentTypeParser {
    private parsers;
    private bodyLimit;
    private fileSizeLimit;
    constructor(options?: ContentTypeParserOptions);
    /**
     * Add a custom content-type parser
     */
    add(contentType: string, parser: ContentParser): void;
    /**
     * Remove a content-type parser
     */
    remove(contentType: string): boolean;
    /**
     * Check if a parser exists for a content-type
     */
    has(contentType: string): boolean;
    /**
     * Get body limit
     */
    getBodyLimit(): number;
    /**
     * Set body limit
     */
    setBodyLimit(limit: number): void;
    /**
     * Parse request body based on Content-Type header
     */
    parse(req: Request): Promise<any>;
    /**
     * Parse JSON body
     */
    private parseJSON;
    /**
     * Parse URL-encoded form body
     */
    private parseURLEncoded;
    /**
     * Parse plain text body
     */
    private parseText;
    /**
     * Parse binary/octet-stream body
     */
    private parseBinary;
    /**
     * Parse multipart/form-data body using @fastify/busboy
     */
    private parseMultipart;
}
export declare const contentParser: ContentTypeParser;
/**
 * Helper to parse multipart files as an async generator
 */
export declare function parseMultipartFiles(req: Request): AsyncGenerator<any, void, unknown>;
//# sourceMappingURL=content-parser.d.ts.map