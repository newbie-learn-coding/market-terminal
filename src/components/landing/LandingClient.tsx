'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  FileText,
  GitBranch,
  LineChart,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';

const LANDING_EXAMPLES = [
  'How is AI disrupting the healthcare industry?',
  'NVDA earnings impact: what does the evidence show?',
  'Bitcoin vs Gold: which is trending stronger?',
  'What are the key signals in the EV market today?',
] as const;

const SENTIMENT_DOT: Record<string, string> = {
  bullish: 'bg-emerald-400',
  bearish: 'bg-red-400',
  mixed: 'bg-amber-400',
  neutral: 'bg-white/40',
};

type TrendingTopic = {
  assetKey: string;
  label: string;
  count: number;
  sentiment: string | null;
};

export default function LandingClient({ trendingTopics = [] }: { trendingTopics?: TrendingTopic[] }) {
  const router = useRouter();
  const t = useTranslations('landing');
  const tc = useTranslations('common');
  const [query, setQuery] = useState('');
  const [typedHint, setTypedHint] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const snapshotId = params.get('sessionId');
    if (snapshotId) {
      router.replace(`/terminal?sessionId=${encodeURIComponent(snapshotId)}`);
      return;
    }
    const legacyQuery = (params.get('q') || params.get('topic') || '').trim();
    if (legacyQuery) {
      router.replace(`/terminal?q=${encodeURIComponent(legacyQuery)}`);
    }
  }, [router]);

  useEffect(() => {
    if (query.trim()) {
      setTypedHint('');
      return;
    }

    let stopped = false;
    let timer: number | null = null;
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const schedule = (ms: number) => {
      timer = window.setTimeout(tick, ms);
    };

    const tick = () => {
      if (stopped) return;
      const phrase = LANDING_EXAMPLES[phraseIndex % LANDING_EXAMPLES.length];

      if (!deleting) {
        charIndex = Math.min(phrase.length, charIndex + 1);
        setTypedHint(phrase.slice(0, charIndex));
        if (charIndex === phrase.length) {
          deleting = true;
          schedule(1100);
          return;
        }
        schedule(30);
        return;
      }

      charIndex = Math.max(0, charIndex - 1);
      setTypedHint(phrase.slice(0, charIndex));
      if (charIndex === 0) {
        deleting = false;
        phraseIndex += 1;
        schedule(240);
        return;
      }
      schedule(18);
    };

    schedule(280);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [query]);

  const runSearch = () => {
    const cleaned = query.trim();
    if (!cleaned) return;
    router.push(`/terminal?q=${encodeURIComponent(cleaned)}&runAt=${Date.now()}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PageBackground />
      <SiteHeader />

      {/* Hero */}
      <main className="mx-auto max-w-[980px] px-4 pb-14 pt-14 sm:pt-20 flex-1">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 sm:-inset-10">
            <TrendingUp className="finance-float absolute left-[4%] top-[8%] h-7 w-7 text-[rgba(120,196,255,0.35)]" style={{ animationDelay: '0.1s' }} />
            <LineChart className="finance-float absolute right-[6%] top-[14%] h-7 w-7 text-[rgba(120,196,255,0.34)]" style={{ animationDelay: '0.3s' }} />
            <Activity className="finance-float absolute left-[10%] top-[72%] h-6 w-6 text-[rgba(0,102,255,0.3)]" style={{ animationDelay: '0.8s' }} />
            <BarChart3 className="finance-float absolute right-[8%] top-[68%] h-6 w-6 text-[rgba(120,196,255,0.3)]" style={{ animationDelay: '1.2s' }} />
          </div>

          <Card className="relative overflow-hidden rounded-[32px] p-8 sm:p-12 shadow-[0_40px_120px_-70px_rgba(0,0,0,0.55)]">
          <div className="panel-sheen absolute inset-0 rounded-[32px]" />
          <div className="relative text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(182,220,255,0.95)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t('badge')}
            </div>

            <h1 className="mt-5 text-3xl font-semibold leading-tight text-white/92 sm:text-5xl">
              {t('heroTitle1')}
              <br />
              {t('heroTitle2')}
            </h1>
            <p className="mx-auto mt-4 max-w-[760px] text-sm text-white/66 sm:text-base">
              {t('heroDesc')}
            </p>

            <form
              className="mx-auto mt-7 max-w-[860px] rounded-2xl border border-white/12 bg-black/20 p-2 sm:p-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white/[0.03] px-3 sm:px-4 transition-all ${query.trim() ? 'border-white/8' : 'border-[rgba(0,102,255,0.3)] shadow-[0_0_20px_-4px_rgba(0,102,255,0.25)]'}`}>
                  <Search className="h-4 w-4 shrink-0 text-white/46" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={typedHint || t('searchPlaceholder')}
                    className="h-11 w-full border-0 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/42"
                    aria-label="Search topic"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!query.trim()}
                  size="lg"
                  className="border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] text-[rgba(199,228,255,0.98)] hover:bg-[rgba(0,102,255,0.28)]"
                >
                  {tc('analyze')}
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {LANDING_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="inline-flex h-8 items-center rounded-full border border-white/12 bg-white/[0.03] px-3 text-xs text-white/66 transition hover:bg-white/[0.06] hover:text-white/84"
                  onClick={() => setQuery(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            {/* Trending Section */}
            {trendingTopics.length > 0 && (
              <div className="mt-6">
                <div className="mb-2.5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/48">
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--blue)]" />
                  {t('trendingNow')}
                  <Link
                    href="/trending"
                    className="ml-1 normal-case tracking-normal text-[var(--blue)] transition hover:text-white/80"
                  >
                    {tc('viewAll')} &rarr;
                  </Link>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {trendingTopics.map((tt) => (
                    <Link
                      key={tt.assetKey}
                      href={`/asset/${tt.assetKey}`}
                      className="inline-flex h-8 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3 text-xs text-white/66 transition hover:bg-white/[0.06] hover:text-white/84"
                    >
                      {tt.sentiment && (
                        <span className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[tt.sentiment] ?? SENTIMENT_DOT.neutral}`} />
                      )}
                      {tt.label.charAt(0).toUpperCase() + tt.label.slice(1)}
                      <span className="text-white/30">{tt.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Feature Cards */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Card className="p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <Zap className="h-3.5 w-3.5 text-[var(--blue)]" />
                  {t('realTimeIntel')}
                </div>
                <p className="mt-2 text-[11px] text-white/50">{t('realTimeIntelDesc')}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {[t('stepPlan'), t('stepSearch'), t('stepExtract'), t('stepAnalyze')].map((step) => (
                    <span
                      key={step}
                      className="inline-flex h-6 items-center rounded-full border border-white/12 bg-white/[0.04] px-2 text-[10px] text-white/72"
                    >
                      {step}
                    </span>
                  ))}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="pipeline-progress h-full rounded-full bg-gradient-to-r from-[var(--blue)] via-[rgba(120,196,255,0.95)] to-[rgba(170,209,255,0.95)]" />
                </div>
              </Card>

              <Card className="p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <GitBranch className="h-3.5 w-3.5 text-[var(--blue)]" />
                  {t('knowledgeGraphs')}
                </div>
                <p className="mt-2 text-[11px] text-white/50">{t('knowledgeGraphsDesc')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[t('viewGraph'), t('viewMindMap'), t('viewFlow'), t('viewTimeline')].map((view) => (
                    <span
                      key={view}
                      className="inline-flex h-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[10px] font-semibold text-white/75"
                    >
                      {view}
                    </span>
                  ))}
                </div>
              </Card>

              <Card className="p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <FileText className="h-3.5 w-3.5 text-[var(--blue)]" />
                  {t('publishedReports')}
                </div>
                <p className="mt-2 text-[11px] text-white/50">{t('publishedReportsDesc')}</p>
                <div className="mt-3 space-y-2">
                  <div className="mx-auto flex h-7 w-[92%] items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-[9px] text-white/50 truncate">Bitcoin Market Analysis</span>
                  </div>
                  <div className="mx-auto flex h-7 w-[92%] items-center gap-2 rounded-lg border border-white/12 bg-white/[0.03] px-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                    <span className="text-[9px] text-white/50 truncate">NVDA Earnings Impact</span>
                  </div>
                  <div className="mx-auto flex h-7 w-[92%] items-center gap-2 rounded-lg border border-white/12 bg-white/[0.025] px-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]" />
                    <span className="text-[9px] text-white/50 truncate">AI Healthcare Trends</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
