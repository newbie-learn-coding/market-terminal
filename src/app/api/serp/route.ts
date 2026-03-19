import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasBrightData } from '@/lib/env';
import { brightDataSerpGoogle } from '@/lib/brightdata';
import { createLogger } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Recency = 'h' | 'd' | 'w' | 'm' | 'y' | '';

const QuerySchema = z.object({
  q: z.string().min(2),
  format: z.enum(['light', 'full', 'markdown']).optional(),
  vertical: z.enum(['web', 'news']).optional(),
  recency: z.enum(['h', 'd', 'w', 'm', 'y']).optional(),
});

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/serp' });
  const startedAt = Date.now();

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get('q') || url.searchParams.get('query') || '',
    format: url.searchParams.get('format') || undefined,
    vertical: url.searchParams.get('vertical') || undefined,
    recency: url.searchParams.get('recency') || undefined,
  });

  if (!parsed.success) {
    log.warn('serp.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'Missing or invalid ?q=' }, { status: 400 });
  }

  if (!hasBrightData()) {
    log.warn('serp.missing_brightdata', { ms: Date.now() - startedAt });
    return NextResponse.json(
      { error: 'BRIGHTDATA_API_TOKEN not configured' },
      { status: 400 },
    );
  }

  const format = parsed.data.format || 'light';
  const vertical = parsed.data.vertical || 'web';
  const recency: Recency = parsed.data.recency || '';
  log.info('serp.request', { format, vertical, recency, q: parsed.data.q.slice(0, 120) });
  const results = await brightDataSerpGoogle({
    query: parsed.data.q,
    format: format === 'full' ? 'full_json_google' : format === 'markdown' ? 'markdown' : 'light_json_google',
    vertical,
    recency,
  });

  log.info('serp.response', { count: results.length, ms: Date.now() - startedAt });
  return NextResponse.json({
    q: parsed.data.q,
    format,
    vertical,
    recency,
    count: results.length,
    results,
  });
}
