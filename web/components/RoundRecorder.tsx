'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/store/ui';
import { useToast } from '@/store/toast';

const SIZE = 384; // Telegram's round videos are square 384x384, shown through a circle
const MAX_SECONDS = 60;
const MIN_SECONDS = 1;
const RING = 2 * Math.PI * 138;

type Phase = 'starting' | 'ready' | 'recording';

/** Record a round video message ("kruzhok"): camera preview in a circle, tap to record, tap to send. */
export function RoundRecorder({ onSend, onClose }: { onSend: (file: File, seconds: number) => void; onClose: () => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('starting');
  const [secs, setSecs] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; started: number; send: boolean; mime: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cb = useRef({ onSend, onClose });
  cb.current = { onSend, onClose };
  const tr = useRef(t); // `t` changes identity on every render; effects must not depend on it
  tr.current = t;

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null;
  }, []);

  const fail = useCallback(
    (key: 'voice.denied' | 'voice.unsupported' | 'voice.error') => {
      cleanup();
      useToast.getState().show(tr.current(key), 'error');
      cb.current.onClose();
    },
    [cleanup],
  );

  // Camera + microphone, painted onto a square canvas (centre crop) that is what actually gets recorded.
  useEffect(() => {
    let dead = false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      fail('voice.unsupported');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (dead) return s.getTracks().forEach((x) => x.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        void v.play().catch(() => {});
        const c = canvas.current!;
        const ctx = c.getContext('2d')!;
        const draw = () => {
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (w && h) {
            const side = Math.min(w, h);
            ctx.drawImage(v, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
          }
          raf.current = requestAnimationFrame(draw);
        };
        draw();
        setPhase('ready');
      })
      .catch((e: DOMException) => fail(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'voice.denied' : 'voice.error'));
    return () => {
      dead = true;
      cleanup();
    };
  }, [cleanup, fail]);

  const finish = useCallback(
    (send: boolean) => {
      const r = rec.current;
      if (!r) return cb.current.onClose();
      r.send = send;
      if (r.mr.state !== 'inactive') r.mr.stop();
    },
    [],
  );

  const start = () => {
    const s = stream.current;
    const c = canvas.current;
    if (!s || !c || rec.current) return;
    const mixed = new MediaStream([...c.captureStream(30).getVideoTracks(), ...s.getAudioTracks()]);
    // Prefer MP4 (what Telegram expects for round videos); some browsers refuse it for canvas streams, so fall back.
    const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].filter((m) => MediaRecorder.isTypeSupported(m));
    let mr: MediaRecorder | null = null;
    let mime = '';
    let first: (() => void) | null = null;
    for (const m of candidates.length ? candidates : ['']) {
      try {
        const r = new MediaRecorder(mixed, m ? { mimeType: m, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000 } : undefined);
        first = () => r.start(250);
        mr = r;
        mime = m;
        // Starting is the real test: an unsupported combination throws here, so try it before committing.
        first();
        break;
      } catch {
        mr = null;
      }
    }
    if (!mr) return fail('voice.unsupported');
    const state = { mr, chunks: [] as Blob[], started: Date.now(), send: false, mime: mr.mimeType || mime };
    rec.current = state;
    mr.ondataavailable = (e) => e.data.size > 0 && state.chunks.push(e.data);
    mr.onstop = () => {
      const seconds = (Date.now() - state.started) / 1000;
      const send = state.send;
      cleanup();
      if (!send) return cb.current.onClose();
      if (seconds < MIN_SECONDS) {
        useToast.getState().show(t('voice.short'), 'error');
        return cb.current.onClose();
      }
      const mp4 = state.mime.includes('mp4');
      const file = new File(state.chunks, mp4 ? 'round.mp4' : 'round.webm', { type: mp4 ? 'video/mp4' : 'video/webm' });
      cb.current.onClose();
      cb.current.onSend(file, Math.max(1, Math.round(seconds)));
    };
    setPhase('recording');
    timer.current = setInterval(() => {
      const sec = (Date.now() - state.started) / 1000;
      setSecs(sec);
      if (sec >= MAX_SECONDS) finish(true);
    }, 100);
  };

  const cancel = useCallback(() => {
    if (rec.current) finish(false);
    else {
      cleanup();
      cb.current.onClose();
    }
  }, [cleanup, finish]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [cancel]);

  const shown = Math.floor(secs);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div role="dialog" aria-modal="true" aria-label={t('round.title')} className="flex animate-pop flex-col items-center gap-5 rounded-3xl bg-surface p-6 shadow-2xl" data-testid="round-recorder">
        <div className="relative h-[300px] w-[300px]">
          <video ref={video} muted playsInline className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden="true" />
          <canvas ref={canvas} width={SIZE} height={SIZE} className="absolute inset-[12px] h-[276px] w-[276px] -scale-x-100 rounded-full bg-raised object-cover" data-testid="round-preview" />
          <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="150" cy="150" r="138" fill="none" stroke="rgb(var(--line))" strokeWidth="4" />
            <circle cx="150" cy="150" r="138" fill="none" stroke="rgb(var(--accent))" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - Math.min(1, secs / MAX_SECONDS))} />
          </svg>
          {phase === 'starting' && <span className="absolute inset-0 grid place-items-center text-sm text-muted">…</span>}
        </div>
        <p className="h-5 text-sm tabular-nums text-muted" role="status" data-testid="round-time">
          {phase === 'recording' ? `● ${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}` : t('round.hint')}
        </p>
        <div className="flex items-center gap-6">
          <button onClick={cancel} aria-label={t('voice.cancel')} className="grid h-12 w-12 place-items-center rounded-full bg-raised text-muted transition hover:text-danger">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          {phase === 'recording' ? (
            <button onClick={() => finish(true)} aria-label={t('voice.send')} className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-ink shadow-lg transition hover:brightness-110 active:scale-95">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12 2-12 2z" /></svg>
            </button>
          ) : (
            <button onClick={start} disabled={phase !== 'ready'} aria-label={t('round.record')} className="grid h-16 w-16 place-items-center rounded-full bg-danger text-white shadow-lg transition hover:brightness-110 active:scale-95 disabled:opacity-40">
              <span className="h-6 w-6 rounded-full border-[3px] border-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
