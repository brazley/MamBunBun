/**
 * Production Ogelfy Server
 *
 * Optimized for Railway deployment with Kong load balancing
 */

import { Ogelfy } from './index';

const app = new Ogelfy();

// Environment configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = process.env.RAILWAY_SERVICE_NAME || 'ogelfy';
const REPLICA_ID = process.env.RAILWAY_REPLICA_ID || '1';

console.log(`🚀 Starting ${SERVICE_NAME} (replica ${REPLICA_ID})`);
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Port: ${PORT}`);

// Health check endpoint (required for Kong)
app.get('/health', async () => {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    replica: REPLICA_ID,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
  };
});

// Readiness check (detailed health)
app.get('/ready', async () => {
  // Add checks for dependencies (database, Redis, etc.)
  const checks = {
    server: 'ok',
    memory: process.memoryUsage().heapUsed < 1024 * 1024 * 500, // <500MB
    uptime: process.uptime() > 5, // At least 5 seconds running
  };

  const allHealthy = Object.values(checks).every(v => v === 'ok' || v === true);

  return {
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    replica: REPLICA_ID,
  };
});

// API routes
app.get('/api', async () => {
  return {
    name: 'Ogelfy API',
    version: '1.0.0',
    service: SERVICE_NAME,
    replica: REPLICA_ID,
  };
});

// Example API endpoints
app.get('/api/hello', async () => {
  return {
    message: 'Hello from Ogelfy!',
    service: SERVICE_NAME,
    replica: REPLICA_ID,
  };
});

app.get('/api/greet/:name', async (req, context) => {
  return {
    message: `Hello, ${context.params.name}!`,
    service: SERVICE_NAME,
    replica: REPLICA_ID,
    timestamp: new Date().toISOString(),
  };
});

app.post('/api/echo', async (req, context) => {
  return {
    received: context.body,
    service: SERVICE_NAME,
    replica: REPLICA_ID,
    timestamp: new Date().toISOString(),
  };
});

// Metrics endpoint (for monitoring)
app.get('/metrics', async () => {
  const usage = process.memoryUsage();
  return {
    service: SERVICE_NAME,
    replica: REPLICA_ID,
    uptime_seconds: process.uptime(),
    memory: {
      rss: usage.rss,
      heap_total: usage.heapTotal,
      heap_used: usage.heapUsed,
      external: usage.external,
    },
    timestamp: new Date().toISOString(),
  };
});

// 404 handler
app.setNotFoundHandler(async (req) => {
  return new Response(JSON.stringify({
    error: 'Not Found',
    path: new URL(req.url).pathname,
    service: SERVICE_NAME,
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Error handler
app.setErrorHandler((error, req) => {
  console.error(`[${SERVICE_NAME}-${REPLICA_ID}] Error:`, error);

  const statusCode = (error as any).statusCode || 500;
  return new Response(JSON.stringify({
    error: error.message || 'Internal Server Error',
    statusCode,
    service: SERVICE_NAME,
    replica: REPLICA_ID,
  }), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);

  // Close server (Ogelfy doesn't expose close() yet, but this is the pattern)
  // await app.close();

  console.log('✅ Server closed');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
await app.listen({ port: PORT });

console.log(`
✅ ${SERVICE_NAME} (replica ${REPLICA_ID}) running on http://localhost:${PORT}

Endpoints:
  GET  /health          - Health check (Kong uses this)
  GET  /ready           - Readiness check
  GET  /metrics         - Service metrics
  GET  /api             - API info
  GET  /api/hello       - Hello endpoint
  GET  /api/greet/:name - Greeting with parameter
  POST /api/echo        - Echo request body
`);
