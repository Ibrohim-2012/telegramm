'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  /** Anchor the menu's right edge at x (for menus opened from a button on the right). */
  alignRight?: boolean;
  reactions?: { emojis: readonly string[]; current?: string; onPick: (emoji: string) => void };
}

/** Right-click / long-press / keyboard menu. Arrow keys move, Enter selects, Esc closes. */
export function ContextMenu({ x, y, items, onClose, alignRight, reactions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, origin: '0 0' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetWidth/Height ignore the pop-in scale animation (getBoundingClientRect would under-measure it).
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const wantLeft = alignRight ? x - w : x;
    const left = Math.max(8, Math.min(wantLeft, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    // The pop animation grows out of the point that was clicked.
    setPos({ left, top, origin: `${Math.max(0, Math.min(w, x - left))}px ${Math.max(0, Math.min(h, y - top))}px` });
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y, alignRight]);

  useEffect(() => {
    const down = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // do not also close the chat behind the menu
        return onClose();
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('touchstart', down);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top, transformOrigin: pos.origin }}
      className="fixed z-50 min-w-[13rem] animate-menu rounded-xl border border-line/50 bg-surface/90 p-1 shadow-[0_4px_24px_rgb(0_0_0/.22)] backdrop-blur-xl"
    >
      {reactions && (
        <div className="mb-1 flex gap-0.5 border-b border-line/60 px-1 pb-1.5 pt-0.5" role="group" aria-label="Reactions">
          {reactions.emojis.map((e) => (
            <button
              key={e}
              role="menuitem"
              aria-label={e}
              aria-pressed={reactions.current === e}
              onClick={() => {
                onClose();
                reactions.onPick(e);
              }}
              className={`grid h-9 w-9 place-items-center rounded-full text-xl transition hover:scale-125 hover:bg-raised ${reactions.current === e ? 'bg-accent/20' : ''}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          data-ripple
          onClick={() => {
            onClose();
            it.onSelect();
          }}
          className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] font-medium transition-colors hover:bg-raised ${it.danger ? 'text-danger' : ''}`}
        >
          {it.icon && <span className={`grid w-5 shrink-0 place-items-center ${it.danger ? '' : 'text-muted'}`}>{it.icon}</span>}
          {it.label}
        </button>
      ))}
    </div>
  );
}
