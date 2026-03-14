import { type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ToolSearchBox } from './ToolSearchBox';

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
}

export function ToolPageLayout({
  title,
  description,
  features,
  searchPlaceholder,
  exampleOutput,
  statsLine,
  jsonLd,
}: ToolPageLayoutProps) {
  return (
    <div className="min-h-screen">
      <div className="bg-terminal fixed inset-0 -z-20" />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-60" />

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      <header className="border-b border-white/8 bg-white/[0.02] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[980px] items-center gap-4 px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white/90"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <span className="text-white/20">/</span>
          <Link
            href="/tools"
            className="text-sm text-white/60 transition hover:text-white/90"
          >
            Tools
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-4 py-14 sm:py-20">
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
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--blue)]">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold text-white/88">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/52">
                {f.description}
              </p>
            </div>
          ))}
        </div>

        {/* Example Output */}
        <div className="mt-16">
          <h2 className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
            Example Output
          </h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-5 sm:p-6">
            {exampleOutput}
          </div>
        </div>

        {/* Stats */}
        <p className="mt-10 text-center text-xs text-white/40">{statsLine}</p>

        {/* CTA */}
        <div className="mt-14 text-center">
          <h2 className="text-xl font-semibold text-white/88 sm:text-2xl">
            Ready to analyze?
          </h2>
          <p className="mt-2 text-sm text-white/52">
            Enter any market topic and get evidence-backed insights in seconds.
          </p>
          <ToolSearchBox placeholder={searchPlaceholder} />
        </div>
      </main>
    </div>
  );
}
