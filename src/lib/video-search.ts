import { brightDataSerpGoogle, type SerpResult } from '@/lib/brightdata';
import { buildCacheKey, getOrComputeCached } from '@/lib/server-cache';
import { normalizeProviderError, providerErrorFromStatus } from '@/lib/provider-error';

export type VideoItem = {
  id: string;
  title: string;
  url: string;
  channel: string;
  thumbnail: string;
  provider: 'YouTube';
};

export type VideosResponse = {
  topic: string;
  fetchedAt: number;
  mode: 'brightdata' | 'mock';
  items: VideoItem[];
  error?: string;
};

const VIDEOS_TTL_MS = 5 * 60_000;

function isVideoId(id: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

function canonicalYouTubeUrlFromId(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

function extractYouTubeVideoIdFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === 'www.youtube.com' && url.pathname === '/redirect') {
      const q = url.searchParams.get('q');
      if (q && /^https?:\/\//i.test(q)) return extractYouTubeVideoIdFromUrl(q);
    }
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').slice(0, 11);
      return isVideoId(id) ? id : null;
    }
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v') || '';
        return isVideoId(id) ? id : null;
      }
      const shorts = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/i)?.[1] || '';
      return isVideoId(shorts) ? shorts : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function uniqueSerp(results: SerpResult[], limit: number) {
  const seen = new Set<string>();
  const out: SerpResult[] = [];
  for (const r of results) {
    const key = r.url || '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchYouTubeOEmbed(url: string) {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const resp = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    throw providerErrorFromStatus('youtube', resp.status, `oEmbed failed (${resp.status})`);
  }
  return (await resp.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
}

export function mockItems(topic: string): VideoItem[] {
  const q = encodeURIComponent(`${topic} market news analysis`);
  const searchUrl = `https://www.youtube.com/results?search_query=${q}`;
  return [
    { id: 'mock_1', title: `Latest: ${topic} tape recap`, channel: 'Video Pulse' },
    { id: 'mock_2', title: `Explainer: what moved ${topic} today`, channel: 'Video Pulse' },
    { id: 'mock_3', title: `Cross-asset: ${topic} spillovers`, channel: 'Video Pulse' },
  ].map((v) => ({
    id: v.id,
    title: v.title,
    channel: v.channel,
    url: searchUrl,
    thumbnail: '',
    provider: 'YouTube',
  }));
}

export async function fetchVideosForTopic(topic: string, limit: number): Promise<VideosResponse> {
  const fetchedAt = Date.now();
  const cacheKey = buildCacheKey(['videos', topic.trim().toLowerCase(), limit]);

  return getOrComputeCached({
    key: cacheKey,
    ttlMs: VIDEOS_TTL_MS,
    loader: async () => {
      try {
        const queries = [
          `site:youtube.com/watch ${topic} market news analysis`,
          `site:youtube.com/watch ${topic} breaking news today`,
        ];

        let serp: SerpResult[] = [];
        for (const q of queries) {
          const results = await brightDataSerpGoogle({ query: q, format: 'light_json_google' });
          serp = serp.concat(results);
        }

        const picked = uniqueSerp(serp, Math.max(12, limit * 3));
        const ids = picked
          .map((r) => ({ id: extractYouTubeVideoIdFromUrl(r.url), title: r.title }))
          .filter((v): v is { id: string; title: string } => Boolean(v.id))
          .slice(0, limit);

        const settled = await Promise.allSettled(
          ids.map(async (v) => {
            const url = canonicalYouTubeUrlFromId(v.id);
            const meta = await fetchYouTubeOEmbed(url);
            return {
              id: v.id,
              title: meta.title || v.title || url,
              url,
              channel: meta.author_name || 'YouTube',
              thumbnail: meta.thumbnail_url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
              provider: 'YouTube' as const,
            } satisfies VideoItem;
          }),
        );

        const items = settled
          .filter((r): r is PromiseFulfilledResult<VideoItem> => r.status === 'fulfilled')
          .map((r) => r.value)
          .slice(0, limit);

        const ok = items.length > 0;
        return {
          topic,
          fetchedAt,
          mode: ok ? 'brightdata' : 'mock',
          items: ok ? items : mockItems(topic).slice(0, limit),
          ...(ok ? {} : { error: 'No YouTube items extracted from SERP; returning mock videos.' }),
        };
      } catch (e) {
        const err = normalizeProviderError('brightdata', e, 'Video discovery failed');
        return {
          topic,
          fetchedAt,
          mode: 'mock',
          items: mockItems(topic).slice(0, limit),
          error: err.message,
        };
      }
    },
  });
}
