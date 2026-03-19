import { NextResponse } from 'next/server';

import { brightDataSerpZone, env, hasBrightData, hasDb } from '@/lib/env';
import { createChatCompletion, getAIConfig } from '@/lib/ai';
import { brightDataSerpGoogle, probeBrightDataMarkdown } from '@/lib/brightdata';
import { probeDb, probeDbSchema } from '@/lib/db';
import { createLogger, maskSecret } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProbeStatus = {
  ok: boolean;
  [key: string]: unknown;
};

async function probeBrightData() {
  const token = env.brightdata.token;
  if (!token) return { ok: false, error: 'missing-token' as const };
  try {
    return await probeBrightDataMarkdown();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message.slice(0, 240) };
  }
}

async function probeBrightDataSerp() {
  const token = env.brightdata.token;
  if (!token) return { ok: false, error: 'missing-token' as const };

  const startedAt = Date.now();
  try {
    const results = await brightDataSerpGoogle({ query: 'bitcoin news today', format: 'light_json_google' });
    return {
      ok: results.length > 0,
      latencyMs: Date.now() - startedAt,
      zone: brightDataSerpZone(),
      count: results.length,
      sampleDomain: results[0]?.url ? new URL(results[0].url).hostname : '',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      zone: brightDataSerpZone(),
      error: message.slice(0, 240),
    };
  }
}

async function probeAI() {
  const cfg = getAIConfig();
  if (!cfg) return { ok: false, error: 'missing-key' as const };

  const startedAt = Date.now();
  const res = await createChatCompletion({
    config: cfg,
    cacheTtlMs: 0,
    temperature: 0,
    maxTokens: 24,
    system: 'Return a single word: ok',
    user: 'Health check.',
  });
  const latencyMs = Date.now() - startedAt;
  const content = res.content.trim();

  return {
    ok: Boolean(content),
    latencyMs,
    model: cfg.model,
    sample: content.slice(0, 40),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const probe = url.searchParams.get('probe') === '1' || url.searchParams.get('probe') === 'true';

  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/health' });
  const startedAt = Date.now();

  log.info('health.request', { probe });

  const base = {
    ok: true,
    now: new Date().toISOString(),
    config: {
      brightdata: {
        configured: hasBrightData(),
        token: env.brightdata.token ? maskSecret(env.brightdata.token) : '',
        unlockerZone: env.brightdata.zone,
        serpZone: brightDataSerpZone(),
      },
      ai: {
        configured: Boolean(getAIConfig()),
        model: env.ai.openrouter.model,
        allowClientApiKeys: env.ai.allowClientApiKeys,
      },
      db: {
        configured: hasDb(),
      },
    },
  };

  if (!probe) {
    log.info('health.response', { ms: Date.now() - startedAt });
    return NextResponse.json(base, { status: 200 });
  }

  const [bright, serp, ai, dbProbe, dbSchemaProbe] = await Promise.allSettled([
    probeBrightData(),
    probeBrightDataSerp(),
    probeAI(),
    probeDb(),
    probeDbSchema(),
  ]);

  const probes = {
    brightdata: bright.status === 'fulfilled' ? bright.value : { ok: false, error: String(bright.reason) },
    brightdataSerp: serp.status === 'fulfilled' ? serp.value : { ok: false, error: String(serp.reason) },
    ai: ai.status === 'fulfilled' ? ai.value : { ok: false, error: String(ai.reason) },
    db: dbProbe.status === 'fulfilled' ? dbProbe.value : { ok: false, error: String(dbProbe.reason) },
    dbSchema: dbSchemaProbe.status === 'fulfilled' ? dbSchemaProbe.value : { ok: false, error: String(dbSchemaProbe.reason) },
  };

  const ok = Boolean(
    (probes.brightdata as ProbeStatus).ok &&
      (probes.brightdataSerp as ProbeStatus).ok &&
      (probes.ai as ProbeStatus).ok &&
      (probes.db as ProbeStatus).ok &&
      (probes.dbSchema as ProbeStatus).ok,
  );

  log.info('health.probe', { ok, probes, ms: Date.now() - startedAt });

  return NextResponse.json(
    {
      ...base,
      ok,
      probes,
    },
    { status: ok ? 200 : 503 },
  );
}
