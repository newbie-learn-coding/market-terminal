import { cn } from '@/lib/utils';

export function PageContainer({
  children,
  className,
  size = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: 'narrow' | 'default' | 'wide' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4',
        size === 'narrow' && 'max-w-[780px]',
        size === 'default' && 'max-w-[1080px]',
        size === 'wide' && 'max-w-[1280px]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
