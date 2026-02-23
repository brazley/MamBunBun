/**
 * Fastify server — runs as an isolated Node.js process.
 * Spawned by bench.ts; killed after benchmarking.
 */
import Fastify from 'fastify';

const port = Number(process.env.PORT ?? 4003);
const fastify = Fastify({ logger: false });

fastify.get('/bench', async () => ({ hello: 'world' }));
fastify.get('/users/:id', async (req) => ({ id: req.params.id }));

await fastify.listen({ port, host: '0.0.0.0' });
console.log(`fastify-ready:${port}`);
