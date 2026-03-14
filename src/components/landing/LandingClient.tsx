'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Coins,
  DollarSign,
  Landmark,
  LayoutDashboard,
  LineChart,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

const LANDING_EXAMPLES = [
  'Why is BTC down today? Map catalysts from the last 6 hours',
  'NVDA post-earnings move: what evidence supports each narrative?',
  'DXY, yields, and crypto: what shifted since market open?',
  'Gold vs Bitcoin today: where is the strongest evidence?',
] as const;

export default function LandingClient() {
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
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <header className="sticky top-0 z-40">
        <div className="mx-auto max-w-[1280px] px-4 py-4">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(0,102,255,0.22)] via-transparent to-[rgba(120,196,255,0.14)] opacity-75" />
            <div className="relative flex items-center justify-between gap-3">
              <a
                href="https://brightdata.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3"
              >
                <img
                  src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/brightdata.svg`}
                  alt="Bright Data"
                  className="h-6 w-auto"
                />
                <span className="text-white/30 text-lg font-light">&times;</span>
                <img
                  src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/convex.svg`}
                  alt="Convex"
                  className="h-12 w-auto brightness-0 invert"
                />
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/74 transition hover:bg-white/[0.06]"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/74 transition hover:bg-white/[0.06]"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Architecture
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-4 pb-14 pt-14 sm:pt-20">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 sm:-inset-10">
            <TrendingUp className="finance-float absolute left-[4%] top-[8%] h-7 w-7 text-[rgba(120,196,255,0.35)]" style={{ animationDelay: '0.1s' }} />
            <DollarSign className="finance-float absolute left-[10%] top-[72%] h-6 w-6 text-[rgba(0,102,255,0.3)]" style={{ animationDelay: '0.8s' }} />
            <LineChart className="finance-float absolute right-[6%] top-[14%] h-7 w-7 text-[rgba(120,196,255,0.34)]" style={{ animationDelay: '0.3s' }} />
            <BarChart3 className="finance-float absolute right-[8%] top-[68%] h-6 w-6 text-[rgba(120,196,255,0.3)]" style={{ animationDelay: '1.2s' }} />
            <Coins className="finance-float absolute left-[42%] top-[2%] h-6 w-6 text-[rgba(0,102,255,0.26)]" style={{ animationDelay: '1.7s' }} />
            <Landmark className="finance-float absolute left-[45%] top-[80%] h-7 w-7 text-[rgba(182,220,255,0.3)]" style={{ animationDelay: '2.1s' }} />
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_40px_120px_-70px_var(--shadow)] backdrop-blur-2xl sm:p-9">
          <div className="panel-sheen absolute inset-0 rounded-[32px]" />
          <div className="relative text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(182,220,255,0.95)]">
              <Sparkles className="h-3.5 w-3.5" />
              Evidence-First Research
            </div>

            <h1 className="mt-5 text-3xl font-semibold leading-tight text-white/92 sm:text-5xl">
              Search the market.
              <br />
              Open the evidence map.
            </h1>
            <p className="mx-auto mt-4 max-w-[760px] text-sm text-white/66 sm:text-base">
              Start with one market question. We fetch live signals, build a linked evidence graph, and show the timeline behind each explanation.
            </p>

            <form
              className="mx-auto mt-7 max-w-[860px] rounded-2xl border border-white/12 bg-black/20 p-2 sm:p-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 sm:px-4">
                  <Search className="h-4 w-4 shrink-0 text-white/46" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={typedHint || 'Ask a market topic... BTC, NVDA, DXY, Oil, CPI'}
                    className="h-11 w-full border-0 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/42"
                    aria-label="Search topic"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] px-4 text-sm font-semibold text-[rgba(199,228,255,0.98)] transition hover:bg-[rgba(0,102,255,0.28)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Generate
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

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <LineChart className="h-3.5 w-3.5 text-[var(--blue)]" />
                  Live Pipeline
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {['Plan', 'Search', 'Link', 'Cluster'].map((step) => (
                    <span
                      key={step}
                      className="inline-flex h-6 items-center rounded-full border border-white/12 bg-white/[0.04] px-2 text-[10px] text-white/72"
                    >
                      {step}
                    </span>
                  ))}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-[var(--blue)] via-[rgba(120,196,255,0.95)] to-[rgba(170,209,255,0.95)]" />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <Search className="h-3.5 w-3.5 text-[var(--blue)]" />
                  Evidence Workspace
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {['Graph', 'Mind', 'Flow', 'Timeline'].map((view) => (
                    <span
                      key={view}
                      className="inline-flex h-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[10px] font-semibold text-white/75"
                    >
                      {view}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--blue)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[rgba(120,196,255,0.95)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[rgba(170,209,255,0.95)]" />
                  <span className="text-[10px] text-white/52">source &middot; event &middot; media</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <div className="inline-flex items-center justify-center gap-2 text-xs font-semibold tracking-[0.12em] text-white/48 uppercase">
                  <LayoutDashboard className="h-3.5 w-3.5 text-[var(--blue)]" />
                  Replay Snapshots
                </div>
                <div className="mt-3 space-y-2">
                  <div className="mx-auto h-7 w-[92%] rounded-lg border border-white/12 bg-white/[0.04]" />
                  <div className="mx-auto h-7 w-[78%] rounded-lg border border-white/12 bg-white/[0.03]" />
                  <div className="mx-auto h-7 w-[64%] rounded-lg border border-white/12 bg-white/[0.025]" />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-white/60">
                  <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5">snapshot-first</span>
                  <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5">no auto-rerun</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
