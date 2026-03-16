import pg from 'pg';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  _pool = new Pool({
    connectionString: url,
    max: 6,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on('error', (err) => {
    console.error('[db] pool error', err.message);
  });
  return _pool;
}

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionRow = {
  sessionId: string;
  topic: string;
  status: string;
  step: string;
  progress: number;
  meta: Record<string, unknown>;
  published: boolean;
  slug: string | null;
  assetKey: string | null;
  _creationTime: number; // epoch ms — backwards compat with Convex consumers
};

export type EventRow = {
  id: number;
  sessionId: string;
  type: string;
  payload: unknown;
  created_at: string;
};

function toSession(row: Record<string, unknown>): SessionRow {
  return {
    sessionId: row.session_id as string,
    topic: row.topic as string,
    status: row.status as string,
    step: row.step as string,
    progress: row.progress as number,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    published: row.published as boolean,
    slug: (row.slug as string) ?? null,
    assetKey: (row.asset_key as string) ?? null,
    _creationTime: new Date(row.created_at as string).getTime(),
  };
}

function toEvent(row: Record<string, unknown>): EventRow {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    type: row.type as string,
    payload: row.payload ?? {},
    created_at: new Date(row.created_at as string).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Session mutations
// ---------------------------------------------------------------------------

export async function createSession(
  sessionId: string,
  topic: string,
  status: string,
  step: string,
  progress: number,
  meta: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO market_signal.sessions (session_id, topic, status, step, progress, meta)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, topic, status, step, progress, JSON.stringify(meta)],
  );
}

export async function updateStep(
  sessionId: string,
  step: string,
  progress: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  if (meta !== undefined) {
    await pool.query(
      `UPDATE market_signal.sessions
       SET step = $2, progress = $3, meta = $4, updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId, step, progress, JSON.stringify(meta)],
    );
  } else {
    await pool.query(
      `UPDATE market_signal.sessions
       SET step = $2, progress = $3, updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId, step, progress],
    );
  }
}

export async function updateStatus(sessionId: string, status: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE market_signal.sessions SET status = $2, updated_at = NOW() WHERE session_id = $1`,
    [sessionId, status],
  );
}

export async function patchMeta(
  sessionId: string,
  metaPatch: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE market_signal.sessions
     SET meta = meta || $2::jsonb, updated_at = NOW()
     WHERE session_id = $1`,
    [sessionId, JSON.stringify(metaPatch)],
  );
}

export async function publishSession(
  sessionId: string,
  slug: string,
  assetKey: string,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE market_signal.sessions
     SET published = TRUE, slug = $2, asset_key = $3, updated_at = NOW()
     WHERE session_id = $1`,
    [sessionId, slug, assetKey],
  );
}

// ---------------------------------------------------------------------------
// Session queries
// ---------------------------------------------------------------------------

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM market_signal.sessions WHERE session_id = $1`,
    [sessionId],
  );
  return rows.length ? toSession(rows[0]) : null;
}

export async function getBySlug(slug: string): Promise<SessionRow | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM market_signal.sessions WHERE slug = $1 AND published = TRUE`,
    [slug],
  );
  return rows.length ? toSession(rows[0]) : null;
}

export async function listSessions(
  limit = 50,
  status?: string,
  q?: string,
): Promise<SessionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }
  if (q && q.trim()) {
    conditions.push(`topic ILIKE $${idx++}`);
    params.push(`%${q.trim()}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT * FROM market_signal.sessions ${where} ORDER BY created_at DESC LIMIT $${idx}`,
    params,
  );
  return rows.map(toSession);
}

export async function listPublished(limit = 200): Promise<SessionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM market_signal.sessions WHERE published = TRUE ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toSession);
}

export async function listByAsset(assetKey: string, limit = 50): Promise<SessionRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM market_signal.sessions
     WHERE asset_key = $1 AND status = 'ready'
     ORDER BY created_at DESC LIMIT $2`,
    [assetKey, limit],
  );
  return rows.map(toSession);
}

// ---------------------------------------------------------------------------
// Event mutations
// ---------------------------------------------------------------------------

export async function insertEvent(
  sessionId: string,
  type: string,
  payload: unknown,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO market_signal.session_events (session_id, type, payload) VALUES ($1, $2, $3)`,
    [sessionId, type, JSON.stringify(payload ?? {})],
  );
}

export async function insertEventBatch(
  events: Array<{ sessionId: string; type: string; payload: unknown }>,
): Promise<void> {
  const pool = getPool();
  if (!pool || events.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const ev of events) {
    values.push(`($${idx++}, $${idx++}, $${idx++})`);
    params.push(ev.sessionId, ev.type, JSON.stringify(ev.payload ?? {}));
  }
  await pool.query(
    `INSERT INTO market_signal.session_events (session_id, type, payload) VALUES ${values.join(', ')}`,
    params,
  );
}

// ---------------------------------------------------------------------------
// Event queries
// ---------------------------------------------------------------------------

export async function listEvents(sessionId: string, limit = 250): Promise<EventRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM market_signal.session_events WHERE session_id = $1 ORDER BY id ASC LIMIT $2`,
    [sessionId, limit],
  );
  return rows.map(toEvent);
}

// ---------------------------------------------------------------------------
// Cleanup (replaces Convex scheduler TTL)
// ---------------------------------------------------------------------------

export async function deleteExpired(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const { rowCount } = await pool.query(
    `DELETE FROM market_signal.sessions
     WHERE published IS NOT TRUE
       AND created_at < NOW() - INTERVAL '24 hours'`,
  );
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------

export async function probeDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const pool = getPool();
  if (!pool) return { ok: false, latencyMs: 0, error: 'missing-url' };
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}
