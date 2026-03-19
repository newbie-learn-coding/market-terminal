import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb, listSessionsPage } from '@/lib/db';
import { createLogger } from '@/lib/log';
import { asSessionMeta, countOf, getArtifacts, stringArray } from '@/lib/session-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  q: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
});

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

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function computeMapTags(artifacts: unknown): string[] {
  const ranked = new Map<string, { label: string; score: number }>();
  const data = getArtifacts({ artifacts });

  const nodes = arrayOfRecords(data.nodes);
  for (const node of nodes.slice(0, 120)) {
    bumpTag(ranked, node.type, 3);
    bumpTag(ranked, (node.meta as Record<string, unknown> | undefined)?.kind, 2);
  }

  const edges = arrayOfRecords(data.edges);
  for (const edge of edges.slice(0, 120)) {
    bumpTag(ranked, edge.type, 2);
  }

  const tape = arrayOfRecords(data.tape);
  for (const item of tape.slice(0, 60)) {
    for (const tag of stringArray(item.tags).slice(0, 5)) {
      bumpTag(ranked, tag, 2);
    }
  }

  const evidence = arrayOfRecords(data.evidence);
  for (const item of evidence.slice(0, 50)) {
    const summary = item.aiSummary as Record<string, unknown> | undefined;
    for (const catalyst of stringArray(summary?.catalysts).slice(0, 4)) {
      bumpTag(ranked, catalyst, 1);
    }
    for (const entity of stringArray(summary?.entities).slice(0, 4)) {
      bumpTag(ranked, entity, 1);
    }
  }

  const videos = data.videos as Record<string, unknown> | undefined;
  const videoItems = arrayOfRecords(videos?.items);
  for (const item of videoItems.slice(0, 40)) {
    bumpTag(ranked, item.platform || item.provider, 2);
    bumpTag(ranked, item.channel || item.author, 1);
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
    cursor: url.searchParams.get('cursor') || undefined,
  });

  if (!parsed.success) {
    log.warn('sessions.list.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }

  if (!hasDb()) {
    log.warn('sessions.list.missing_db', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Database not configured' }, { status: 400 });
  }

  const { limit, q, status, cursor } = parsed.data;

  let page: Awaited<ReturnType<typeof listSessionsPage>>;
  try {
    page = await listSessionsPage({ limit, status, q, cursor });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'fetch failed';
    log.error('sessions.list.fetch_failed', { error, ms: Date.now() - startedAt });
    return NextResponse.json({ error }, { status: 500 });
  }

  const sessions = page.items.map((s) => {
    const meta = asSessionMeta(s.meta);
    const artifacts = getArtifacts(meta);
    return {
      id: s.sessionId,
      createdAt: new Date(s._creationTime).toISOString(),
      topic: s.topic,
      status: s.status,
      step: s.step,
      progress: s.progress,
      mode: meta.mode || null,
      provider: typeof meta.provider === 'string' ? meta.provider : null,
      model: typeof meta.model === 'string' ? meta.model : null,
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

  log.info('sessions.list.ok', { sessions: sessions.length, hasMore: page.hasMore, ms: Date.now() - startedAt });
  return NextResponse.json(
    {
      sessions,
      pageInfo: {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      },
    },
    { status: 200 },
  );
}
