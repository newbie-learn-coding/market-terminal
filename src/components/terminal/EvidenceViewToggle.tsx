'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type EvidenceView = 'graph' | 'mind' | 'flow' | 'timeline';

export function EvidenceViewToggle({
  value,
  onChange,
  disabled,
  className,
}: {
  value: EvidenceView;
  onChange: (v: EvidenceView) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('workspace');
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as EvidenceView)}
      className={cn(disabled ? 'pointer-events-none opacity-60' : '', className)}
    >
      <TabsList aria-label="Evidence view">
        <TabsTrigger value="graph">{t('viewGraph')}</TabsTrigger>
        <TabsTrigger value="mind">{t('viewMind')}</TabsTrigger>
        <TabsTrigger value="flow">{t('viewFlow')}</TabsTrigger>
        <TabsTrigger value="timeline">{t('viewTimeline')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
