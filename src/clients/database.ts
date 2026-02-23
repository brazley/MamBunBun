import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';

// ── Pool ──────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  _pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  _pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  return _pool;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkConnection(): Promise<{ connected: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    await query('SELECT 1');
    return { connected: true, latency: Date.now() - start };
  } catch (err) {
    return {
      connected: false,
      latency: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
