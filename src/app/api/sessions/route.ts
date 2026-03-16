import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb, listSessions } from '@/lib/db';
import { createLogger } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  q: z.string().optional(),
  status: z.string().optional(),
});


function countOf(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function normalizeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim();
  if (!tag) return null;
  return tag.length > 36 ? `${tag.slice(0, 33)}...` : tag;
}

function bumpTag(store: Map<string, { label: string; score: number }>, value: unknown, score = 1) {
  const tag = normalizeTag(value);
  if (!tag) return;
  const key = tag.toLowerCase();
  const current = store.get(key);
  if (current) {
    current.score += score;
    return;
  }
  store.set(key, { label: tag, score });
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function computeMapTags(artifacts: any): string[] {
  const ranked = new Map<string, { label: string; score: number }>();

  const nodes = asArray(artifacts?.nodes);
  for (const node of nodes.slice(0, 120)) {
    bumpTag(ranked, node?.type, 3);
    bumpTag(ranked, node?.meta?.kind, 2);
  }

  const edges = asArray(artifacts?.edges);
  for (const edge of edges.slice(0, 120)) {
    bumpTag(ranked, edge?.type, 2);
  }

  const tape = asArray(artifacts?.tape);
  for (const item of tape.slice(0, 60)) {
    for (const tag of asArray(item?.tags).slice(0, 5)) {
      bumpTag(ranked, tag, 2);
    }
  }

  const evidence = asArray(artifacts?.evidence);
  for (const item of evidence.slice(0, 50)) {
    for (const catalyst of asArray(item?.aiSummary?.catalysts).slice(0, 4)) {
      bumpTag(ranked, catalyst, 1);
    }
    for (const entity of asArray(item?.aiSummary?.entities).slice(0, 4)) {
      bumpTag(ranked, entity, 1);
    }
  }

  const videoItems = asArray(artifacts?.videos?.items);
  for (const item of videoItems.slice(0, 40)) {
    bumpTag(ranked, item?.platform || item?.provider, 2);
    bumpTag(ranked, item?.channel || item?.author, 1);
  }

  return Array.from(ranked.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 6)
    .map((entry) => entry.label);
}

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/sessions' });
  const startedAt = Date.now();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get('limit') || undefined,
    q: url.searchParams.get('q') || undefined,
    status: url.searchParams.get('status') || undefined,
  });

  if (!parsed.success) {
    log.warn('sessions.list.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }

  if (!hasDb()) {
    log.warn('sessions.list.missing_db', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
  }

  const { limit, q, status } = parsed.data;

  let rows: any[];
  try {
    rows = await listSessions(limit, status, q);
  } catch (e: any) {
    log.error('sessions.list.fetch_failed', { error: e?.message, ms: Date.now() - startedAt });
    return NextResponse.json({ error: e?.message || 'fetch failed' }, { status: 500 });
  }

  const sessions = rows.map((s: any) => {
    const meta = s.meta || {};
    const artifacts = meta.artifacts || {};
    return {
      id: s.sessionId,
      createdAt: new Date(s._creationTime).toISOString(),
      topic: s.topic,
      status: s.status,
      step: s.step,
      progress: s.progress,
      mode: meta.mode || null,
      provider: meta.provider || null,
      model: meta.model || null,
      planQueries: countOf(meta.plan?.queries),
      selectedUrls: countOf(meta.selectedUrls),
      counts: {
        evidence: countOf(artifacts.evidence),
        tape: countOf(artifacts.tape),
        nodes: countOf(artifacts.nodes),
        edges: countOf(artifacts.edges),
        clusters: countOf(artifacts.clusters),
      },
      snapshots: {
        price: Boolean(artifacts.price),
        videos: Boolean(artifacts.videos),
      },
      mapTags: computeMapTags(artifacts),
    };
  });

  log.info('sessions.list.ok', { sessions: sessions.length, ms: Date.now() - startedAt });
  return NextResponse.json({ sessions }, { status: 200 });
}
