import { NextResponse } from 'next/server';
import { fetchTopicPrice } from '@/lib/market-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || url.searchParams.get('symbol') || 'Bitcoin';
  const data = await fetchTopicPrice(topic);
  return NextResponse.json(data, { status: 200 });
}
