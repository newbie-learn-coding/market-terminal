import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

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

      <ShareBar
        url={pageUrl}
        title={`${session.topic} — Market Signal Report`}
        topic={session.topic}
      />
    </main>
  );
}
