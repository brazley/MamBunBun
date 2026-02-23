/**
 * Ogelfy vs Fastify Benchmark
 *
 * Methodology:
 *   - Raw Bun.serve and Ogelfy run in THIS Bun process (isolated from each other via port)
 *   - Fastify runs in a SEPARATE Node.js child process — no shared JIT, fair comparison
 *   - autocannon: 10s run, 100 connections, pipelining 1
 *   - Warmup: 3s per server before measuring
 */

import { Ogelfy } from '../packages/ogelfy/src/index';
import { resolve } from 'path';

const PORT_RAW     = 4001;
const PORT_OGELFY  = 4002;
const PORT_FASTIFY = 4003;

const PAYLOAD = JSON.stringify({ hello: 'world' });
const HEADERS = { 'Content-Type': 'application/json' };

// ─── 1. Raw Bun.serve (theoretical ceiling) ───────────────────────────────────
const rawServer = Bun.serve({
  port: PORT_RAW,
  fetch() {
    return new Response(PAYLOAD, { headers: HEADERS });
  },
});

// ─── 2. Ogelfy ────────────────────────────────────────────────────────────────
const app = new Ogelfy({ logger: { level: 'error' } });

// Full pipeline: schema validation + quik-json serializer
app.get('/bench',
  { schema: { response: { 200: { type: 'object', properties: { hello: { type: 'string' } }, required: ['hello'] } } } },
  (_req, _reply) => ({ hello: 'world' })
);
app.get('/users/:id',
  { schema: { response: { 200: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } } },
  (req, _reply) => ({ id: req.params.id })
);

// Fast path: no schema — zero-Promise sync dispatch
app.get('/bench-fast', (_req, _reply) => ({ hello: 'world' }));
app.get('/users-fast/:id', (req, _reply) => ({ id: req.params.id }));

await app.listen({ port: PORT_OGELFY });

// ─── 3. Fastify — isolated Node.js process ────────────────────────────────────
let fastifyProc: ReturnType<typeof Bun.spawn> | null = null;
let fastifyReady = false;

try {
  const serverPath = resolve(import.meta.dir, 'fastify-server.mjs');

  fastifyProc = Bun.spawn(
    ['node', serverPath],
    {
      env: { ...process.env, PORT: String(PORT_FASTIFY) },
      stdout: 'ignore',
      stderr: 'ignore',
    }
  );

  // Give Node.js time to start and bind the port, then probe with a real request
  await Bun.sleep(1500);
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const r = await fetch(`http://localhost:${PORT_FASTIFY}/bench`);
      if (r.ok) { fastifyReady = true; break; }
    } catch {
      await Bun.sleep(300);
    }
  }

  if (fastifyReady) {
    console.log('✅ Fastify server running (isolated Node.js process)');
  } else {
    console.log('⚠️  Fastify process did not become ready — skipping');
    fastifyProc.kill();
    fastifyProc = null;
  }
} catch (e) {
  console.log('⚠️  Could not start Fastify Node.js process:', e instanceof Error ? e.message : String(e));
  fastifyProc = null;
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function bench(label: string, url: string): Promise<void> {
  console.log(`\n🔥 Benchmarking: ${label} → ${url}`);

  const proc = Bun.spawn(
    ['bunx', 'autocannon', '-d', '10', '-c', '100', '-p', '1', '--no-progress', url],
    { stdout: 'inherit', stderr: 'inherit' }
  );
  await proc.exited;
}

async function warmup(url: string): Promise<void> {
  const proc = Bun.spawn(
    ['bunx', 'autocannon', '-d', '3', '-c', '50', '--no-progress', url],
    { stdout: 'ignore', stderr: 'ignore' }
  );
  await proc.exited;
}

// ─── Warmup ───────────────────────────────────────────────────────────────────
console.log('\n⏳ Warming up (3s each)...');
await warmup(`http://localhost:${PORT_RAW}/`);
await warmup(`http://localhost:${PORT_OGELFY}/bench-fast`);
await warmup(`http://localhost:${PORT_OGELFY}/bench`);
if (fastifyReady) await warmup(`http://localhost:${PORT_FASTIFY}/bench`);

// ─── Benchmark ────────────────────────────────────────────────────────────────
console.log('\n📊 Running benchmarks (10s each, 100 connections)...');

await bench('Raw Bun.serve', `http://localhost:${PORT_RAW}/`);
await bench('Ogelfy — fast path (no schema, sync)', `http://localhost:${PORT_OGELFY}/bench-fast`);
await bench('Ogelfy — fast path param routing', `http://localhost:${PORT_OGELFY}/users-fast/42`);
await bench('Ogelfy — full pipeline (schema + quik-json)', `http://localhost:${PORT_OGELFY}/bench`);
await bench('Ogelfy — full pipeline param routing', `http://localhost:${PORT_OGELFY}/users/42`);

if (fastifyReady) {
  await bench('Fastify — Node.js (isolated process)', `http://localhost:${PORT_FASTIFY}/bench`);
  await bench('Fastify — Node.js param routing', `http://localhost:${PORT_FASTIFY}/users/42`);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
rawServer.stop();
await app.close();
if (fastifyProc) {
  fastifyProc.kill();
  await fastifyProc.exited.catch(() => {});
}

console.log('\n✅ Done.');
process.exit(0);
