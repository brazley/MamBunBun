import { env } from '../config/env';

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',');

  if (origin && allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  return {};
}
