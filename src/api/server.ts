import { Ogelfy } from '../../packages/ogelfy/src/index';
import { env } from '../config/env';
import { registerHealthRoutes } from '../routes/health';

const app = new Ogelfy({
  logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
registerHealthRoutes(app);

// TODO: register your route modules here
// import { registerUserRoutes } from '../routes/users';
// registerUserRoutes(app);

// ── Start ─────────────────────────────────────────────────────────────────────
await app.listen({ port: env.PORT, hostname: '0.0.0.0' });
console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
