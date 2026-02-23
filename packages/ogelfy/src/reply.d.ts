export interface CookieOptions {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: 'strict' | 'lax' | 'none';
    secure?: boolean;
}
export declare class Reply {
    private _statusCode;
    private _headers;
    code(statusCode: number): this;
    status(statusCode: number): this;
    header(key: string, value: string): this;
    headers(headers: Record<string, string>): this;
    type(contentType: string): this;
    redirect(url: string): Response;
    redirect(statusCode: number, url: string): Response;
    setCookie(name: string, value: string, options?: CookieOptions): this;
    clearCookie(name: string, options?: CookieOptions): this;
    send(payload: any): Response;
    private serializeCookie;
}
//# sourceMappingURL=reply.d.ts.map