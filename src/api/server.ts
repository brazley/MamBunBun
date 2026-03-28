import { Ogelfy, corsPlugin } from '../../packages/ogelfy/src/index';
import { env } from '../config/env';

// ── Routes (always active) ──────────────────────────────────────────────────
import { registerHealthRoutes } from '../routes/health';
import { registerExampleRoutes } from '../routes/example';

// ── Opt-in plugins (uncomment to enable) ────────────────────────────────────
// import { authPlugin } from '../plugins/auth';
// import { rateLimitPlugin } from '../plugins/rate-limit';

// ── Opt-in clients (uncomment to enable) ────────────────────────────────────
// import { closePool } from '../clients/database';

const app = new Ogelfy({
  logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
});

// ── Core plugins ────────────────────────────────────────��───────────────────
await app.register(corsPlugin, {
  origin: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// ── Opt-in plugins (uncomment to enable) ────────────────────────────────────
// await app.register(authPlugin, { exclude: ['/health'] });
// await app.register(rateLimitPlugin, { limit: 100, windowMs: 60_000 });

// ── Routes ──────────────────────────────────────────────────────────────────
registerHealthRoutes(app);
registerExampleRoutes(app);

// ── Error & 404 handlers ────────────────────────────────────────────────────
app.setNotFoundHandler(async (req) => {
  return new Response(
    JSON.stringify({
      error: 'Not Found',
      path: new URL(req.url).pathname,
    }),
    { status: 404, headers: { 'Content-Type': 'application/json' } },
  );
});

app.setErrorHandler((error, _req) => {
  console.error('Unhandled error:', error);
  const statusCode = (error as any).statusCode || 500;
  return new Response(
    JSON.stringify({
      error: error.message || 'Internal Server Error',
      statusCode,
    }),
    { status: statusCode, headers: { 'Content-Type': 'application/json' } },
  );
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  // await closePool();  // uncomment when database is enabled
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ───────────────────────────────────────────────────────────────────
await app.listen({ port: env.PORT, hostname: '0.0.0.0' });

console.log(`MamBunBun running on :${env.PORT} [${env.NODE_ENV}]`);
console.log(`  GET  /health`);
console.log(`  GET  /api/hello/:name`);
console.log(`  POST /api/echo`);
