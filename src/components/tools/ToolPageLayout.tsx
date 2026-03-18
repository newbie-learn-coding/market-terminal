import { type ReactNode } from 'react';
import { ToolSearchBox } from './ToolSearchBox';

import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PageBackground } from '@/components/layout/page-background';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';

export interface ToolFeature {
  icon: ReactNode;
  title: string;
  description: string;
}

interface ToolPageLayoutProps {
  title: string;
  description: string;
  keywords: string[];
  features: ToolFeature[];
  searchPlaceholder: string;
  exampleOutput: ReactNode;
  statsLine: string;
  jsonLd?: Record<string, unknown>;
  ctaTitle?: string;
  ctaDesc?: string;
  exampleOutputLabel?: string;
}

export function ToolPageLayout({
  title,
  description,
  features,
  searchPlaceholder,
  exampleOutput,
  statsLine,
  jsonLd,
  ctaTitle = 'Ready to analyze?',
  ctaDesc = 'Enter any market topic and get evidence-backed insights in seconds.',
  exampleOutputLabel = 'Example Output',
}: ToolPageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <PageBackground />
      <SiteHeader />

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <main className="flex-1">
        <PageContainer className="py-14 sm:py-20">
          {/* Hero */}
          <div className="text-center">
            <h1 className="text-3xl font-semibold leading-tight text-white/92 sm:text-5xl">
              {title}
            </h1>
            <p className="mx-auto mt-4 max-w-[660px] text-sm text-white/60 sm:text-base">
              {description}
            </p>
            <ToolSearchBox placeholder={searchPlaceholder} />
          </div>

          {/* Features */}
          <div className="mt-16 grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <Card key={f.title} className="p-5">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--blue)]">
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-white/88">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-white/52">
                  {f.description}
                </p>
              </Card>
            ))}
          </div>

          {/* Example Output */}
          <div className="mt-16">
            <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              {exampleOutputLabel}
            </h2>
            <Card className="overflow-hidden p-5 sm:p-6">
              {exampleOutput}
            </Card>
          </div>

          {/* Stats */}
          <p className="mt-10 text-center text-xs text-white/40">{statsLine}</p>

          {/* CTA */}
          <div className="mt-14 text-center">
            <h2 className="text-xl font-semibold text-white/88 sm:text-2xl">
              {ctaTitle}
            </h2>
            <p className="mt-2 text-sm text-white/52">
              {ctaDesc}
            </p>
            <ToolSearchBox placeholder={searchPlaceholder} />
          </div>
        </PageContainer>
      </main>

      <SiteFooter />
    </div>
  );
}
