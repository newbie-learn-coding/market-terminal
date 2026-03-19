import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb, getSession, listEventsPage } from '@/lib/db';
import { createLogger } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  sessionId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(800).optional().default(250),
  cursor: z.string().optional(),
});

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/sessions/events' });
  const startedAt = Date.now();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    sessionId: url.searchParams.get('sessionId') || url.searchParams.get('id') || '',
    limit: url.searchParams.get('limit') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
  });

  if (!parsed.success) {
    log.warn('sessions.events.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Missing or invalid ?sessionId=' }, { status: 400 });
  }

  if (!hasDb()) {
    log.warn('sessions.events.missing_db', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
  }

  const { sessionId, limit, cursor } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    log.warn('sessions.events.session_not_found', { sessionId, ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  let page: Awaited<ReturnType<typeof listEventsPage>>;
  try {
    page = await listEventsPage({ sessionId, limit, cursor });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'fetch failed';
    log.error('sessions.events.events_fetch_failed', { sessionId, error, ms: Date.now() - startedAt });
    return NextResponse.json({ error }, { status: 500 });
  }

  log.info('sessions.events.ok', { sessionId, events: page.items.length, hasMore: page.hasMore, ms: Date.now() - startedAt });

  return NextResponse.json(
    {
      session: {
        id: session.sessionId,
        created_at: new Date(session._creationTime).toISOString(),
        topic: session.topic,
        status: session.status,
        step: session.step,
        progress: session.progress,
        meta: session.meta,
      },
      events: page.items,
      pageInfo: {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      },
    },
    { status: 200 },
  );
}
