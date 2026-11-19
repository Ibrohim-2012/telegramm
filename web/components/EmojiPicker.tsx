'use client';
import { useEffect, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '@/lib/emoji';

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-emoji-toggle]')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  const group = EMOJI_GROUPS[tab]!;
  return (
    <div ref={ref} className="absolute bottom-full left-0 z-30 mb-2 w-[19rem] max-w-[calc(100vw-1.5rem)] animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" role="dialog" aria-label="Emoji">
      <div className="flex border-b border-line px-1 pt-1" role="tablist">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.name}
            role="tab"
            aria-selected={i === tab}
            aria-label={g.name}
            onClick={() => setTab(i)}
            className={`flex-1 rounded-t-lg py-1.5 text-lg transition ${i === tab ? 'bg-raised' : 'opacity-60 hover:opacity-100'}`}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div className="scroll-thin grid h-56 grid-cols-8 content-start gap-0.5 overflow-y-auto p-2">
        {group.items.map((e) => (
          <button key={e} onClick={() => onPick(e)} aria-label={e} className="grid h-8 w-8 place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-raised">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
