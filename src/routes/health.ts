import type { Ogelfy } from '../../packages/ogelfy/src/index';

export function registerHealthRoutes(app: Ogelfy): void {
  app.get('/health', (_req, reply) => {
    return reply.send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
}
