import { buildCacheKey, getOrComputeCached } from '@/lib/server-cache';
import { normalizeProviderError, providerErrorFromStatus } from '@/lib/provider-error';

export type TopicPriceResponse = {
  ok: boolean;
  topic: string;
  symbol?: string;
  provider: string;
  fetchedAt: number;
  series: number[];
  timestamps: number[];
  last?: number | null;
  error?: string;
};

type CoinGeckoResponse = {
  prices?: Array<[number, number]>;
};

const PRICE_TTL_MS = 45_000;

export function normalizePriceTopic(raw: string) {
  const s = (raw || '').trim();
  const lower = s.toLowerCase();

  if (/\b(btc|bitcoin)\b/.test(lower)) return { id: 'bitcoin', label: 'BTC' };
  if (/\b(eth|ethereum)\b/.test(lower)) return { id: 'ethereum', label: 'ETH' };
  if (/\b(sol|solana)\b/.test(lower)) return { id: 'solana', label: 'SOL' };
  if (/\b(xau|gold)\b/.test(lower)) return { id: 'pax-gold', label: 'XAU (proxy)' };
  return null;
}

export async function fetchTopicPrice(topic: string): Promise<TopicPriceResponse> {
  const norm = normalizePriceTopic(topic);
  if (!norm) {
    return {
      ok: false,
      topic,
      provider: 'unsupported',
      fetchedAt: Date.now(),
      series: [],
      timestamps: [],
      error: 'No live price provider mapped for this topic yet.',
    };
  }

  const cacheKey = buildCacheKey(['coingecko', norm.id, 'usd', '1d']);
  return getOrComputeCached({
    key: cacheKey,
    ttlMs: PRICE_TTL_MS,
    loader: async () => {
      const cgUrl = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(norm.id)}/market_chart?vs_currency=usd&days=1`;
      try {
        const resp = await fetch(cgUrl, {
          cache: 'no-store',
          headers: {
            'user-agent': 'market-terminal/price',
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw providerErrorFromStatus(
            'coingecko',
            resp.status,
            text ? `CoinGecko error (${resp.status}): ${text.slice(0, 240)}` : `CoinGecko error (${resp.status})`,
          );
        }

        const data = (await resp.json().catch(() => null)) as CoinGeckoResponse | null;
        const prices: Array<[number, number]> = Array.isArray(data?.prices) ? data.prices : [];
        const timestamps = prices.map((p) => Number(p?.[0])).filter((n) => Number.isFinite(n));
        const series = prices.map((p) => Number(p?.[1])).filter((n) => Number.isFinite(n));

        return {
          ok: Boolean(series.length),
          topic,
          symbol: norm.label,
          provider: 'coingecko',
          fetchedAt: Date.now(),
          series,
          timestamps,
          last: series.length ? series[series.length - 1] : null,
        };
      } catch (e) {
        const err = normalizeProviderError('coingecko', e, 'Price fetch failed');
        return {
          ok: false,
          topic,
          provider: 'coingecko',
          fetchedAt: Date.now(),
          series: [],
          timestamps: [],
          error: err.message,
        };
      }
    },
  });
}
