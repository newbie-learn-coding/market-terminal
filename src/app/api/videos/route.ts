import { NextResponse } from 'next/server';

import { brightDataSerpZone, env } from '@/lib/env';
import { createLogger } from '@/lib/log';
import { fetchVideosForTopic, mockItems, type VideosResponse } from '@/lib/video-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const reqId = crypto.randomUUID();
  const log = createLogger({ reqId, route: '/api/videos' });
  const startedAt = Date.now();

  const url = new URL(request.url);
  const topic = (url.searchParams.get('topic') || url.searchParams.get('q') || '').trim();
  if (!topic) {
    log.warn('videos.bad_request', { ms: Date.now() - startedAt });
    return NextResponse.json(
      { error: 'Missing ?topic=' },
      { status: 400 },
    );
  }

  const token = env.brightdata.token;
  const zone = brightDataSerpZone();

  const fetchedAt = Date.now();
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(8, rawLimit)) : 6;

  if (!token) {
    const payload: VideosResponse = {
      topic,
      fetchedAt,
      mode: 'mock',
      items: mockItems(topic).slice(0, limit),
      error: 'BRIGHTDATA_API_TOKEN (or API_TOKEN) not set; returning mock videos.',
    };
    log.warn('videos.mock', { topic: topic.slice(0, 80), limit, ms: Date.now() - startedAt });
    return NextResponse.json(payload, { status: 200 });
  }

  try {
    log.info('videos.request', { topic: topic.slice(0, 80), limit, zone });
    const payload = await fetchVideosForTopic(topic, limit);
    log.info('videos.response', { mode: payload.mode, count: payload.items.length, ms: Date.now() - startedAt });
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const payload: VideosResponse = {
      topic,
      fetchedAt,
      mode: 'mock',
      items: mockItems(topic).slice(0, limit),
      error: message,
    };
    log.error('videos.error', { message, ms: Date.now() - startedAt });
    return NextResponse.json(payload, { status: 200 });
  }
}
