'use client';

import { useCallback, useId, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Activity, ExternalLink, RefreshCw } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type PriceScaleMode = 'price' | 'indexed';

type PriceResponse = {
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

type EvidenceItem = {
  id: string;
  publishedAt: number;
  title: string;
};

const sparkNumberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function formatSparkValue(value: number, mode: PriceScaleMode): string {
  if (!Number.isFinite(value)) return '--';
  if (mode === 'indexed') return value.toFixed(2);
  const abs = Math.abs(value);
  if (abs >= 1000) return sparkNumberFmt.format(value);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function toIndexedSeries(values: number[]): number[] {
  if (!values.length) return [];
  const baseRaw = values[0] ?? 1;
  const base = Math.abs(baseRaw) > 1e-8 ? baseRaw : 1;
  return values.map((v) => Number(((v / base) * 100).toFixed(4)));
}

function alignSeriesForComparison({
  targetSize,
  targetTs,
  sourceValues,
  sourceTs,
}: {
  targetSize: number;
  targetTs?: number[];
  sourceValues: number[];
  sourceTs?: number[];
}): number[] {
  if (!targetSize || !sourceValues.length) return [];
  const sourceLast = sourceValues.length - 1;
  const at = (idx: number) => sourceValues[Math.max(0, Math.min(sourceLast, idx))]!;
  if (
    targetTs && targetTs.length === targetSize &&
    sourceTs && sourceTs.length === sourceValues.length &&
    targetSize > 0 && sourceValues.length > 0
  ) {
    const out: number[] = [];
    let j = 0;
    for (let i = 0; i < targetTs.length; i += 1) {
      const ts = targetTs[i]!;
      while (j + 1 < sourceTs.length && Math.abs(sourceTs[j + 1]! - ts) <= Math.abs(sourceTs[j]! - ts)) j += 1;
      out.push(at(j));
    }
    return out;
  }
  if (targetSize === 1) return [at(sourceLast)];
  const denom = Math.max(1, targetSize - 1);
  return Array.from({ length: targetSize }, (_, i) => {
    const ratio = i / denom;
    const idx = Math.round(ratio * sourceLast);
    return at(idx);
  });
}

function Sparkline({
  values,
  timestamps,
  markers,
  compareValues,
  compareTimestamps,
  scaleMode = 'price',
}: {
  values: number[];
  timestamps?: number[];
  markers?: { ts: number; label: string; tone?: 'blue' | 'orange' | 'teal' }[];
  compareValues?: number[];
  compareTimestamps?: number[];
  scaleMode?: PriceScaleMode;
}) {
  const w = 720;
  const h = 160;
  const pad = 12;
  const id = useId().replace(/:/g, '');

  const hasTs = Boolean(timestamps && timestamps.length === values.length && values.length > 0);
  const t0 = hasTs ? timestamps![0] : null;
  const t1 = hasTs ? timestamps![timestamps!.length - 1] : null;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const alignedCompareValues = useMemo(
    () =>
      compareValues?.length
        ? alignSeriesForComparison({
            targetSize: values.length,
            targetTs: hasTs ? timestamps : undefined,
            sourceValues: compareValues,
            sourceTs: compareTimestamps,
          })
        : [],
    [compareTimestamps, compareValues, hasTs, timestamps, values.length],
  );

  const baseValues = useMemo(() => (scaleMode === 'indexed' ? toIndexedSeries(values) : values), [scaleMode, values]);
  const compareSeries = useMemo(() => {
    if (!alignedCompareValues.length) return null;
    return scaleMode === 'indexed' ? toIndexedSeries(alignedCompareValues) : alignedCompareValues;
  }, [alignedCompareValues, scaleMode]);

  const scaleValues = useMemo(
    () => (compareSeries?.length ? [...baseValues, ...compareSeries] : baseValues),
    [baseValues, compareSeries],
  );
  const min = Math.min(...(scaleValues.length ? scaleValues : [0]));
  const max = Math.max(...(scaleValues.length ? scaleValues : [1]));
  const span = Math.max(1e-6, max - min);
  const mid = (min + max) / 2;

  const xForIndex = useCallback(
    (i: number) => {
      const denom = Math.max(1, baseValues.length - 1);
      return pad + (i / denom) * (w - pad * 2);
    },
    [baseValues.length],
  );

  const yForValue = useCallback(
    (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2),
    [min, span],
  );

  const d = baseValues
    .map((v, i) => {
      const x = xForIndex(i);
      const y = yForValue(v);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const compareD = compareSeries?.length
    ? compareSeries
        .map((v, i) => {
          const x = xForIndex(i);
          const y = yForValue(v);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ')
    : null;

  const hover = useMemo(() => {
    if (hoverIdx === null || !baseValues.length) return null;
    const i = Math.max(0, Math.min(baseValues.length - 1, hoverIdx));
    const v = baseValues[i]!;
    const compareV = compareSeries?.[i];
    const x = xForIndex(i);
    const y = yForValue(v);
    const compareY = typeof compareV === 'number' && Number.isFinite(compareV) ? yForValue(compareV) : null;
    return { i, v, x, y, compareV: compareV ?? null, compareY };
  }, [baseValues, compareSeries, hoverIdx, xForIndex, yForValue]);

  const markerXs = useMemo(() => {
    if (!hasTs || !t0 || !t1 || !markers?.length) return [];
    const denom = Math.max(1, t1 - t0);
    return markers
      .map((m) => {
        const r = Math.max(0, Math.min(1, (m.ts - t0) / denom));
        const x = pad + r * (w - pad * 2);
        const tone = m.tone ?? 'teal';
        const stroke =
          tone === 'blue' ? 'rgba(0,102,255,0.42)'
            : tone === 'orange' ? 'rgba(255,82,28,0.38)'
            : 'rgba(20,184,166,0.34)';
        return { x, stroke, label: m.label };
      })
      .filter((m) => Number.isFinite(m.x));
  }, [hasTs, markers, t0, t1]);

  const onMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * w;
      const pct = (x - pad) / (w - pad * 2);
      const idx = Math.round(pct * Math.max(1, baseValues.length - 1));
      setHoverIdx(Math.max(0, Math.min(Math.max(0, baseValues.length - 1), idx)));
    },
    [baseValues.length],
  );

  return (
    <svg
      viewBox={`0 0 ${w}  ${h}`}
      className="h-28 w-full"
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(0, 102, 255, 0.85)" />
          <stop offset="0.55" stopColor="rgba(255, 82, 28, 0.85)" />
          <stop offset="1" stopColor="rgba(20, 184, 166, 0.85)" />
        </linearGradient>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(0, 102, 255, 0.18)" />
          <stop offset="1" stopColor="rgba(0, 0, 0, 0)" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = pad + p * (h - pad * 2);
        return <line key={p} x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
      })}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => {
        const x = pad + p * (w - pad * 2);
        return <line key={p} y1={pad} y2={h - pad} x1={x} x2={x} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}

      {markerXs.slice(0, 10).map((m, idx) => (
        <line key={`${m.x}-${idx}`} x1={m.x} x2={m.x} y1={pad} y2={h - pad} stroke={m.stroke} strokeWidth="1" opacity="0.75" />
      ))}

      <text x={pad} y={pad + 10} fontSize="10" fill="rgba(255,255,255,0.45)">{formatSparkValue(max, scaleMode)}</text>
      <text x={pad} y={pad + (h - pad * 2) / 2 + 3} fontSize="10" fill="rgba(255,255,255,0.35)">{formatSparkValue(mid, scaleMode)}</text>
      <text x={pad} y={h - pad + 10} fontSize="10" fill="rgba(255,255,255,0.45)">{formatSparkValue(min, scaleMode)}</text>

      <path d={d} fill="none" stroke={`url(#line-${id})`} strokeWidth="2.35" />
      {compareD ? (
        <path d={compareD} fill="none" stroke="rgba(255, 188, 92, 0.86)" strokeWidth="1.65" strokeDasharray="5 4" />
      ) : null}
      <path d={`${d} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`} fill={`url(#fill-${id})`} opacity="0.92" />

      {hover ? (
        <g>
          <line x1={hover.x} x2={hover.x} y1={pad} y2={h - pad} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <line x1={pad} x2={w - pad} y1={hover.y} y2={hover.y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <circle cx={hover.x} cy={hover.y} r={4.2} fill="rgba(255,255,255,0.9)" />
          <circle cx={hover.x} cy={hover.y} r={7.5} fill="rgba(0,102,255,0.22)" />
          {hover.compareY !== null ? (
            <>
              <line x1={pad} x2={w - pad} y1={hover.compareY} y2={hover.compareY} stroke="rgba(255, 188, 92, 0.16)" strokeWidth="1" />
              <circle cx={hover.x} cy={hover.compareY} r={3.2} fill="rgba(255, 188, 92, 0.95)" />
            </>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

function normalizeTopicKey(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return '';
  if (/\b(btc|bitcoin)\b/.test(s)) return 'bitcoin';
  if (/\b(eth|ethereum)\b/.test(s)) return 'ethereum';
  if (/\b(sol|solana)\b/.test(s)) return 'solana';
  if (/\b(xau|gold)\b/.test(s)) return 'gold';
  if (/\b(wti|brent|oil)\b/.test(s)) return 'oil';
  if (/\b(dxy|dollar index)\b/.test(s)) return 'dxy';
  return s;
}

function tradingViewSymbolForTopic(topic: string): string {
  const key = normalizeTopicKey(topic);
  if (key === 'bitcoin') return 'BITSTAMP:BTCUSD';
  if (key === 'ethereum') return 'BITSTAMP:ETHUSD';
  if (key === 'solana') return 'BINANCE:SOLUSDT';
  if (key === 'gold') return 'OANDA:XAUUSD';
  if (key === 'oil') return 'TVC:USOIL';
  if (key === 'dxy') return 'TVC:DXY';
  const ticker = topic.trim().match(/\$?([A-Za-z]{1,10})\b/)?.[1];
  if (ticker) return ticker.toUpperCase();
  return topic.trim().toUpperCase().replace(/\s+/g, '');
}

const PRICE_COMPARE_PRESETS = [
  { label: 'BTC', topic: 'Bitcoin' },
  { label: 'ETH', topic: 'Ethereum' },
  { label: 'SOL', topic: 'Solana' },
  { label: 'XAU', topic: 'Gold' },
] as const;

export function PricePanel({
  session,
  price,
  priceLoading,
  priceScaleMode,
  priceCompareTopic,
  priceCompare,
  priceCompareLoading,
  evidence,
  onRefresh,
  onScaleModeChange,
  onCompareTopicChange,
}: {
  session: { topic: string; series: number[]; seriesTs: number[] } | null;
  price: PriceResponse | null;
  priceLoading: boolean;
  priceScaleMode: PriceScaleMode;
  priceCompareTopic: string | null;
  priceCompare: PriceResponse | null;
  priceCompareLoading: boolean;
  evidence: EvidenceItem[];
  onRefresh: () => void;
  onScaleModeChange: (m: PriceScaleMode) => void;
  onCompareTopicChange: (t: string | null) => void;
}) {
  const t = useTranslations('workspace');
  const isEmpty = !session;

  const comparePresets = useMemo(() => {
    const key = normalizeTopicKey(session?.topic || '');
    return PRICE_COMPARE_PRESETS.filter((p) => normalizeTopicKey(p.topic) !== key);
  }, [session?.topic]);

  const compareSeries = priceCompare?.series.length ? priceCompare.series : null;
  const compareTimestamps = priceCompare?.timestamps.length ? priceCompare.timestamps : undefined;

  const chartLinks = useMemo(() => {
    if (!session?.topic) return null;
    const clean = session.topic.trim();
    const tvSymbol = tradingViewSymbolForTopic(clean);
    return {
      tradingView: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`,
      google: `https://www.google.com/search?q=${encodeURIComponent(`${clean} price chart`)}`,
    };
  }, [session?.topic]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-white/80" />
          <div>
            <CardTitle>{t('priceTitle')}</CardTitle>
            <CardDescription>
              {priceScaleMode === 'indexed' ? t('priceIndexedMode') : t('priceMode')}
            </CardDescription>
          </div>
        </div>
        {session ? (
          <div className="flex flex-wrap items-center gap-2">
            {price ? <Badge variant={price.ok ? 'teal' : 'neutral'}>{price.ok ? t('live') : t('fallback')}</Badge> : null}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={priceLoading || (Boolean(priceCompareTopic) && priceCompareLoading)}
              className="border-white/12 bg-white/[0.03]"
            >
              <RefreshCw className={cn('h-4 w-4', priceLoading || priceCompareLoading ? 'animate-spin' : '')} />
              {t('refresh')}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-5">
        {isEmpty ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
            {t('runTopicForPrice')}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold text-white/88">
                {price?.ok ? `${price.symbol || session.topic} (USD)` : `${session.topic} (proxy)`}
              </div>
              <div className="text-xs text-white/55">
                {t('last')}{' '}
                <span className="mono text-white/80">
                  {session.series.length ? formatSparkValue(session.series[session.series.length - 1]!, 'price') : 'n/a'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-white/45">{t('scale')}</span>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 transition',
                    priceScaleMode === 'price' ? 'bg-white/10 text-white/85' : 'text-white/55 hover:text-white/75',
                  )}
                  onClick={() => onScaleModeChange('price')}
                >
                  {t('price')}
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 transition',
                    priceScaleMode === 'indexed' ? 'bg-white/10 text-white/85' : 'text-white/55 hover:text-white/75',
                  )}
                  onClick={() => onScaleModeChange('indexed')}
                >
                  {t('indexed')}
                </button>
              </div>
              <span className="ml-2 text-white/45">{t('compare')}</span>
              {comparePresets.map((preset) => {
                const selected = normalizeTopicKey(priceCompareTopic || '') === normalizeTopicKey(preset.topic);
                return (
                  <button
                    key={preset.topic}
                    type="button"
                    className={cn(
                      'rounded-full border px-2.5 py-1 transition',
                      selected
                        ? 'border-[rgba(255,188,92,0.45)] bg-[rgba(255,188,92,0.15)] text-[rgba(255,214,158,0.95)]'
                        : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white/80',
                    )}
                    onClick={() =>
                      onCompareTopicChange(
                        normalizeTopicKey(priceCompareTopic || '') === normalizeTopicKey(preset.topic) ? null : preset.topic,
                      )
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
              {priceCompareTopic ? (
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/60 transition hover:text-white/80"
                  onClick={() => onCompareTopicChange(null)}
                >
                  {t('clear')}
                </button>
              ) : null}
            </div>
            <Sparkline
              values={session.series}
              timestamps={session.seriesTs}
              markers={evidence.map((ev) => ({ ts: ev.publishedAt, label: ev.title, tone: 'teal' as const }))}
              compareValues={compareSeries || undefined}
              compareTimestamps={compareTimestamps}
              scaleMode={priceScaleMode}
            />
            {chartLinks ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <a
                  href={chartLinks.tradingView}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  TradingView
                </a>
                <a
                  href={chartLinks.google}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Google
                </a>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
