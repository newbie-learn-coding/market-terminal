'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';

export function ShareBar({
  url,
  title,
  topic,
}: {
  url: string;
  title: string;
  topic: string;
}) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

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
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-white/50">{t('share').toUpperCase()}</span>
          <Button variant="outline" size="sm" asChild>
            <a href={twitterHref} target="_blank" rel="noopener noreferrer">
              Twitter
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={redditHref} target="_blank" rel="noopener noreferrer">
              Reddit
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={linkedinHref} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? t('copied') : t('copyLink')}
          </Button>
        </div>

        <Button asChild>
          <Link href="/terminal">
            {t('analyze')} {topic || 'your asset'}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
