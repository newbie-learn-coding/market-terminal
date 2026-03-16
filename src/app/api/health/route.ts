import { NextResponse } from 'next/server';

import { brightDataSerpZone, env, hasBrightData, hasDb } from '@/lib/env';
import { createAIClient, getAIConfig } from '@/lib/ai';
import { brightDataSerpGoogle } from '@/lib/brightdata';
import { probeDb } from '@/lib/db';
import { createLogger, maskSecret } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function probeBrightData() {
  const token = env.brightdata.token;
  if (!token) return { ok: false, error: 'missing-token' as const };

  const startedAt = Date.now();
  const zone = env.brightdata.zone;
  const resp = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'user-agent': 'market-terminal/health',
    },
    body: JSON.stringify({
      url: 'https://example.com/',
      zone,
      format: 'raw',
      data_format: 'markdown',
    }),
  });

  const text = await resp.text();
  const latencyMs = Date.now() - startedAt;
  if (!resp.ok) {
    return {
      ok: false,
      latencyMs,
      status: resp.status,
      error: text.slice(0, 240),
    };
  }

  return {
    ok: true,
    latencyMs,
    bytes: text.length,
  };
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
  const client = createAIClient(cfg);
  const res = await client.chat.completions.create({
    model: cfg.model,
    temperature: 0,
    max_tokens: 24,
    messages: [
      { role: 'system', content: 'Return a single word: ok' },
      { role: 'user', content: 'Health check.' },
    ],
  });
  const latencyMs = Date.now() - startedAt;
  const content = res.choices?.[0]?.message?.content?.trim() || '';

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

  const [bright, serp, ai, dbProbe] = await Promise.allSettled([
    probeBrightData(),
    probeBrightDataSerp(),
    probeAI(),
    probeDb(),
  ]);

  const probes = {
    brightdata: bright.status === 'fulfilled' ? bright.value : { ok: false, error: String(bright.reason) },
    brightdataSerp: serp.status === 'fulfilled' ? serp.value : { ok: false, error: String(serp.reason) },
    ai: ai.status === 'fulfilled' ? ai.value : { ok: false, error: String(ai.reason) },
    db: dbProbe.status === 'fulfilled' ? dbProbe.value : { ok: false, error: String(dbProbe.reason) },
  };

  const ok = Boolean(
    (probes.brightdata as any).ok &&
      (probes.brightdataSerp as any).ok &&
      (probes.ai as any).ok &&
      (probes.db as any).ok,
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
