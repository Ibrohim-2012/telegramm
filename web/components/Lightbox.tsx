'use client';
import { useEffect, useRef } from 'react';
import { mediaUrl } from '@/lib/media';
import type { Message } from '@/lib/types';
import { useT } from '@/store/ui';

export function Lightbox({ m, onClose }: { m: Message; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={m.media?.name ?? t('media.photo')}
      className="fixed inset-0 z-50 flex animate-rise flex-col bg-black/90"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <p className="min-w-0 truncate text-sm font-medium">{m.media?.name ?? ''}</p>
        <div className="flex gap-2">
          <a
            href={mediaUrl(m.dialogId, m.id, { download: true })}
            download={m.media?.name}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold transition hover:bg-white/25"
          >
            ⬇ {t('media.download')}
          </a>
          <button onClick={onClose} aria-label={t('media.close')} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-lg transition hover:bg-white/25">
            ✕
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(m.dialogId, m.id)} alt={m.media?.name ?? t('media.photo')} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      </div>
      {m.text && <p className="px-4 pb-4 text-center text-sm text-white/90">{m.text}</p>}
    </div>
  );
}
