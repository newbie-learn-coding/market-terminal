import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Panel({
  title,
  hint,
  icon,
  actions,
  children,
  className,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'panel-sheen relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04]',
        'shadow-[0_18px_50px_-34px_rgba(0,0,0,0.3)] backdrop-blur-xl',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-5 lg:py-4">
        <div className="flex items-center gap-2">
          <div className="text-white/80">{icon}</div>
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-white/90">{title}</div>
            {hint ? <div className="text-[11px] text-white/45">{hint}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="px-4 py-3 lg:px-5 lg:py-4">{children}</div>
    </section>
  );
}
