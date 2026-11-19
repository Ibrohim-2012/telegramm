'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, formatDuration } from '@/lib/format';
import { fitBox, mediaUrl } from '@/lib/media';
import type { Message } from '@/lib/types';
import { useT } from '@/store/ui';
import { IconDownload, IconPause, IconPlay } from './icons';

function Broken({ onRetry, label }: { onRetry: () => void; label: string }) {
  return (
    <button onClick={onRetry} className="grid h-24 w-48 place-items-center bg-black/15 text-xs font-medium">
      ⚠ {label} ↻
    </button>
  );
}

function Photo({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const t = useT();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [tries, setTries] = useState(0);
  const box = fitBox(m.media?.width, m.media?.height, 380, 440);
  if (state === 'error') return <Broken label={t('media.error')} onRetry={() => (setState('loading'), setTries((n) => n + 1))} />;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={m.media?.name ?? t('media.photo')}
      className={`relative block max-w-full overflow-hidden ${state === 'loading' ? 'skeleton !rounded-none' : ''}`}
      style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={tries}
        src={`${mediaUrl(m.dialogId, m.id, { thumb: true })}${tries ? `&r=${tries}` : ''}`}
        alt={m.media?.name ?? t('media.photo')}
        loading="lazy"
        decoding="async"
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        className="h-full w-full object-cover"
      />
    </button>
  );
}

function Sticker({ m }: { m: Message }) {
  const [failed, setFailed] = useState(false);
  // Animated stickers (.tgs) can't be drawn by <img>; fall back to their emoji.
  if (failed || m.media?.mime === 'application/x-tgsticker') {
    return (
      <span className="block text-7xl leading-none" role="img" aria-label="sticker">
        {m.media?.alt ?? '🙂'}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaUrl(m.dialogId, m.id)} alt={m.media?.alt ?? 'sticker'} loading="lazy" width={160} height={160} onError={() => setFailed(true)} className="h-40 w-40" />;
}

/** Circle with a download arrow, file name and size (Telegram's document bubble). */
function FileCard({ m }: { m: Message }) {
  const t = useT();
  const media = m.media!;
  return (
    <a
      href={mediaUrl(m.dialogId, m.id, { download: true })}
      download={media.name}
      aria-label={`${t('media.download')}: ${media.name ?? ''}`}
      className="group flex min-w-[13rem] max-w-full items-center gap-3 py-0.5"
    >
      <span className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition group-hover:brightness-110">
        <IconDownload size={26} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base font-medium">{media.name ?? 'fayl'}</span>
        <span className="msg-meta block text-sm">{media.size ? formatBytes(media.size) : ''}</span>
      </span>
    </a>
  );
}

/** Deterministic pseudo-random waveform so the same message always looks the same. */
function waveform(seed: number, bars: number): number[] {
  let s = (seed * 2654435761) >>> 0 || 1;
  return Array.from({ length: bars }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return 0.25 + ((s >>> 8) % 1000) / 1333; // 0.25 .. 1
  });
}

/** Play button + waveform + time, driving a real <audio> element. */
function VoicePlayer({ m }: { m: Message }) {
  const t = useT();
  const media = m.media!;
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(media.duration ?? 0);
  const bars = useMemo(() => waveform(m.id, 30), [m.id]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onMeta = () => Number.isFinite(a.duration) && setDuration(a.duration);
    const onEnd = () => (setPlaying(false), setProgress(0));
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('play', () => setPlaying(true));
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll('audio').forEach((x) => x !== a && x.pause()); // one voice at a time
      void a.play().catch(() => setPlaying(false));
    } else a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };

  const shown = playing || progress > 0 ? duration * progress : duration;
  return (
    <div className="flex min-w-[15rem] max-w-full items-center gap-3 py-0.5" data-testid="voice">
      <audio ref={audio} src={mediaUrl(m.dialogId, m.id)} preload="none" aria-label={media.name ?? 'audio'} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('voice.pause') : t('voice.play')}
        className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 active:scale-95"
      >
        {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 cursor-pointer items-center gap-[2px]" onClick={seek} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={media.name ?? 'audio'}>
          {bars.map((h, i) => (
            <span key={i} className={`w-[3px] shrink-0 rounded-full transition-colors ${i / bars.length < progress ? 'bg-accent' : 'bg-current opacity-30'}`} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </div>
        <span className="msg-meta text-xs">
          {formatDuration(shown)}
          {media.kind === 'audio' && media.name ? ` · ${media.name}` : ''}
        </span>
      </div>
    </div>
  );
}

function RoundVideo({ m }: { m: Message }) {
  const t = useT();
  const v = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const dur = m.media?.duration ?? 0;
  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };
  return (
    <button type="button" onClick={toggle} aria-label={t('round.play')} data-testid="round" className="relative block h-60 w-60 max-w-full overflow-hidden rounded-full bg-black">
      <video
        ref={v}
        src={mediaUrl(m.dialogId, m.id)}
        poster={m.media?.thumb ? mediaUrl(m.dialogId, m.id, { thumb: true }) : undefined}
        preload="metadata"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setProgress(0)}
        onTimeUpdate={(e) => setProgress(dur > 0 ? Math.min(1, e.currentTarget.currentTime / dur) : 0)}
        className="h-full w-full object-cover"
      />
      {!playing && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white">
            <IconPlay size={28} />
          </span>
        </span>
      )}
      {dur > 0 && !playing && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">{formatDuration(dur)}</span>}
      <svg viewBox="0 0 240 240" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="120" cy="120" r="117" fill="none" stroke="rgb(255 255 255 / .85)" strokeWidth="3" strokeDasharray={2 * Math.PI * 117} strokeDashoffset={2 * Math.PI * 117 * (1 - progress)} />
      </svg>
    </button>
  );
}

export function MediaView({ m, onOpen }: { m: Message; onOpen: (m: Message) => void }) {
  const media = m.media;
  if (!media) return null;
  switch (media.kind) {
    case 'photo':
      return <Photo m={m} onOpen={() => onOpen(m)} />;
    case 'sticker':
      return <Sticker m={m} />;
    case 'gif': {
      const box = fitBox(media.width, media.height, 380, 440);
      return <video src={mediaUrl(m.dialogId, m.id)} autoPlay loop muted playsInline preload="metadata" className="block max-w-full" style={{ width: box.width }} aria-label="GIF" />;
    }
    case 'video': {
      const box = fitBox(media.width, media.height, 380, 440);
      return (
        <video
          src={mediaUrl(m.dialogId, m.id)}
          poster={media.thumb ? mediaUrl(m.dialogId, m.id, { thumb: true }) : undefined}
          controls
          preload="none"
          playsInline
          className="block max-w-full bg-black"
          style={{ width: box.width, aspectRatio: `${box.width} / ${box.height}` }}
          aria-label={media.name ?? 'video'}
        />
      );
    }
    case 'round':
      return <RoundVideo m={m} />;
    case 'voice':
    case 'audio':
      return <VoicePlayer m={m} />;
    default:
      return <FileCard m={m} />;
  }
}
