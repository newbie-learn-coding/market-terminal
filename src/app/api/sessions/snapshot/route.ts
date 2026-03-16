import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb, getSession, patchMeta, insertEventBatch } from '@/lib/db';
import { createLogger } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SnapshotSchema = z
  .object({
    sessionId: z.string().uuid(),
    price: z.unknown().optional(),
    videos: z.unknown().optional(),
  })
  .refine((v) => v.price !== undefined || v.videos !== undefined, {
    message: 'At least one snapshot payload (price or videos) is required',
  });

function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/sessions/snapshot' });
  const startedAt = Date.now();

  const parsed = SnapshotSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    log.warn('sessions.snapshot.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
  }

  if (!hasDb()) {
    log.warn('sessions.snapshot.missing_db', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
  }

  const { sessionId, price, videos } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    log.warn('sessions.snapshot.session_not_found', { sessionId });
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const prevArtifacts = asObject((session.meta as any)?.artifacts);
  const nextArtifacts: Record<string, unknown> = { ...prevArtifacts };
  if (price !== undefined) nextArtifacts.price = price;
  if (videos !== undefined) nextArtifacts.videos = videos;

  try {
    await patchMeta(sessionId, { artifacts: nextArtifacts });
  } catch (e: any) {
    log.error('sessions.snapshot.update_failed', { sessionId, error: e?.message, ms: Date.now() - startedAt });
    return NextResponse.json({ error: e?.message || 'update failed' }, { status: 500 });
  }

  const events: Array<{ sessionId: string; type: string; payload: unknown }> = [];
  if (price !== undefined) events.push({ sessionId, type: 'price.snapshot', payload: price });
  if (videos !== undefined) events.push({ sessionId, type: 'videos.snapshot', payload: videos });

  if (events.length) {
    await insertEventBatch(events).catch((e: any) => {
      log.warn('sessions.snapshot.event_insert_failed', { sessionId, error: e?.message });
    });
  }

  log.info('sessions.snapshot.ok', {
    sessionId,
    saved: events.map((e) => e.type),
    ms: Date.now() - startedAt,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
