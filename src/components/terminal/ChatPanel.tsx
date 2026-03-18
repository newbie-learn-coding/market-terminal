'use client';

import type { ReactNode } from 'react';
import { Search, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ActivityCard, type QueryQueueItem, type ScrapeQueueItem } from '@/components/terminal/ActivityCard';
import type { PipelineStep, PlanEvent, SearchEvent } from '@/components/terminal/PipelineTimeline';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

const CHAT_SUGGESTIONS = [
  'What is moving Bitcoin today?',
  'Is Bitcoin related to gold or DXY today?',
  'NVDA headline map and spillovers',
  'Oil: what changed since market open?',
  'Show competing explanations for the last 2 hours',
  'What should I watch next for BTC risk?',
] as const;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel({
  session,
  running,
  chatMode,
  chatInput,
  messages,
  mentionState,
  showChatSuggestions,
  plan,
  search,
  queryQueue,
  scrapeQueue,
  evidenceSources,
  evidenceCount,
  summariesCount,
  nodesCount,
  edgesCount,
  clustersCount,
  warningsCount,
  graphVariant,
  mode,
  runMeta,
  onChatModeChange,
  onChatInputChange,
  onClose,
  onRunChat,
  onAskWithContext,
  onMentionSelect,
  renderMessageContent,
}: {
  session: { id: string; step: PipelineStep; progress: number; evidence: { id: string }[]; clusters: { id: string }[] } | null;
  running: boolean;
  chatMode: 'fetch' | 'explain';
  chatInput: string;
  messages: ChatMessage[];
  mentionState: { active: boolean; query: string; items: string[] };
  showChatSuggestions: boolean;
  plan: PlanEvent | null;
  search: SearchEvent | null;
  queryQueue: QueryQueueItem[];
  scrapeQueue: ScrapeQueueItem[];
  evidenceSources: string[];
  evidenceCount: number;
  summariesCount: number;
  nodesCount: number;
  edgesCount: number;
  clustersCount: number;
  warningsCount: number;
  graphVariant: string | null;
  mode: 'fast' | 'deep';
  runMeta: { mode: 'fast' | 'deep'; provider: string } | null;
  onChatModeChange: (m: 'fetch' | 'explain') => void;
  onChatInputChange: (v: string) => void;
  onClose: () => void;
  onRunChat: (q: string) => void;
  onAskWithContext: (q: string) => void;
  onMentionSelect: (item: string) => void;
  renderMessageContent: (content: string) => ReactNode;
}) {
  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-white/80" />
          <div>
            <CardTitle>Chat</CardTitle>
            <CardDescription>
              {chatMode === 'fetch' ? 'Fetch mode runs a new session' : 'Explain mode uses saved session context'}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1 text-[11px] text-white/60">
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 transition',
                chatMode === 'fetch' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
              )}
              onClick={() => onChatModeChange('fetch')}
              disabled={running}
            >
              Fetch
            </button>
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 transition',
                chatMode === 'explain' ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
              )}
              onClick={() => onChatModeChange('explain')}
              disabled={!session || !isUuid(session.id)}
            >
              Explain
            </button>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="flex h-[64vh] min-h-[420px] flex-col xl:h-[calc(100vh-230px)]">
          {session ? (
            <div className="mb-3">
              {running || session.step !== 'ready' || warningsCount > 0 ? (
                <ActivityCard
                  step={session.step}
                  progress={session.progress}
                  mode={runMeta?.mode ?? mode}
                  provider={runMeta?.provider ?? 'ai'}
                  running={running}
                  plan={plan}
                  search={search}
                  queryQueue={queryQueue}
                  scrapeQueue={scrapeQueue}
                  evidenceSources={evidenceSources}
                  evidenceCount={evidenceCount}
                  summariesCount={summariesCount}
                  nodesCount={nodesCount}
                  edgesCount={edgesCount}
                  clustersCount={clustersCount}
                  warningsCount={warningsCount}
                  graphVariant={graphVariant}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-2xl border border-white/10 px-4 py-3 text-sm leading-relaxed',
                    m.role === 'user' ? 'bg-white/[0.05] text-white/82' : 'bg-black/25 text-white/72',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-white/45">
                    <span className="uppercase tracking-[0.22em]">{m.role}</span>
                    <span className="mono">{formatTime(m.createdAt)}</span>
                  </div>
                  {renderMessageContent(m.content)}
                </div>
              ))}
            </div>
          </div>

          {showChatSuggestions ? (
            <div className="mt-3">
              <div className="text-[11px] font-semibold tracking-[0.2em] text-white/45">QUICK PROMPTS</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHAT_SUGGESTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white/80"
                    onClick={() => onRunChat(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form
            className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (chatMode === 'explain' && session && isUuid(session.id)) {
                onAskWithContext(chatInput);
              } else {
                onRunChat(chatInput);
              }
            }}
          >
            <Input
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value)}
              placeholder="Use @ for node/evidence/tag references"
              className="flex-1 border-white/10 bg-white/[0.02]"
            />
            <Button
              type="submit"
              variant="outline"
              className="border-white/12 bg-[rgba(255,82,28,0.10)] hover:bg-[rgba(255,82,28,0.15)]"
              disabled={!chatInput.trim()}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {mentionState.active && mentionState.items.length ? (
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-2">
              <div className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-white/45">REFERENCES</div>
              <div className="flex flex-wrap gap-2">
                {mentionState.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.06] hover:text-white/85"
                    onClick={() => onMentionSelect(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
