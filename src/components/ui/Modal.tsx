'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent as RadixDialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function Modal({
  open,
  title,
  hint,
  actions,
  children,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <RadixDialogContent
          hideClose
          className={cn(
            'fixed inset-3 sm:inset-6 left-auto right-auto top-auto bottom-auto',
            'mx-auto h-[calc(100%-1.5rem)] sm:h-[calc(100%-3rem)] max-w-[1720px] w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)]',
            'translate-x-0 translate-y-0 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'overflow-hidden rounded-3xl',
            className,
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 lg:px-5 lg:py-4">
              <div>
                <DialogTitle className="text-sm font-semibold text-white/90">{title}</DialogTitle>
                {hint ? (
                  <DialogDescription className="mt-0.5 text-[11px] text-white/45">
                    {hint}
                  </DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">{title}</DialogDescription>
                )}
              </div>
              <div className="flex items-center gap-2">
                {actions}
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden px-4 py-3 lg:px-5 lg:py-4">{children}</div>
          </div>
        </RadixDialogContent>
      </DialogPortal>
    </Dialog>
  );
}
