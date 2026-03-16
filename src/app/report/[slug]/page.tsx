import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getConvexClient, api } from '@/lib/convex/server';
import { ReportHeader } from '@/components/report/ReportHeader';
import { StaticMindMap } from '@/components/report/StaticMindMap';
import { ClustersSummary } from '@/components/report/ClustersSummary';
import { StaticTimeline } from '@/components/report/StaticTimeline';
import { EvidenceList } from '@/components/report/EvidenceList';
import { ShareBar } from '@/components/report/ShareBar';

type Props = {
  params: Promise<{ slug: string }>;
};

async function getSession(slug: string) {
  const convex = getConvexClient();
  if (!convex) return null;
  return await convex.query(api.sessions.getBySlug, { slug });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const session = await getSession(slug);
  if (!session) return { title: 'Report not found' };

  const topic = session.topic;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const arts = ((session.meta as Record<string, unknown>)?.artifacts ?? {}) as Record<string, unknown>;
  const evCount = Array.isArray(arts.evidence) ? arts.evidence.length : 0;
  const description = `Market signal analysis for ${topic} — evidence-backed research with ${evCount} sources.`;

  return {
    title: `${topic} — Market Signal Report`,
    description,
    openGraph: {
      title: `${topic} — Market Signal Report`,
      description,
      type: 'article',
      url: `${basePath}/report/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${topic} — Market Signal Report`,
      description,
    },
  };
}

export default async function ReportPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession(slug);
  if (!session || !session.published) notFound();

  const meta = (session.meta ?? {}) as Record<string, unknown>;
  const artifacts = (meta.artifacts ?? {}) as Record<string, unknown>;
  const evidence = (artifacts.evidence as { id: string; title: string; url: string; source: string; publishedAt: number; observedAt: number; timeKind: 'published' | 'observed'; excerpt?: string; aiSummary?: { bullets: string[]; entities?: string[]; catalysts?: string[]; sentiment?: 'bullish' | 'bearish' | 'mixed' | 'neutral'; confidence?: number } }[]) ?? [];
  const tape = (artifacts.tape as { id: string; title: string; source: string; publishedAt: number; tags: string[]; evidenceId: string }[]) ?? [];
  const nodes = (artifacts.nodes as { id: string; type: 'asset' | 'event' | 'entity' | 'source' | 'media'; label: string; meta?: Record<string, unknown> }[]) ?? [];
  const edges = (artifacts.edges as { id: string; from: string; to: string; type: 'mentions' | 'co_moves' | 'hypothesis' | 'same_story'; confidence: number; evidenceIds: string[]; rationale?: string }[]) ?? [];
  const clusters = (artifacts.clusters as { id: string; title: string; summary: string; momentum: 'rising' | 'steady' | 'fading'; evidenceIds: string[]; related: string[] }[]) ?? [];

  const mode = (meta.mode as 'fast' | 'deep') ?? 'fast';
  const createdAt = session._creationTime;
  const date = new Date(createdAt).toISOString();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const pageUrl = `${basePath}/report/${slug}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetKey = (session as any).assetKey as string | undefined;
  const assetLabel = assetKey
    ? decodeURIComponent(assetKey).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  // Fetch related reports for the same asset
  let relatedReports: { slug: string; topic: string; date: number }[] = [];
  if (assetKey) {
    const convex = getConvexClient();
    if (convex) {
      try {
        const siblings = await convex.query(api.sessions.listByAsset, { assetKey, limit: 4 });
        relatedReports = siblings
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((s: any) => s.slug && s.slug !== slug)
          .slice(0, 3)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => ({ slug: s.slug, topic: s.topic, date: s._creationTime }));
      } catch {
        // Non-critical — skip related reports
      }
    }
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${session.topic} — Market Signal Report`,
    datePublished: date,
    description: `Market signal analysis for ${session.topic} with ${evidence.length} evidence sources.`,
    author: {
      '@type': 'Organization',
      name: 'Bright Data Signal Terminal',
    },
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-white/50">
        <Link href="/" className="transition hover:text-white/70">Home</Link>
        <span>&rsaquo;</span>
        {assetKey && assetLabel ? (
          <>
            <Link href={`/asset/${assetKey}`} className="transition hover:text-white/70">{assetLabel}</Link>
            <span>&rsaquo;</span>
          </>
        ) : null}
        <span className="text-white/35">Report</span>
      </nav>

      <ReportHeader
        topic={session.topic}
        date={date}
        mode={mode}
        stats={{
          evidence: evidence.length,
          nodes: nodes.length,
          edges: edges.length,
          clusters: clusters.length,
        }}
      />

      {nodes.length > 0 && (
        <StaticMindMap topic={session.topic} nodes={nodes} edges={edges} />
      )}

      {clusters.length > 0 && <ClustersSummary clusters={clusters} />}

      {tape.length > 0 && <StaticTimeline items={tape} />}

      <EvidenceList evidence={evidence} />

      {/* Related reports for same asset */}
      {assetKey && assetLabel && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">More {assetLabel} Analyses</h3>
            <Link
              href={`/asset/${assetKey}`}
              className="text-xs text-[rgba(120,196,255,0.85)] transition hover:text-white/80"
            >
              View all &rarr;
            </Link>
          </div>
          {relatedReports.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {relatedReports.map((r) => (
                <Link
                  key={r.slug}
                  href={`/report/${r.slug}`}
                  className="rounded-xl border border-white/8 bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.04]"
                >
                  <div className="text-xs font-medium text-white/75">{r.topic}</div>
                  <div className="mt-1 text-[10px] text-white/40">{new Date(r.date).toLocaleDateString()}</div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-white/40">This is the only analysis for this asset so far.</p>
          )}
        </section>
      )}

      <ShareBar
        url={pageUrl}
        title={`${session.topic} — Market Signal Report`}
        topic={session.topic}
      />
    </main>
  );
}
