'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  FileText,
  GitBranch,
  LayoutDashboard,
  LineChart,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

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
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className="mx-auto max-w-[1280px] px-4 py-4">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(0,102,255,0.22)] via-transparent to-[rgba(120,196,255,0.14)] opacity-75" />
            <div className="relative flex items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-0 shrink-0">
                <span className="text-lg font-bold tracking-tight text-white/92">TrendAnalysis</span>
                <span className="text-lg font-bold tracking-tight text-[var(--blue)]">.ai</span>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/trending"
                  className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/74 transition hover:bg-white/[0.06]"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Trending
                </Link>
                <Link
                  href="/tools"
                  className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/74 transition hover:bg-white/[0.06]"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Tools
                </Link>
                <Link
                  href="/asset"
                  className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/74 transition hover:bg-white/[0.06]"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Reports
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/50 transition hover:bg-white/[0.06] hover:text-white/74"
                  title="Dashboard"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-[980px] px-4 pb-14 pt-14 sm:pt-20 flex-1">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 sm:-inset-10">
            <TrendingUp className="finance-float absolute left-[4%] top-[8%] h-7 w-7 text-[rgba(120,196,255,0.35)]" style={{ animationDelay: '0.1s' }} />
            <LineChart className="finance-float absolute right-[6%] top-[14%] h-7 w-7 text-[rgba(120,196,255,0.34)]" style={{ animationDelay: '0.3s' }} />
            <Activity className="finance-float absolute left-[10%] top-[72%] h-6 w-6 text-[rgba(0,102,255,0.3)]" style={{ animationDelay: '0.8s' }} />
            <BarChart3 className="finance-float absolute right-[8%] top-[68%] h-6 w-6 text-[rgba(120,196,255,0.3)]" style={{ animationDelay: '1.2s' }} />
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_40px_120px_-70px_var(--shadow)] backdrop-blur-2xl sm:p-9">
          <div className="panel-sheen absolute inset-0 rounded-[32px]" />
          <div className="relative text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(182,220,255,0.95)]">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Trend Analysis
            </div>

            <h1 className="mt-5 text-3xl font-semibold leading-tight text-white/92 sm:text-5xl">
              Analyze trends.
              <br />
              See the evidence.
            </h1>
            <p className="mx-auto mt-4 max-w-[760px] text-sm text-white/66 sm:text-base">
              Ask any market question. Get real-time data, AI-powered knowledge graphs, and evidence-backed insights in seconds.
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
                    placeholder={typedHint || 'Ask any trend question... AI, markets, crypto, tech'}
                    className="h-11 w-full border-0 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/42"
                    aria-label="Search topic"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] px-4 text-sm font-semibold text-[rgba(199,228,255,0.98)] transition hover:bg-[rgba(0,102,255,0.28)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Analyze
                  <ArrowUpRight className="h-4 w-4" />
                </button>
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
                  Trending Now
                  <Link
                    href="/trending"
                    className="ml-1 normal-case tracking-normal text-[var(--blue)] transition hover:text-white/80"
                  >
                    View all &rarr;
                  </Link>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {trendingTopics.map((t) => (
                    <Link
                      key={t.assetKey}
                      href={`/asset/${t.assetKey}`}
                      className="inline-flex h-8 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3 text-xs text-white/66 transition hover:bg-white/[0.06] hover:text-white/84"
                    >
                      {t.sentiment && (
                        <span className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[t.sentiment] ?? SENTIMENT_DOT.neutral}`} />
                      )}
                      {t.label.charAt(0).toUpperCase() + t.label.slice(1)}
                      <span className="text-white/30">{t.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Feature Cards */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {/* Real-Time Intelligence */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <Zap className="h-3.5 w-3.5 text-[var(--blue)]" />
                  Real-Time Intelligence
                </div>
                <p className="mt-2 text-[11px] text-white/50">Live data from 10+ sources analyzed in seconds</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {['Plan', 'Search', 'Extract', 'Analyze'].map((step, i) => (
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
              </div>

              {/* Knowledge Graphs */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <GitBranch className="h-3.5 w-3.5 text-[var(--blue)]" />
                  Knowledge Graphs
                </div>
                <p className="mt-2 text-[11px] text-white/50">Interactive visualizations of connected insights</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {['Graph', 'Mind Map', 'Flow', 'Timeline'].map((view) => (
                    <span
                      key={view}
                      className="inline-flex h-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[10px] font-semibold text-white/75"
                    >
                      {view}
                    </span>
                  ))}
                </div>
              </div>

              {/* Published Reports */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <FileText className="h-3.5 w-3.5 text-[var(--blue)]" />
                  Published Reports
                </div>
                <p className="mt-2 text-[11px] text-white/50">Share and publish analysis with permanent links</p>
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
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 py-6">
        <div className="mx-auto max-w-[980px] px-4 text-center">
          <div className="text-xs text-white/40">
            <span className="font-semibold text-white/60">trendanalysis.ai</span>
            <span className="mx-2">&middot;</span>
            AI-powered trend analysis
          </div>
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-white/36">
            <Link href="/tools" className="transition hover:text-white/60">Tools</Link>
            <Link href="/trending" className="transition hover:text-white/60">Trending</Link>
            <Link href="/asset" className="transition hover:text-white/60">Reports</Link>
            <Link href="/dashboard" className="transition hover:text-white/60">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
