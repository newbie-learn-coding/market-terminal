import { ImageResponse } from 'next/og';

import { getBySlug } from '@/lib/db';

export const runtime = 'nodejs';
export const alt = 'TrendAnalysis.ai Report';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;

  let topic = 'TrendAnalysis.ai Report';
  let date = '';
  let evidenceCount = 0;
  let nodeCount = 0;
  let clusterCount = 0;

  try {
    const session = await getBySlug(slug);
    if (session) {
      topic = session.topic;
      date = new Date(session._creationTime).toLocaleDateString(
        locale === 'zh' ? 'zh-CN' : locale === 'es' ? 'es-MX' : 'en-US',
        {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        },
      );
      const meta = (session.meta ?? {}) as Record<string, unknown>;
      const arts = (meta.artifacts ?? {}) as Record<string, unknown>;
      evidenceCount = Array.isArray(arts.evidence) ? arts.evidence.length : 0;
      nodeCount = Array.isArray(arts.nodes) ? arts.nodes.length : 0;
      clusterCount = Array.isArray(arts.clusters) ? arts.clusters.length : 0;
    }
  } catch {
    // fallback to defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          backgroundColor: '#0a0a0b',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '0.2em',
              color: '#0066ff',
              marginBottom: 16,
            }}
          >
            TRENDANALYSIS.AI
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.92)',
              lineHeight: 1.15,
              maxWidth: '900px',
            }}
          >
            {topic}
          </div>
          {date && (
            <div
              style={{
                fontSize: 20,
                color: 'rgba(255,255,255,0.45)',
                marginTop: 16,
              }}
            >
              {date}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { label: 'EVIDENCE', value: evidenceCount },
            { label: 'NODES', value: nodeCount },
            { label: 'CLUSTERS', value: clusterCount },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 32px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
