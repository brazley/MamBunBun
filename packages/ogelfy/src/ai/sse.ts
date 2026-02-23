/**
 * Ogelfy AI — SSE (Server-Sent Events) streaming
 *
 * Enables streaming LLM responses, live updates, and event-driven UIs.
 *
 * Usage in a handler:
 *   app.get('/chat', async (req, reply) => {
 *     return reply.sse(asyncIterableOfStrings);
 *   });
 *
 * Or with structured events:
 *   return reply.sse([
 *     { event: 'start', data: JSON.stringify({ model: 'claude-3-5-sonnet' }) },
 *     { event: 'token', data: 'Hello' },
 *     { event: 'done', data: '[DONE]' },
 *   ]);
 */

export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

/**
 * Format a single SSE event to the wire format.
 */
export function formatSSEEvent(event: SSEEvent | string): string {
  if (typeof event === 'string') {
    return `data: ${event}\n\n`;
  }

  let output = '';
  if (event.id !== undefined)    output += `id: ${event.id}\n`;
  if (event.event !== undefined)  output += `event: ${event.event}\n`;
  if (event.retry !== undefined)  output += `retry: ${event.retry}\n`;
  // Multi-line data: each line gets its own "data:" prefix
  const lines = event.data.split('\n');
  for (const line of lines) {
    output += `data: ${line}\n`;
  }
  output += '\n';
  return output;
}

/**
 * Create a streaming SSE Response from an async iterable.
 *
 * Accepts:
 * - AsyncIterable<string>                    — each string becomes a data event
 * - AsyncIterable<SSEEvent>                  — full control over event fields
 * - Iterable<string | SSEEvent>              — sync iterables too
 * - ReadableStream<string | SSEEvent>        — Bun/Web Streams API
 */
export function createSSEResponse(
  source: AsyncIterable<SSEEvent | string> | Iterable<SSEEvent | string> | ReadableStream<SSEEvent | string>,
  options?: {
    headers?: Record<string, string>;
    heartbeatMs?: number; // send a keep-alive comment every N ms (prevents proxy timeouts)
  }
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
    ...options?.headers,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

      // Optional heartbeat to prevent proxy timeouts
      if (options?.heartbeatMs) {
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            // stream may have closed
          }
        }, options.heartbeatMs);
      }

      try {
        let iterable: AsyncIterable<SSEEvent | string> | Iterable<SSEEvent | string>;

        if (source instanceof ReadableStream) {
          // Convert ReadableStream to AsyncIterable
          const reader = source.getReader();
          iterable = {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  const { done, value } = await reader.read();
                  if (done) return { done: true as const, value: undefined as unknown as SSEEvent | string };
                  return { done: false as const, value };
                },
                [Symbol.asyncIterator]() { return this; },
              };
            },
          };
        } else {
          iterable = source;
        }

        // Handle both sync and async iterables
        if (Symbol.asyncIterator in iterable) {
          for await (const event of iterable as AsyncIterable<SSEEvent | string>) {
            controller.enqueue(encoder.encode(formatSSEEvent(event)));
          }
        } else {
          for (const event of iterable as Iterable<SSEEvent | string>) {
            controller.enqueue(encoder.encode(formatSSEEvent(event)));
          }
        }
      } catch (err) {
        // Send an error event before closing
        const errorEvent = formatSSEEvent({
          event: 'error',
          data: JSON.stringify({
            message: err instanceof Error ? err.message : 'Stream error',
          }),
        });
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}

/**
 * Transform an async iterable of arbitrary objects into SSE data events.
 * Automatically JSON-serializes non-string values.
 */
export async function* toSSEDataStream<T>(
  source: AsyncIterable<T>,
  transform?: (item: T) => SSEEvent | string
): AsyncGenerator<SSEEvent | string> {
  for await (const item of source) {
    if (transform) {
      yield transform(item);
    } else {
      yield typeof item === 'string' ? item : JSON.stringify(item);
    }
  }
}
