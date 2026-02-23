import { z } from 'zod';

const DEV_SECRET = 'ogelfy-dev-secret-change-this-in-production-minimum-32-chars';

const envSchema = z.object({
  PORT:        z.string().default('3000').transform(Number),
  NODE_ENV:    z.enum(['development', 'staging', 'production', 'test']).default('development'),
  JWT_SECRET:  z.string().min(32).optional(),
  DATABASE_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === 'production' && !parsed.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET ?? DEV_SECRET,
};
