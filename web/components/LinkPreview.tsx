'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Preview {
  url: string;
  title?: string;
  description?: string;
  site?: string;
}

const cache = new Map<string, Promise<Preview | null>>();

function load(url: string): Promise<Preview | null> {
  let p = cache.get(url);
  if (!p) {
    p = api<Preview | undefined>(`/api/preview?url=${encodeURIComponent(url)}`)
      .then((r) => r ?? null)
      .catch(() => null);
    cache.set(url, p);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

/** Fetches only when scrolled into view; renders nothing on failure. Text only: no third-party images are loaded. */
export function LinkPreview({ url }: { url: string }) {
  const ref = useRef<HTMLAnchorElement | HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<Preview | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    void load(url).then((p) => live && setData(p));
    return () => {
      live = false;
    };
  }, [visible, url]);

  if (!data || (!data.title && !data.description)) return <div ref={ref as React.RefObject<HTMLDivElement>} aria-hidden="true" />;
  return (
    <a
      ref={ref as React.RefObject<HTMLAnchorElement>}
      href={data.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-testid="link-preview"
      className="quote mt-1.5 block max-w-sm overflow-hidden rounded-lg px-2.5 py-1.5 text-left no-underline transition hover:brightness-95"
    >
      {data.site && <span className="quote-name block truncate text-xs font-semibold">{data.site}</span>}
      {data.title && <span className="block truncate text-sm font-semibold">{data.title}</span>}
      {data.description && <span className="line-clamp-2 text-xs opacity-80">{data.description}</span>}
    </a>
  );
}
