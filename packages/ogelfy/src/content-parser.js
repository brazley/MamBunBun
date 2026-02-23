import busboy from '@fastify/busboy';
export class PayloadTooLargeError extends Error {
    statusCode = 413;
    constructor(actual, limit) {
        super(`Payload too large: ${actual} bytes (limit: ${limit})`);
        this.name = 'PayloadTooLargeError';
    }
}
export class UnsupportedMediaTypeError extends Error {
    statusCode = 415;
    constructor(contentType) {
        super(`Unsupported media type: ${contentType}`);
        this.name = 'UnsupportedMediaTypeError';
    }
}
export class ContentTypeParser {
    parsers = new Map();
    bodyLimit;
    fileSizeLimit;
    constructor(options) {
        this.bodyLimit = options?.bodyLimit || 1048576; // 1MB default
        this.fileSizeLimit = options?.fileSizeLimit || 10485760; // 10MB default for files
        // Built-in parsers
        this.add('application/json', this.parseJSON.bind(this));
        this.add('application/x-www-form-urlencoded', this.parseURLEncoded.bind(this));
        this.add('text/plain', this.parseText.bind(this));
        this.add('application/octet-stream', this.parseBinary.bind(this));
        this.add('multipart/form-data', this.parseMultipart.bind(this));
    }
    /**
     * Add a custom content-type parser
     */
    add(contentType, parser) {
        this.parsers.set(contentType.toLowerCase(), parser);
    }
    /**
     * Remove a content-type parser
     */
    remove(contentType) {
        return this.parsers.delete(contentType.toLowerCase());
    }
    /**
     * Check if a parser exists for a content-type
     */
    has(contentType) {
        return this.parsers.has(contentType.toLowerCase());
    }
    /**
     * Get body limit
     */
    getBodyLimit() {
        return this.bodyLimit;
    }
    /**
     * Set body limit
     */
    setBodyLimit(limit) {
        this.bodyLimit = limit;
    }
    /**
     * Parse request body based on Content-Type header
     */
    async parse(req) {
        // Check content-length against body limit
        const contentLength = parseInt(req.headers.get('content-length') || '0');
        if (contentLength > this.bodyLimit) {
            throw new PayloadTooLargeError(contentLength, this.bodyLimit);
        }
        // No content-type means no body
        const contentTypeHeader = req.headers.get('content-type');
        if (!contentTypeHeader) {
            return null;
        }
        // Extract base content-type (without charset, boundary, etc.)
        const contentType = contentTypeHeader.split(';')[0].trim().toLowerCase();
        // Find parser
        const parser = this.parsers.get(contentType);
        if (!parser) {
            throw new UnsupportedMediaTypeError(contentType);
        }
        // Parse body
        try {
            return await parser(req, req.body);
        }
        catch (error) {
            if (error instanceof PayloadTooLargeError || error instanceof UnsupportedMediaTypeError) {
                throw error;
            }
            throw new Error(`Failed to parse ${contentType}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Parse JSON body
     */
    async parseJSON(req) {
        try {
            return await req.json();
        }
        catch (error) {
            throw new Error('Invalid JSON');
        }
    }
    /**
     * Parse URL-encoded form body
     */
    async parseURLEncoded(req) {
        try {
            const text = await req.text();
            const params = new URLSearchParams(text);
            const result = {};
            for (const [key, value] of params.entries()) {
                result[key] = value;
            }
            return result;
        }
        catch (error) {
            throw new Error('Invalid URL-encoded data');
        }
    }
    /**
     * Parse plain text body
     */
    async parseText(req) {
        try {
            return await req.text();
        }
        catch (error) {
            throw new Error('Invalid text data');
        }
    }
    /**
     * Parse binary/octet-stream body
     */
    async parseBinary(req) {
        try {
            return await req.arrayBuffer();
        }
        catch (error) {
            throw new Error('Invalid binary data');
        }
    }
    /**
     * Parse multipart/form-data body using @fastify/busboy
     */
    async parseMultipart(req) {
        return new Promise((resolve, reject) => {
            const bb = busboy({
                headers: Object.fromEntries(req.headers),
                limits: {
                    fileSize: this.fileSizeLimit,
                    files: 10, // Max 10 files
                    fields: 50, // Max 50 fields
                }
            });
            const fields = {};
            const files = [];
            const fileBuffers = new Map();
            bb.on('file', (fieldname, file, info) => {
                const fileIndex = files.length;
                const chunks = [];
                fileBuffers.set(fileIndex, chunks);
                files.push({
                    fieldname,
                    filename: info.filename || 'unnamed',
                    encoding: info.encoding || '7bit',
                    mimetype: info.mimeType || 'application/octet-stream',
                    data: new Uint8Array(0) // Placeholder, will be filled later
                });
                file.on('data', (chunk) => {
                    chunks.push(new Uint8Array(chunk));
                });
                file.on('end', () => {
                    // Concatenate all chunks
                    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    const combined = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }
                    files[fileIndex].data = combined;
                });
                file.on('limit', () => {
                    reject(new PayloadTooLargeError(this.fileSizeLimit, this.fileSizeLimit));
                });
            });
            bb.on('field', (fieldname, value) => {
                fields[fieldname] = value;
            });
            bb.on('finish', () => {
                resolve({ fields, files });
            });
            bb.on('error', (error) => {
                reject(error);
            });
            // Pipe request body to busboy
            const reader = req.body?.getReader();
            if (!reader) {
                reject(new Error('No request body'));
                return;
            }
            (async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            bb.end();
                            break;
                        }
                        bb.write(Buffer.from(value));
                    }
                }
                catch (err) {
                    reject(err);
                }
            })();
        });
    }
}
// Export a singleton instance
export const contentParser = new ContentTypeParser();
/**
 * Helper to parse multipart files as an async generator
 */
export async function* parseMultipartFiles(req) {
    const parser = new ContentTypeParser();
    const data = await parser.parse(req);
    if (data && data.files) {
        for (const file of data.files) {
            yield file;
        }
    }
}
//# sourceMappingURL=content-parser.js.map