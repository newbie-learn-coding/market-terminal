import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border border-white/10 bg-white/10 text-white/90 hover:bg-white/15 hover:text-white shadow-[0_12px_30px_-18px_rgba(0,0,0,0.55)]',
        primary:
          'border border-white/10 bg-white/10 text-white/90 hover:bg-white/15 hover:text-white shadow-[0_12px_30px_-18px_rgba(0,0,0,0.55)]',
        outline:
          'border border-white/14 bg-transparent text-white/80 hover:bg-white/6 hover:text-white',
        ghost:
          'border border-transparent bg-transparent text-white/75 hover:bg-white/8 hover:text-white',
        destructive:
          'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25',
        link: 'text-white/75 underline-offset-4 hover:underline hover:text-white border-0',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        md: 'h-10 px-4 text-sm',
        sm: 'h-9 px-3 text-sm',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-10 w-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
