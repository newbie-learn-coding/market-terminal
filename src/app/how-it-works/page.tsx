import Link from 'next/link';
import { ArrowLeft, BookOpen, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { ArchitectureDiagram } from '@/components/how/ArchitectureDiagram';

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-10" />

      <header className="sticky top-0 z-40">
        <div className="mx-auto max-w-[1520px] px-4 py-3">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(0,102,255,0.16)] via-transparent to-[rgba(255,82,28,0.12)] opacity-70" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/terminal"
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Terminal
                </Link>
                <div className="hidden h-9 w-px bg-white/10 sm:block" />
                <div>
                  <div className="text-xs font-semibold tracking-[0.22em] text-white/50">TRENDANALYSIS.AI</div>
                  <div className="text-lg font-semibold text-white/90">Architecture</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue" className="mono">
                  evidence-first
                </Badge>
                <Badge tone="teal" className="mono">
                  traceable
                </Badge>
                <a
                  href="https://docs.brightdata.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06]"
                >
                  <BookOpen className="h-4 w-4" />
                  Bright Data docs
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1520px] px-4 pb-14">
        <div className="grid gap-5">
          <ArchitectureDiagram />

          <Panel
            title="Architecture Notes"
            hint="Production intent for the current product shell"
            icon={<Sparkles className="h-4 w-4" />}
          >
            <div className="space-y-3 text-sm text-white/72">
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/45">DATA LAYER</div>
                <div className="mt-1">
                  Bright Data provides SERP and page extraction; AI reasoning uses only collected evidence.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/45">ARTIFACT LAYER</div>
                <div className="mt-1">
                  The run produces evidence, tape, graph links, and narrative clusters, then persists replay snapshots.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/45">UI LAYER</div>
                <div className="mt-1">
                  Map-first workspace with timeline and inspector, plus snapshot replay from dashboard history.
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
