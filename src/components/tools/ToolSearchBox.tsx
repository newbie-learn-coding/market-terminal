'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function ToolSearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const t = useTranslations('common');
  const [query, setQuery] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim())
          router.push(
            `/terminal?q=${encodeURIComponent(query.trim())}&runAt=${Date.now()}`
          );
      }}
      className="mx-auto mt-6 max-w-[640px] rounded-2xl border border-white/12 bg-black/20 p-2"
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4">
          <Search className="h-4 w-4 shrink-0 text-white/46" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-11 border-0 bg-transparent px-0 ring-0 focus:border-0 focus:ring-0 placeholder:text-white/42"
          />
        </div>
        <Button
          type="submit"
          disabled={!query.trim()}
          size="lg"
          className="border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] text-[rgba(199,228,255,0.98)] hover:bg-[rgba(0,102,255,0.28)]"
        >
          {t('analyze')} <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
