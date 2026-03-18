import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BookOpen, Sparkles } from 'lucide-react';

import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { PageContainer } from '@/components/layout/page-container';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { Card } from '@/components/ui/card';
import { ArchitectureDiagram } from '@/components/how/ArchitectureDiagram';

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex flex-col">
      <PageBackground />
      <SiteHeader />

      <main className="flex-1">
        <PageContainer size="wide" className="pb-14">
          <div className="flex flex-wrap items-center gap-2 py-6">
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

          <div className="grid gap-5">
            <ArchitectureDiagram />

            <Panel
              title="Architecture Notes"
              hint="Production intent for the current product shell"
              icon={<Sparkles className="h-4 w-4" />}
            >
              <div className="space-y-3 text-sm text-white/72">
                <Card className="p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/45">DATA LAYER</div>
                  <div className="mt-1">
                    Bright Data provides SERP and page extraction; AI reasoning uses only collected evidence.
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/45">ARTIFACT LAYER</div>
                  <div className="mt-1">
                    The run produces evidence, tape, graph links, and narrative clusters, then persists replay snapshots.
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/45">UI LAYER</div>
                  <div className="mt-1">
                    Map-first workspace with timeline and inspector, plus snapshot replay from dashboard history.
                  </div>
                </Card>
              </div>
            </Panel>
          </div>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}
