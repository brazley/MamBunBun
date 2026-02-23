/**
 * Ogelfy AI — AI-native primitives for building LLM products
 *
 * Import:
 *   import { createSSEResponse, AIRateLimitError, idempotencyPlugin, tokenBudgetPlugin } from 'ogelfy/ai';
 *   // or
 *   import { ... } from '../../packages/ogelfy/src/ai';
 */

export { createSSEResponse, formatSSEEvent, toSSEDataStream, type SSEEvent } from './sse';
export {
  AIError,
  AIRateLimitError,
  AIContextWindowError,
  AIContentPolicyError,
  AIServiceUnavailableError,
  AIInvalidRequestError,
  AIQuotaExceededError,
  aiErrorHandler,
  mapProviderError,
  type AIErrorDetails,
} from './errors';
export {
  idempotencyPlugin,
  MemoryIdempotencyStore,
  type IdempotencyOptions,
  type IdempotencyStore,
} from './idempotency';
export {
  tokenBudgetPlugin,
  extractAnthropicUsage,
  extractOpenAIUsage,
  type TokenUsage,
  type TokenBudget,
  type TokenBudgetOptions,
} from './token-budget';
