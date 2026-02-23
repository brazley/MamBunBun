import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthContext {
  userId: string;
  role?: string;
  [key: string]: any;
}

/**
 * Verify a Bearer JWT and return the decoded context.
 * In development, falls back to an anonymous user when no token is present.
 */
export async function authMiddleware(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    if (env.NODE_ENV === 'development') {
      return { userId: 'dev-anonymous' };
    }
    throw new Error('Unauthorized');
  }

  const token = authHeader.slice(7);

  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthContext;
  } catch {
    throw new Error('Unauthorized');
  }
}

/**
 * Extract the raw Bearer token without verifying it.
 */
export function extractToken(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * Sign a new JWT for the given user.
 */
export function generateToken(userId: string, extra?: Record<string, any>): string {
  return jwt.sign({ userId, ...extra }, env.JWT_SECRET, { expiresIn: '24h' });
}
