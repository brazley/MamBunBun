/**
 * Ogelfy AI — Error Hierarchy
 *
 * Provides structured error types for AI API failures with proper HTTP semantics.
 * These errors are handled automatically by Ogelfy's error handler and map to
 * the correct status codes, error codes, and Retry-After headers.
 *
 * Usage:
 *   throw new AIRateLimitError('Rate limit exceeded', { retryAfter: 60 });
 *   throw new AIContextWindowError('Input too long', { maxTokens: 200000, actualTokens: 250000 });
 */

export interface AIErrorDetails {
  provider?: string;       // 'anthropic' | 'openai' | 'google' | ...
  model?: string;
  requestId?: string;      // upstream request ID for debugging
  [key: string]: any;
}

/**
 * Base class for all AI-related errors.
 */
export class AIError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: AIErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: AIErrorDetails) {
    super(message);
    this.name = 'AIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * 429 — Rate limit hit on upstream AI provider.
 * Includes Retry-After guidance when available.
 */
export class AIRateLimitError extends AIError {
  readonly retryAfter?: number; // seconds

  constructor(message = 'AI rate limit exceeded', options?: { retryAfter?: number } & AIErrorDetails) {
    const { retryAfter, ...details } = options ?? {};
    super(429, 'AI_RATE_LIMIT', message, Object.keys(details).length ? details : undefined);
    this.name = 'AIRateLimitError';
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.retryAfter !== undefined && { retryAfter: this.retryAfter }),
    };
  }
}

/**
 * 400 — Input exceeds the model's context window.
 */
export class AIContextWindowError extends AIError {
  readonly maxTokens?: number;
  readonly actualTokens?: number;

  constructor(
    message = 'Input exceeds context window',
    options?: { maxTokens?: number; actualTokens?: number } & AIErrorDetails
  ) {
    const { maxTokens, actualTokens, ...details } = options ?? {};
    super(400, 'AI_CONTEXT_WINDOW', message, Object.keys(details).length ? details : undefined);
    this.name = 'AIContextWindowError';
    this.maxTokens = maxTokens;
    this.actualTokens = actualTokens;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.maxTokens !== undefined && { maxTokens: this.maxTokens }),
      ...(this.actualTokens !== undefined && { actualTokens: this.actualTokens }),
    };
  }
}

/**
 * 422 — Content policy violation (input or output blocked by the provider).
 */
export class AIContentPolicyError extends AIError {
  constructor(message = 'Content blocked by AI provider policy', details?: AIErrorDetails) {
    super(422, 'AI_CONTENT_POLICY', message, details);
    this.name = 'AIContentPolicyError';
  }
}

/**
 * 503 — AI provider is temporarily unavailable.
 */
export class AIServiceUnavailableError extends AIError {
  readonly retryAfter?: number;

  constructor(
    message = 'AI provider temporarily unavailable',
    options?: { retryAfter?: number } & AIErrorDetails
  ) {
    const { retryAfter, ...details } = options ?? {};
    super(503, 'AI_SERVICE_UNAVAILABLE', message, Object.keys(details).length ? details : undefined);
    this.name = 'AIServiceUnavailableError';
    this.retryAfter = retryAfter;
  }
}

/**
 * 400 — Malformed or invalid prompt/message structure.
 */
export class AIInvalidRequestError extends AIError {
  constructor(message = 'Invalid AI request', details?: AIErrorDetails) {
    super(400, 'AI_INVALID_REQUEST', message, details);
    this.name = 'AIInvalidRequestError';
  }
}

/**
 * 402 — Billing/quota issue with AI provider account.
 */
export class AIQuotaExceededError extends AIError {
  constructor(message = 'AI provider quota exceeded', details?: AIErrorDetails) {
    super(402, 'AI_QUOTA_EXCEEDED', message, details);
    this.name = 'AIQuotaExceededError';
  }
}

/**
 * Converts AI errors to proper HTTP responses including Retry-After headers.
 * Register this as a custom error handler in Ogelfy to get proper AI error responses.
 *
 * Usage:
 *   app.setErrorHandler(aiErrorHandler);
 */
export function aiErrorHandler(error: Error, _req: Request): Response {
  if (error instanceof AIError) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add Retry-After header for rate limit and service unavailable errors
    if (
      (error instanceof AIRateLimitError || error instanceof AIServiceUnavailableError) &&
      error.retryAfter !== undefined
    ) {
      headers['Retry-After'] = String(error.retryAfter);
    }

    return new Response(JSON.stringify(error.toJSON()), {
      status: error.statusCode,
      headers,
    });
  }

  // Fall through for non-AI errors
  return new Response(
    JSON.stringify({ error: 'Internal Server Error', statusCode: 500 }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Map common AI provider HTTP status codes to Ogelfy AI errors.
 * Useful when wrapping fetch() calls to AI APIs.
 *
 * Usage:
 *   const res = await fetch(anthropicUrl, { ... });
 *   if (!res.ok) throw mapProviderError(res.status, await res.json(), 'anthropic');
 */
export function mapProviderError(
  statusCode: number,
  body: any,
  provider?: string
): AIError {
  const message = body?.error?.message ?? body?.message ?? 'AI provider error';
  const details: AIErrorDetails = { provider, requestId: body?.request_id ?? body?.id };

  switch (statusCode) {
    case 429:
      return new AIRateLimitError(message, {
        ...details,
        retryAfter: Number(body?.retry_after ?? body?.error?.retry_after) || undefined,
      });
    case 400:
      if (message.toLowerCase().includes('context') || message.toLowerCase().includes('token')) {
        return new AIContextWindowError(message, details);
      }
      return new AIInvalidRequestError(message, details);
    case 402:
      return new AIQuotaExceededError(message, details);
    case 422:
      return new AIContentPolicyError(message, details);
    case 503:
    case 529: // Anthropic's overloaded code
      return new AIServiceUnavailableError(message, details);
    default:
      return new AIError(statusCode >= 500 ? 503 : statusCode, 'AI_ERROR', message, details);
  }
}
