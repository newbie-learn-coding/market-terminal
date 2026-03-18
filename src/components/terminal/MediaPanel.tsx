'use client';

import { RefreshCw, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type VideoItem = {
  id: string;
  title: string;
  url: string;
  channel: string;
  thumbnail: string;
  provider: 'YouTube';
};

type VideosResponse = {
  topic: string;
  fetchedAt: number;
  mode: 'brightdata' | 'mock';
  items: VideoItem[];
  error?: string;
};

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace('/', '');
      return id.length === 11 ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && v.length === 11) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0) {
        const id = parts[shortsIdx + 1];
        return id?.length === 11 ? id : null;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function MediaPanel({
  session,
  videos,
  videosLoading,
  videoAutoPoll,
  activeVideoId,
  onVideoAutoPollChange,
  onRefresh,
  onActiveVideoChange,
}: {
  session: { topic: string } | null;
  videos: VideosResponse | null;
  videosLoading: boolean;
  videoAutoPoll: boolean;
  activeVideoId: string | null;
  onVideoAutoPollChange: (v: boolean) => void;
  onRefresh: () => void;
  onActiveVideoChange: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-white/80" />
          <div>
            <CardTitle>Media</CardTitle>
            <CardDescription>{videoAutoPoll ? 'Auto-polling every 5m' : 'Manual refresh'}</CardDescription>
          </div>
        </div>
        {session ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center rounded-full border border-white/10 bg-white/[0.03] p-1 text-[11px] text-white/60 sm:flex">
              <button
                type="button"
                className={cn(
                  'rounded-full px-3 py-1 transition',
                  videoAutoPoll ? 'text-white/55 hover:text-white/75' : 'bg-white/10 text-white/80',
                )}
                onClick={() => onVideoAutoPollChange(false)}
              >
                Manual
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-full px-3 py-1 transition',
                  videoAutoPoll ? 'bg-white/10 text-white/80' : 'text-white/55 hover:text-white/75',
                )}
                onClick={() => onVideoAutoPollChange(true)}
              >
                Auto
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/12 bg-white/[0.03]"
              onClick={onRefresh}
              disabled={videosLoading}
            >
              <RefreshCw className={cn('h-4 w-4', videosLoading ? 'animate-spin' : '')} />
              Refresh
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-5">
        {!session ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
            Run a topic to load videos.
          </div>
        ) : !videos ? (
          videosLoading ? (
            <div className="space-y-2">
              <div className="h-20 rounded-2xl bg-white/[0.03] shimmer" />
              <div className="h-20 rounded-2xl bg-white/[0.03] shimmer" />
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
              No videos loaded yet.
            </div>
          )
        ) : videos.items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/60">
            No videos found for this topic.
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              const active = videos.items.find((v) => v.id === activeVideoId) ?? videos.items[0];
              const id = active ? extractYouTubeId(active.url) : null;
              if (!id) return null;
              return (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                  <div className="aspect-video w-full">
                    <iframe
                      className="h-full w-full"
                      src={`https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`}
                      title="Video Pulse"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </div>
              );
            })()}
            <div className="grid gap-2 sm:grid-cols-2">
              {videos.items.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={cn(
                    'group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.06]',
                    activeVideoId === v.id ? 'border-white/20 bg-white/[0.06]' : '',
                  )}
                  onClick={() => onActiveVideoChange(v.id)}
                >
                  {v.thumbnail ? (
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="h-16 w-28 shrink-0 rounded-xl border border-white/10 bg-white/[0.03] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(0,102,255,0.24),rgba(255,82,28,0.18),rgba(20,184,166,0.14))]">
                      <div className="mono text-xs font-semibold text-white/85">VIDEO</div>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-snug text-white/86">{v.title}</div>
                    <div className="mt-1 text-xs text-white/50">{v.channel}</div>
                    <div className="mt-1">
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-[rgba(153,197,255,0.9)] underline underline-offset-4"
                      >
                        Open source
                      </a>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
