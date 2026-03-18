import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

type Momentum = 'rising' | 'fading' | 'steady';

const momentumConfig: Record<Momentum, { variant: 'teal' | 'orange' | 'neutral'; icon: typeof TrendingUp; label: string }> = {
  rising: { variant: 'teal', icon: TrendingUp, label: 'Rising' },
  fading: { variant: 'orange', icon: TrendingDown, label: 'Fading' },
  steady: { variant: 'neutral', icon: Minus, label: 'Steady' },
};

export function MomentumBadge({
  momentum,
  className,
}: {
  momentum: string | undefined | null;
  className?: string;
}) {
  const key = (momentum?.toLowerCase() ?? 'steady') as Momentum;
  const config = momentumConfig[key] ?? momentumConfig.steady;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={cn('gap-1', className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
