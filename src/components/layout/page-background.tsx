import { cn } from '@/lib/utils';

export function PageBackground({ className }: { className?: string }) {
  return (
    <>
      <div className={cn('bg-terminal fixed inset-0 -z-20', className)} />
      <div className="grid-overlay pointer-events-none fixed inset-0 -z-10 opacity-50" />
    </>
  );
}
