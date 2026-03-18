import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-white/10 bg-white/5 text-white/70',
        neutral: 'border-white/10 bg-white/5 text-white/70',
        blue: 'border-[rgba(0,102,255,0.35)] bg-[rgba(0,102,255,0.14)] text-[rgba(153,197,255,0.95)]',
        orange:
          'border-[rgba(255,82,28,0.35)] bg-[rgba(255,82,28,0.14)] text-[rgba(255,205,185,0.95)]',
        teal: 'border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.14)] text-[rgba(167,243,235,0.95)]',
        destructive: 'border-red-500/25 bg-red-500/10 text-red-400',
        success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** @deprecated Use `variant` instead */
  tone?: 'neutral' | 'blue' | 'orange' | 'teal';
}

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  // backward compat: tone prop maps to variant
  const resolvedVariant = variant ?? tone ?? 'default';
  return <span className={cn(badgeVariants({ variant: resolvedVariant }), className)} {...props} />;
}

export { Badge, badgeVariants };
