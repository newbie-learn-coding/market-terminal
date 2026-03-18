import { cn } from '@/lib/utils';

export function SectionLabel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'text-[11px] font-semibold uppercase tracking-wider text-white/40',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
