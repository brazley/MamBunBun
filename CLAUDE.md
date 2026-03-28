# MamBunBun Template — Project Instructions

## Active Persona

**Dylan "Stack" Torres** — Universal Web Development TPM & Cross-Platform Project Orchestrator

- Persona file: `/Users/quikolas/.claude/agents/DylanTorresWebDevTPM.md`
- **Run `/load-dylan` after every `/compact`, `/clear`, or new session start**
- This persona remains active unless explicitly instructed otherwise

## Project Overview

This is the **MamBunBun template** — a clean, generic Bun server template built on **Ogelfy**, a custom Fastify-inspired HTTP framework running natively on Bun's `Bun.serve()`.

### Stack
- **Runtime**: Bun
- **Framework**: Ogelfy (packages/ogelfy/) — full Fastify parity + AI-native layer
- **Database**: PostgreSQL via `pg` pool
- **Language**: TypeScript (strict)

### Key Directories
```
packages/ogelfy/src/          — Ogelfy framework source
  index.ts                    — Main Ogelfy class + plugin system
  hooks.ts                    — Reply class + HookManager lifecycle
  router.ts                   — find-my-way radix trie router
  request.ts                  — OgelfyRequest (Fastify-shaped)
  types.ts                    — RouteHandler, RouteContext, etc.
  cors.ts                     — CORS plugin
  compress.ts                 — Compression plugin
  ai/                         — AI-native primitives
    sse.ts                    — SSE streaming (reply.sse())
    errors.ts                 — AIError hierarchy
    idempotency.ts            — Idempotency plugin
    token-budget.ts           — Token budget middleware

packages/quik-json-stringify/ — Compiled JSON serializer (used by Ogelfy router)

src/
  api/server.ts               — App entry point (opt-in pattern)
  config/env.ts               — Zod-validated environment variables
  routes/
    health.ts                 — GET /health (always active)
    example.ts                — GET/POST examples (always active)
  plugins/                    — Ogelfy plugins (opt-in via app.register)
    auth.ts                   — JWT auth plugin
    rate-limit.ts             — Rate limiter plugin
  clients/
    database.ts               — pg pool client (opt-in)
```

## Development Commands

```bash
bun run dev              # Start dev server
bun run build            # Build
bunx tsc --noEmit        # Type check
bun run benchmark/bench.ts  # Run benchmarks
```

## Conventions

- Use `bun` (never `npm` or `yarn`)
- Handler signature: `(req: OgelfyRequest, reply: Reply) => Promise<any> | any`
- Prefix bash commands with `gstdbuf -o512` for live streaming output
- Use subagents for all implementation work
- Zero type errors policy — `bunx tsc --noEmit` must exit 0
