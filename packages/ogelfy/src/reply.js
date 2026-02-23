export class Reply {
    _statusCode = 200;
    _headers = new Map();
    code(statusCode) {
        this._statusCode = statusCode;
        return this;
    }
    status(statusCode) {
        return this.code(statusCode);
    }
    header(key, value) {
        this._headers.set(key.toLowerCase(), value);
        return this;
    }
    headers(headers) {
        for (const [key, value] of Object.entries(headers)) {
            this.header(key, value);
        }
        return this;
    }
    type(contentType) {
        return this.header('content-type', contentType);
    }
    redirect(statusCodeOrUrl, url) {
        const status = typeof statusCodeOrUrl === 'number' ? statusCodeOrUrl : 302;
        const location = typeof statusCodeOrUrl === 'string' ? statusCodeOrUrl : url;
        return new Response(null, {
            status,
            headers: { location }
        });
    }
    setCookie(name, value, options) {
        const cookie = this.serializeCookie(name, value, options);
        // Handle multiple cookies
        const existing = this._headers.get('set-cookie');
        if (existing) {
            this._headers.set('set-cookie', `${existing}, ${cookie}`);
        }
        else {
            this._headers.set('set-cookie', cookie);
        }
        return this;
    }
    clearCookie(name, options) {
        return this.setCookie(name, '', { ...options, maxAge: 0 });
    }
    send(payload) {
        const headers = new Headers();
        for (const [key, value] of this._headers) {
            headers.set(key, value);
        }
        if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
        }
        const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return new Response(body, {
            status: this._statusCode,
            headers
        });
    }
    serializeCookie(name, value, options) {
        let cookie = `${name}=${encodeURIComponent(value)}`;
        if (options?.domain)
            cookie += `; Domain=${options.domain}`;
        if (options?.expires)
            cookie += `; Expires=${options.expires.toUTCString()}`;
        if (options?.httpOnly)
            cookie += `; HttpOnly`;
        if (options?.maxAge !== undefined)
            cookie += `; Max-Age=${options.maxAge}`;
        if (options?.path)
            cookie += `; Path=${options.path}`;
        if (options?.sameSite)
            cookie += `; SameSite=${options.sameSite}`;
        if (options?.secure)
            cookie += `; Secure`;
        return cookie;
    }
}
//# sourceMappingURL=reply.js.map