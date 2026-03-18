import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

const sentimentConfig: Record<Sentiment, { variant: 'teal' | 'orange' | 'neutral' | 'blue'; label: string }> = {
  positive: { variant: 'teal', label: 'Positive' },
  negative: { variant: 'orange', label: 'Negative' },
  neutral: { variant: 'neutral', label: 'Neutral' },
  mixed: { variant: 'blue', label: 'Mixed' },
};

export function SentimentBadge({
  sentiment,
  className,
}: {
  sentiment: string | undefined | null;
  className?: string;
}) {
  const key = (sentiment?.toLowerCase() ?? 'neutral') as Sentiment;
  const config = sentimentConfig[key] ?? sentimentConfig.neutral;
  return (
    <Badge variant={config.variant} className={cn(className)}>
      {config.label}
    </Badge>
  );
}
