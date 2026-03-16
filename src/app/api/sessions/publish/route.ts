import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hasDb, getSession, publishSession } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PublishSchema = z.object({
  sessionId: z.string().min(1),
});

const ASSET_ALIASES: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  xau: 'gold',
  gold: 'gold',
  dxy: 'dxy',
  nvda: 'nvda',
  aapl: 'aapl',
  tsla: 'tsla',
  msft: 'msft',
  goog: 'goog',
  amzn: 'amzn',
  meta: 'meta',
  oil: 'oil',
  'crude oil': 'oil',
  spy: 'spy',
  qqq: 'qqq',
};

function normalizeAssetKey(topic: string): string {
  const cleaned = topic.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  return ASSET_ALIASES[cleaned] ?? cleaned.replace(/\s+/g, '-').slice(0, 48);
}

function generateSlug(topic: string, sessionId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const key = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const short = sessionId.slice(0, 4);
  return `${key}-${date}-${short}`;
}

export async function POST(request: Request) {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const body = await request.json();
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.status !== 'ready') {
    return NextResponse.json({ error: 'Session is not ready' }, { status: 400 });
  }
  if (session.published && session.slug) {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    return NextResponse.json({
      slug: session.slug,
      url: `${basePath}/report/${session.slug}`,
      alreadyPublished: true,
    });
  }

  const slug = generateSlug(session.topic, sessionId);
  const assetKey = normalizeAssetKey(session.topic);

  await publishSession(sessionId, slug, assetKey);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return NextResponse.json({
    slug,
    url: `${basePath}/report/${slug}`,
  });
}
