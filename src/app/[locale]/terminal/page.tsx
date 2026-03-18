import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Terminal } from '@/components/terminal/Terminal';

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<div className="min-h-screen bg-terminal" />}>
      <Terminal />
    </Suspense>
  );
}
