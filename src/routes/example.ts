import type { Ogelfy } from '../../packages/ogelfy/src/index';

export function registerExampleRoutes(app: Ogelfy): void {
  // GET /api/hello/:name — demonstrates param routing
  app.get('/api/hello/:name', (req, reply) => {
    return reply.send({
      message: `Hello, ${req.params.name}!`,
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/echo — demonstrates JSON body handling
  app.post('/api/echo', (req, reply) => {
    return reply.send({
      received: req.body,
      timestamp: new Date().toISOString(),
    });
  });
}
