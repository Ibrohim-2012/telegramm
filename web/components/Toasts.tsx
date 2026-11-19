'use client';
import { useToast } from '@/store/toast';

export function Toasts() {
  const toasts = useToast((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-pop rounded-full px-4 py-2 text-sm font-medium shadow-xl ${
            t.kind === 'error' ? 'bg-danger text-white' : 'bg-ink text-bg'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
