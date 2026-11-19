'use client';
import { formatBytes } from '@/lib/format';
import { useUploads, type Upload } from '@/store/uploads';
import { useT } from '@/store/ui';

/** Circular progress ring drawn around the file icon. */
function ProgressRing({ value, spin }: { value: number; spin: boolean }) {
  const r = 25;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`pointer-events-none absolute -inset-0.5 ${spin ? 'animate-spin' : ''}`} viewBox="0 0 54 54" width="58" height="58" aria-hidden="true" style={{ left: -2, top: -2 }}>
      <circle cx="27" cy="27" r={r} fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <circle cx="27" cy="27" r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.03, Math.min(1, value)))} transform="rotate(-90 27 27)" style={{ transition: 'stroke-dashoffset .15s linear' }} />
    </svg>
  );
}

export function UploadBubble({ u }: { u: Upload }) {
  const t = useT();
  const pct = Math.round(u.progress * 100);
  return (
    <div className="mt-2 flex justify-end" data-testid="upload">
      <div className="bubble bubble-out w-64 max-w-[85%] rounded-2xl rounded-br-[5px] px-3 py-2">
        <div className="flex items-center gap-3">
          {u.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="relative grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">{(u.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}<ProgressRing value={u.status === 'processing' ? 0.75 : u.progress} spin={u.status === 'processing'} /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{u.name}</p>
            <p className="text-xs opacity-80">
              {u.status === 'failed' ? t('upload.failed') : u.status === 'processing' ? t('upload.processing') : `${t('upload.sending')} ${pct}% · ${formatBytes(u.size)}`}
            </p>
          </div>
          <button
            onClick={() => useUploads.getState().cancel(u.id)}
            aria-label={t('compose.cancel')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/10 hover:bg-black/20"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.status === 'processing' ? 100 : pct} aria-label={u.name}>
          <div className={`h-full rounded-full bg-accent transition-[width] duration-150 ${u.status === 'processing' ? 'animate-pulse' : ''}`} style={{ width: `${u.status === 'processing' ? 100 : pct}%` }} />
        </div>
        {u.status === 'failed' && (
          <button onClick={() => useUploads.getState().retry(u.id)} className="mt-2 rounded-md bg-black/20 px-2 py-1 text-xs font-semibold">
            {t('msg.retry')}
          </button>
        )}
      </div>
    </div>
  );
}
