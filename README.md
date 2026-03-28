# MamBunBun

Bun server template for the **Mamba** ecosystem within **Ogel**.

Built on **Ogelfy** — a custom HTTP framework with full Fastify API parity, running natively on `Bun.serve()`. No Fastify dependency. Faster, leaner, purpose-built for Bun.

---

## Stack

- **Runtime**: [Bun](https://bun.sh) v1.3.11+
- **Framework**: Ogelfy (`packages/ogelfy/`) — Fastify-shaped API on Bun.serve()
- **Database**: PostgreSQL via `pg` pool
- **Language**: TypeScript (strict)
- **Validation**: Zod
- **Logging**: Pino

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment config
cp .env.example .env

# Start dev server (hot reload)
bun run dev
```

Server starts at `http://localhost:3000`. Hit `/health` to verify.

## Project Structure

```
src/
  api/server.ts          — App entry point (opt-in pattern)
  config/env.ts          — Environment variables (Zod validated)
  routes/
    health.ts            — GET /health (always active)
    example.ts           — GET/POST examples (always active)
  plugins/               — Ogelfy plugins (opt-in via app.register)
    auth.ts              — JWT auth plugin
    rate-limit.ts        — Rate limiter plugin
  clients/
    database.ts          — pg pool client (opt-in)

packages/
  ogelfy/src/            — Ogelfy framework source
    index.ts             — Main Ogelfy class + plugin system
    hooks.ts             — Reply class + HookManager lifecycle
    router.ts            — find-my-way radix trie router
    request.ts           — OgelfyRequest (Fastify-shaped)
    types.ts             — RouteHandler, RouteContext, etc.
    ai/                  — AI-native primitives
      sse.ts             — SSE streaming (reply.sse())
      errors.ts          — AIError hierarchy
      idempotency.ts     — Idempotency plugin
      token-budget.ts    — Token budget middleware
  quik-json-stringify/   — Custom fast JSON serializer

benchmark/               — Performance benchmarks (Ogelfy vs Fastify)
```

## Scripts

```bash
bun run dev              # Start dev server (hot reload)
bun run start            # Start production server
bun run test             # Run tests
bunx tsc --noEmit        # Type check
bun run benchmark/bench.ts  # Run benchmarks
```

## Ogelfy Framework

Ogelfy provides the same developer experience as Fastify — route handlers, plugins, hooks, request/reply lifecycle — but runs directly on `Bun.serve()` with zero Node.js compatibility overhead.

**Handler signature:**

```typescript
app.get('/users/:id', async (req: OgelfyRequest, reply: Reply) => {
  const { id } = req.params;
  return { id, name: 'example' };
});
```

**Plugins:**

```typescript
await app.register(corsPlugin, {
  origin: ['http://localhost:3000'],
  credentials: true,
});
```

**AI-native primitives:**

- `reply.sse()` — Server-Sent Events streaming
- `reply.stream()` — Raw streaming responses
- Token budget middleware for LLM-aware endpoints
- Idempotency plugin for safe retries
- Structured `AIError` hierarchy

## Environment Variables

See `.env.example` for the full list:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | JWT signing key (32+ chars) | — |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:3000` |

## Docker

```bash
docker build -t mambunbun .
docker run -p 3000:3000 --env-file .env mambunbun
```

## License

MIT
