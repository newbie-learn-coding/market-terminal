'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BarChart3,
  Globe,
  LayoutDashboard,
  Menu,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  zh: '中文',
};

export function SiteHeader({ className }: { className?: string }) {
  const rawPathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('nav');
  const [mobileOpen, setMobileOpen] = useState(false);

  const NAV_ITEMS = [
    { href: '/trending' as const, label: t('trending'), icon: TrendingUp },
    { href: '/tools' as const, label: t('tools'), icon: Sparkles },
    { href: '/asset' as const, label: t('reports'), icon: BarChart3 },
  ];

  // Strip locale prefix for active detection
  const pathname = rawPathname?.replace(/^\/(es|zh)/, '') || '/';

  return (
    <header className={cn('sticky top-0 z-40', className)}>
      <div className="mx-auto max-w-[1280px] px-4 py-3">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(0,102,255,0.12)] via-transparent to-[rgba(120,196,255,0.08)] opacity-60" />
          <div className="relative flex items-center justify-between gap-3">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center gap-0">
              <span className="text-lg font-bold tracking-tight text-white/92">
                TrendAnalysis
              </span>
              <span className="text-lg font-bold tracking-tight text-primary">
                .ai
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname?.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-white/[0.08] text-white/90'
                        : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Link>
                );
              })}
              <Link
                href="/dashboard"
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                  pathname === '/dashboard'
                    ? 'bg-white/[0.08] text-white/90'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70',
                )}
                title={t('dashboard')}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
              </Link>

              {/* Language Switcher */}
              <LanguageSwitcher locale={locale} pathname={pathname} />
            </nav>

            {/* Mobile Menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden h-8 w-8">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">{t('menu')}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <SheetHeader>
                  <SheetTitle>{t('navigation')}</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1">
                  {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || pathname?.startsWith(href + '/');
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-white/[0.08] text-white/90'
                            : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    );
                  })}
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      pathname === '/dashboard'
                        ? 'bg-white/[0.08] text-white/90'
                        : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80',
                    )}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    {t('dashboard')}
                  </Link>

                  {/* Mobile Language Switcher */}
                  <div className="mt-4 border-t border-white/[0.08] pt-4">
                    <LanguageSwitcher locale={locale} pathname={pathname} />
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

function LanguageSwitcher({ locale, pathname }: { locale: string; pathname: string }) {
  const baseUrl = '';
  const locales = ['en', 'es', 'zh'] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/50 hover:text-white/80"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="sr-only">Language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[80px]">
        {locales.map((l) => {
          const href = l === 'en' ? (pathname || '/') : `/${l}${pathname === '/' ? '' : pathname}`;
          return (
            <DropdownMenuItem key={l} asChild>
              <a
                href={`${baseUrl}${href}`}
                className={cn(
                  'cursor-pointer',
                  l === locale && 'font-bold',
                )}
              >
                {LOCALE_LABELS[l]}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
