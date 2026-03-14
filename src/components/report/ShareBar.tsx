'use client';

import { useState } from 'react';
import Link from 'next/link';

export function ShareBar({
  url,
  title,
  topic,
}: {
  url: string;
  title: string;
  topic: string;
}) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedTopic = encodeURIComponent(topic);

  const twitterHref = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  const redditHref = `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`;
  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-white/50">SHARE</span>
          <a
            href={twitterHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70 transition hover:bg-white/[0.08]"
          >
            Twitter
          </a>
          <a
            href={redditHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70 transition hover:bg-white/[0.08]"
          >
            Reddit
          </a>
          <a
            href={linkedinHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70 transition hover:bg-white/[0.08]"
          >
            LinkedIn
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70 transition hover:bg-white/[0.08]"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        <Link
          href="/terminal"
          className="inline-flex h-9 items-center rounded-full border border-[rgba(0,102,255,0.45)] bg-[rgba(0,102,255,0.14)] px-4 text-sm font-semibold text-[rgba(180,214,255,0.95)] transition hover:bg-[rgba(0,102,255,0.22)]"
        >
          Analyze {topic || 'your asset'}
        </Link>
      </div>
    </section>
  );
}
