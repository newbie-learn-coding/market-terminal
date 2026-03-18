'use client';

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
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as EvidenceView)}
      className={cn(disabled ? 'pointer-events-none opacity-60' : '', className)}
    >
      <TabsList aria-label="Evidence view">
        <TabsTrigger value="graph">Graph</TabsTrigger>
        <TabsTrigger value="mind">Mind</TabsTrigger>
        <TabsTrigger value="flow">Flow</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
