'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';

export function ToolSearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-11 w-full border-0 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/42"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-[rgba(0,102,255,0.42)] bg-[rgba(0,102,255,0.2)] px-4 text-sm font-semibold text-[rgba(199,228,255,0.98)] transition hover:bg-[rgba(0,102,255,0.28)] disabled:opacity-45"
        >
          Analyze <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
