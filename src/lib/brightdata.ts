import { brightDataSerpZone, env } from '@/lib/env';
import { getOrComputeCached, buildCacheKey } from '@/lib/server-cache';
import { normalizeProviderError, providerErrorFromStatus } from '@/lib/provider-error';

export type SerpResult = {
  title: string;
  url: string;
  snippet?: string;
};

const BRIGHTDATA_REQUEST_TTL_MS = 2 * 60_000;
const BRIGHTDATA_MARKDOWN_TTL_MS = 10 * 60_000;

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function brightDataRequestText(url: string, dataFormat?: string, zoneOverride?: string) {
  if (!env.brightdata.token) throw new Error('Bright Data token not configured');

  const zone = zoneOverride || env.brightdata.zone;
  const ttlMs = dataFormat === 'markdown' ? BRIGHTDATA_MARKDOWN_TTL_MS : BRIGHTDATA_REQUEST_TTL_MS;
  const cacheKey = buildCacheKey(['brightdata', zone, dataFormat || 'raw', url]);
  const body = JSON.stringify({
    url,
    zone,
    format: 'raw',
    ...(dataFormat ? { data_format: dataFormat } : null),
  });

  return getOrComputeCached({
    key: cacheKey,
    ttlMs,
    loader: async () => {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let resp: Response;
        let text = '';
        try {
          resp = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            cache: 'no-store',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${env.brightdata.token}`,
              'user-agent': 'market-terminal/request',
            },
            body,
          });
          text = await resp.text();
        } catch (e) {
          const err = normalizeProviderError('brightdata', e, 'Bright Data request failed');
          if (err.retryable && attempt < maxAttempts) {
            await sleepMs(250 * attempt + Math.random() * 220);
            continue;
          }
          throw err;
        }

        if (resp.ok) return text;

        const snippet = text.length > 900 ? `${text.slice(0, 900)}...` : text;
        const err = providerErrorFromStatus(
          'brightdata',
          resp.status,
          `Bright Data request failed (${resp.status}) zone=${zone} data_format=${dataFormat || 'none'}: ${snippet}`,
        );
        if (err.retryable && attempt < maxAttempts) {
          await sleepMs(320 * attempt * attempt + Math.random() * 260);
          continue;
        }

        throw err;
      }

      throw normalizeProviderError('brightdata', null, 'Bright Data request failed (unknown)');
    },
  });
}

export async function brightDataRequestMarkdown(url: string) {
  return brightDataRequestText(url, 'markdown');
}

export async function probeBrightDataMarkdown(url = 'https://example.com/') {
  const startedAt = Date.now();
  const text = await brightDataRequestText(url, 'markdown');
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    bytes: text.length,
  };
}

export function parseSerpMarkdown(md: string): SerpResult[] {
  // Common patterns:
  // - [Title](https://url) - snippet
  // - 1. [Title](https://url)\n   snippet
  const results: SerpResult[] = [];
  const seen = new Set<string>();

  const linkRe = /\[([^\]]{1,220})\]\((https?:\/\/[^)]+)\)/g;
  for (let m = linkRe.exec(md); m; m = linkRe.exec(md)) {
    const title = (m[1] || '').trim();
    const url = (m[2] || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const tail = md.slice(m.index + m[0].length, m.index + m[0].length + 240);
    const snippet = tail.replace(/^[\s\-–—:]+/, '').split('\n')[0]?.trim();

    results.push({ title, url, snippet: snippet || undefined });
  }

  return results;
}

export type SerpJsonFormat = 'light_json_google' | 'full_json_google' | 'parsed_bing' | 'markdown';

function normalizeSerpUrl(url: string) {
  try {
    const u = new URL(url);

    // Unwrap Google redirect URLs: https://www.google.com/url?...&url=<target>
    if (/(^|\.)google\./i.test(u.hostname) && u.pathname === '/url') {
      const target = u.searchParams.get('url') || u.searchParams.get('q') || '';
      if (target && /^https?:\/\//i.test(target)) {
        return normalizeSerpUrl(target);
      }
    }

    u.hash = '';
    // Strip common tracking params.
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((k) =>
      u.searchParams.delete(k),
    );
    return u.toString();
  } catch {
    return url;
  }
}

function asResults(items: Array<{ title?: unknown; url?: unknown; link?: unknown; snippet?: unknown; description?: unknown }>) {
  const out: SerpResult[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const url = normalizeSerpUrl(String(it.url || it.link || '').trim());
    if (!url || !url.startsWith('http')) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = String(it.title || '').trim() || url;
    const snippet = String(it.snippet || it.description || '').trim();
    out.push({ title, url, snippet: snippet || undefined });
  }
  return out;
}

type GenericResult = {
  title?: unknown;
  url?: unknown;
  link?: unknown;
  href?: unknown;
  name?: unknown;
  snippet?: unknown;
  description?: unknown;
  summary?: unknown;
};

export function parseSerpJson(raw: unknown): SerpResult[] {
  // We support multiple shapes defensively because Bright Data formats differ.
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;

  const fallbackDeepExtract = () => {
    // Last-resort: walk any object shape and collect anything that looks like a result.
    // This is important for verticals like `tbm=nws` which may not expose `organic_results`.
    const out: SerpResult[] = [];
    const seen = new Set<string>();

    const push = (title: string, url: string, snippet?: string) => {
      const norm = normalizeSerpUrl(String(url || '').trim());
      if (!norm || !norm.startsWith('http')) return;
      if (seen.has(norm)) return;
      seen.add(norm);

      const safeTitle = String(title || '').trim() || norm;
      const safeSnippet = String(snippet || '').trim();
      out.push({ title: safeTitle, url: norm, snippet: safeSnippet || undefined });
    };

    const stack: unknown[] = [raw];
    let steps = 0;
    while (stack.length && steps < 1800) {
      steps += 1;
      const cur = stack.pop();
      if (!cur) continue;

      if (Array.isArray(cur)) {
        for (const v of cur) stack.push(v);
        continue;
      }

      if (typeof cur !== 'object') continue;
      const o = cur as GenericResult & Record<string, unknown>;

      const url = o?.url || o?.link || o?.href;
      const title = o?.title || o?.name;
      const snippet = o?.snippet || o?.description || o?.summary;
      if (typeof url === 'string' && url.startsWith('http')) {
        push(typeof title === 'string' ? title : '', url, typeof snippet === 'string' ? snippet : undefined);
      }

      try {
        for (const v of Object.values(o)) stack.push(v);
      } catch {
        // ignore
      }
    }

    return out;
  };

  // Common: { organic_results: [{ title, link, snippet }] }
  if (Array.isArray(obj.organic_results)) return asResults(obj.organic_results);
  if (Array.isArray(obj.organic)) return asResults(obj.organic);
  if (Array.isArray(obj.news_results)) return asResults(obj.news_results);
  if (Array.isArray(obj.top_stories)) return asResults(obj.top_stories);
  if (Array.isArray(obj.stories)) return asResults(obj.stories);
  if (Array.isArray(obj.results)) return asResults(obj.results);

  // Sometimes: { results: { organic: [...] } }
  if (obj.results && typeof obj.results === 'object') {
    const resultsObj = obj.results as Record<string, unknown>;
    if (Array.isArray(resultsObj.organic)) return asResults(resultsObj.organic as GenericResult[]);
    if (Array.isArray(resultsObj.organic_results)) return asResults(resultsObj.organic_results as GenericResult[]);
    if (Array.isArray(resultsObj.news_results)) return asResults(resultsObj.news_results as GenericResult[]);
    if (Array.isArray(resultsObj.top_stories)) return asResults(resultsObj.top_stories as GenericResult[]);
  }

  // Sometimes: array of result objects
  if (Array.isArray(raw)) return asResults(raw as GenericResult[]);

  return fallbackDeepExtract();
}

export async function brightDataSerpGoogle({
  query,
  format = 'light_json_google',
  vertical = 'web',
  recency,
}: {
  query: string;
  format?: SerpJsonFormat;
  vertical?: 'web' | 'news';
  recency?: 'h' | 'd' | 'w' | 'm' | 'y' | '';
}): Promise<SerpResult[]> {
  const q = query.trim();
  if (!q) return [];

  const tbm = vertical === 'news' ? '&tbm=nws' : '';
  const tbs = recency ? `&tbs=qdr:${recency}` : '';
  const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=us&num=10${tbm}${tbs}`;

  // Preferred: structured JSON when available (fast + low-noise).
  // Fallback: markdown parsing (works everywhere, but noisier).
  const dataFormat =
    format === 'full_json_google' ? 'parsed' : format === 'light_json_google' ? 'parsed_light' : format === 'markdown' ? 'markdown' : 'markdown';

  const text = await brightDataRequestText(url, dataFormat, brightDataSerpZone());

  if (dataFormat !== 'markdown') {
    try {
      const parsed = JSON.parse(text);
      const results = parseSerpJson(parsed);
      if (results.length) return results;
    } catch {
      // ignore and fall back
    }
  }

  return parseSerpMarkdown(text);
}
