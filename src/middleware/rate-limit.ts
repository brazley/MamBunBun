const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(limit: number, windowMs: number) {
  return async (req: Request) => {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();

    const record = store.get(ip);

    if (!record || now > record.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (record.count >= limit) {
      throw new Error('Rate limit exceeded');
    }

    record.count++;
  };
}
