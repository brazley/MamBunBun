/**
 * Ogelfy AI — Token Budget Middleware
 *
 * Tracks token usage per request and enforces budgets.
 * Integrates with preHandler (enforce) and onResponse (record) hooks.
 *
 * Usage:
 *   import { tokenBudgetPlugin } from './ai/token-budget';
 *
 *   app.register(tokenBudgetPlugin, {
 *     getBudget: async (req) => ({ limit: 100000, window: '1d' }),
 *     getUsage: async (userId) => currentUsage,
 *     recordUsage: async (userId, tokens) => { ... },
 *   });
 *
 * In your handler, attach usage after the AI call:
 *   req.tokenUsage = { input: 1200, output: 800, total: 2000 };
 */

import type { OgelfyRequest } from '../request';
import type { OgelfyPlugin } from '../types';

export interface TokenUsage {
  input?: number;
  output?: number;
  total: number;
  model?: string;
  provider?: string;
}

export interface TokenBudget {
  limit: number;       // max tokens per window
  window: string;      // '1h' | '1d' | '30d' — informational, enforcement is external
  remaining?: number;  // if known
}

export interface TokenBudgetOptions {
  /**
   * Return the budget for this request (called in preHandler).
   * Return null to skip budget enforcement for this request.
   */
  getBudget?: (req: OgelfyRequest) => Promise<TokenBudget | null> | TokenBudget | null;

  /**
   * Return current token usage for the user/key (called in preHandler to enforce).
   * Return 0 to skip enforcement.
   */
  getUsage?: (req: OgelfyRequest) => Promise<number> | number;

  /**
   * Record usage after the request completes (called in onResponse).
   * req.tokenUsage will be populated if the handler set it.
   */
  recordUsage?: (req: OgelfyRequest, usage: TokenUsage) => Promise<void> | void;

  /**
   * Header name to read pre-declared token estimate from client.
   * Default: 'x-token-estimate'
   */
  estimateHeader?: string;
}

// Augment OgelfyRequest to include tokenUsage
declare module '../request' {
  interface OgelfyRequest {
    /** Set this in your handler after the AI call to record usage. */
    tokenUsage?: TokenUsage;
    /** The resolved budget for this request (set by plugin). */
    tokenBudget?: TokenBudget;
  }
}

export const tokenBudgetPlugin: OgelfyPlugin = async (app, options: TokenBudgetOptions = {}) => {
  const { getBudget, getUsage, recordUsage, estimateHeader = 'x-token-estimate' } = options as TokenBudgetOptions;

  if (getBudget && getUsage) {
    app.addHook('preHandler', async (hookReq: any, reply: any) => {
      const req = hookReq?.context?._ogRequest as OgelfyRequest | undefined;
      if (!req) return;

      const budget = await getBudget(req);
      if (!budget) return;

      req.tokenBudget = budget;

      const currentUsage = await getUsage(req);

      // Check estimate header — reject early if client declares it will exceed budget
      const estimate = Number(hookReq.headers.get(estimateHeader) ?? 0);
      const projectedUsage = currentUsage + estimate;

      if (budget.limit > 0 && projectedUsage > budget.limit) {
        reply.status(429);
        reply.header('X-Token-Budget-Limit', String(budget.limit));
        reply.header('X-Token-Budget-Used', String(currentUsage));
        reply.header('X-Token-Budget-Window', budget.window);
        reply.send({
          error: 'Token budget exceeded',
          code: 'TOKEN_BUDGET_EXCEEDED',
          statusCode: 429,
          budget: {
            limit: budget.limit,
            used: currentUsage,
            window: budget.window,
          },
        });
      }
    });
  }

  if (recordUsage) {
    app.addHook('onResponse', async (hookReq: any, _reply: any) => {
      const req = hookReq?.context?._ogRequest as OgelfyRequest | undefined;
      if (!req?.tokenUsage) return;

      await recordUsage(req, req.tokenUsage);
    });
  }
};

/**
 * Helper: extract token usage from Anthropic API response shape.
 */
export function extractAnthropicUsage(response: any): TokenUsage {
  const usage = response?.usage ?? {};
  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    total: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    model: response?.model,
    provider: 'anthropic',
  };
}

/**
 * Helper: extract token usage from OpenAI API response shape.
 */
export function extractOpenAIUsage(response: any): TokenUsage {
  const usage = response?.usage ?? {};
  return {
    input: usage.prompt_tokens,
    output: usage.completion_tokens,
    total: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    model: response?.model,
    provider: 'openai',
  };
}
