import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createChatCompletion, getAIConfig } from '@/lib/ai';
import { hasDb, getSession as dbGetSession, insertEvent, insertEventBatch } from '@/lib/db';
import { createLogger } from '@/lib/log';
import { selectStageModel } from '@/lib/modelRouting';
import { buildSignalTerminalChatPrompt } from '@/prompts/signalTerminalChat';
import { asSessionMeta, evidenceItems, getArtifacts, graphEdges, graphNodes, storyClusters, tapeItems } from '@/lib/session-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(2).max(2000),
  focusEvidenceIds: z.array(z.string()).max(24).optional(),
});

function truncateText(raw: string, max: number) {
  const s = (raw || '').trim();
  if (s.length <= max) return s;
  if (max <= 3) return s.slice(0, max);
  return `${s.slice(0, max - 3).trimEnd()}...`;
}

function safeErrorText(err: unknown, max = 220) {
  const raw = err instanceof Error ? err.message : String(err || 'error');
  return truncateText(raw, max);
}

export async function POST(request: Request) {
  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/chat' });
  const startedAt = Date.now();

  let body: z.infer<typeof ChatRequestSchema>;
  try {
    body = ChatRequestSchema.parse(await request.json());
  } catch {
    log.warn('chat.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!hasDb()) {
    return NextResponse.json(
      { error: 'Database not configured (DATABASE_URL missing).' },
      { status: 503 },
    );
  }

  const sessionRow = await dbGetSession(body.sessionId);
  if (!sessionRow) {
    log.warn('chat.session_not_found', { sessionId: body.sessionId });
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const meta = asSessionMeta(sessionRow.meta);
  const sessionMode: 'fast' | 'deep' = meta.mode === 'deep' ? 'deep' : 'fast';
  const chatModel = selectStageModel({
    stage: 'chat',
    mode: sessionMode,
  });
  const cfg = getAIConfig({ modelOverride: chatModel || undefined });
  if (!cfg) {
    return NextResponse.json({ error: 'AI not configured (missing key).' }, { status: 503 });
  }

  const artifacts = getArtifacts(meta);
  const evidence = evidenceItems(artifacts.evidence);
  const tape = tapeItems(artifacts.tape);
  const nodes = graphNodes(artifacts.nodes);
  const edges = graphEdges(artifacts.edges);
  const clusters = storyClusters(artifacts.clusters);

  const focusEvidenceIds = (body.focusEvidenceIds || []).filter((id) => typeof id === 'string').slice(0, 24);
  const focusEvidence = focusEvidenceIds.length
    ? evidence.filter((e) => focusEvidenceIds.includes(String(e.id))).slice(0, 12)
    : [];

  const focusEvidenceSlim = focusEvidence.map((e) => ({
    id: e.id,
    title: e.title,
    source: e.source,
    url: e.url,
    excerpt: truncateText(String(e.excerpt || ''), 520),
  }));

  const evidenceSlim = evidence.slice(0, 18).map((e) => ({
    id: e.id,
    title: e.title,
    source: e.source,
    url: e.url,
    excerpt: truncateText(String(e.excerpt || ''), 260),
    aiSummary: e.aiSummary
      ? {
          bullets: (e.aiSummary.bullets || []).slice(0, 5),
          catalysts: (e.aiSummary.catalysts || []).slice(0, 10),
          sentiment: e.aiSummary.sentiment,
          confidence: e.aiSummary.confidence,
        }
      : undefined,
  }));

  const tapeSlim = tape.slice(0, 12).map((t) => ({
    title: t.title,
    source: t.source,
    evidenceId: t.evidenceId,
    tags: (t.tags || []).slice(0, 6),
  }));

  const clustersSlim = clusters.slice(0, 6).map((c) => ({
    title: c.title,
    momentum: c.momentum,
    summary: c.summary,
    evidenceIds: (c.evidenceIds || []).slice(0, 8),
  }));

  const prompt = buildSignalTerminalChatPrompt({
    sessionTopic: String(sessionRow.topic || ''),
    userQuestion: body.message,
    focusEvidence: focusEvidenceSlim,
    evidence: evidenceSlim,
    tape: tapeSlim,
    clusters: clustersSlim,
    map: { nodes: nodes.slice(0, 26), edges: edges.slice(0, 40) },
  });

  const system = prompt.system;
  const user = prompt.user;

  let result: Awaited<ReturnType<typeof createChatCompletion>>;
  try {
    result = await createChatCompletion({
      config: cfg,
      temperature: 0.2,
      maxTokens: 650,
      cacheTtlMs: 0,
      system,
      user,
    });
  } catch (e) {
    const message = safeErrorText(e, 260);
    log.error('chat.ai_failed', {
      sessionId: body.sessionId,
      ms: Date.now() - startedAt,
      model: cfg.model,
      error: message,
    });

    // Best-effort trace event for dashboard replay/debug.
    await insertEvent(body.sessionId, 'warn', { message: `Chat model call failed (${cfg.model}): ${message}` }).catch(() => {});

    return NextResponse.json(
      { error: `Chat model request failed (${cfg.model}). ${message}` },
      { status: 502 },
    );
  }

  const content = result.content.trim() || '';
  const usage = result.usage;

  // Persist to trace for demo/debug. (Best-effort)
  await insertEventBatch([
    {
      sessionId: body.sessionId,
      type: 'chat.question',
      payload: { content: truncateText(body.message, 900), focusEvidenceIds },
    },
    {
      sessionId: body.sessionId,
      type: 'ai.usage',
      payload: {
        model: cfg.model,
        tag: 'chat',
        prompt_tokens: usage?.prompt_tokens ?? 0,
        completion_tokens: usage?.completion_tokens ?? 0,
        total_tokens: usage?.total_tokens ?? 0,
      },
    },
    {
      sessionId: body.sessionId,
      type: 'chat.answer',
      payload: { content: truncateText(content, 1800) },
    },
  ]).catch(() => {});

  log.info('chat.ok', {
    sessionId: body.sessionId,
    ms: Date.now() - startedAt,
    model: cfg.model,
    total_tokens: usage?.total_tokens ?? 0,
  });

  return NextResponse.json(
    {
      ok: Boolean(content),
      content,
      usage: {
        model: cfg.model,
        prompt_tokens: usage?.prompt_tokens ?? 0,
        completion_tokens: usage?.completion_tokens ?? 0,
        total_tokens: usage?.total_tokens ?? 0,
      },
    },
    { status: 200 },
  );
}
