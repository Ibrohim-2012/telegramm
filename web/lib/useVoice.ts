'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { webmToOgg } from './ogg';

export const MAX_VOICE_SECONDS = 300;
export const MIN_VOICE_SECONDS = 1;

type Fail = 'denied' | 'unsupported' | 'error';

/** Records the microphone; the result is an Ogg/Opus file, ready to be sent as a Telegram voice note. */
export function useVoice(onDone: (file: File, seconds: number) => void, onFail: (why: Fail | 'short') => void) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; send: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cb = useRef({ onDone, onFail });
  cb.current = { onDone, onFail };

  const release = useCallback(() => {
    clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setRecording(false);
    setSecs(0);
  }, []);

  const finish = useCallback((send: boolean) => {
    const r = rec.current;
    if (!r) return;
    r.send = send;
    if (r.mr.state !== 'inactive') r.mr.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    if (rec.current) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return cb.current.onFail('unsupported');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return cb.current.onFail((e as DOMException).name === 'NotAllowedError' || (e as DOMException).name === 'SecurityError' ? 'denied' : 'error');
    }
    const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return cb.current.onFail('unsupported');
    }
    const state = { mr, stream, chunks: [] as Blob[], started: Date.now(), send: false };
    rec.current = state;
    mr.ondataavailable = (e) => e.data.size > 0 && state.chunks.push(e.data);
    mr.onstop = () => {
      const seconds = Math.round((Date.now() - state.started) / 100) / 10;
      const type = mr.mimeType || mime || 'audio/webm';
      const chunks = state.chunks;
      const send = state.send;
      release();
      if (!send) return;
      if (seconds < MIN_VOICE_SECONDS) return cb.current.onFail('short');
      void new Blob(chunks, { type }).arrayBuffer().then((buf) => {
        const bytes = new Uint8Array(buf);
        const ogg = type.includes('ogg') ? bytes : webmToOgg(bytes);
        const file = ogg ? new File([ogg as BlobPart], 'voice.ogg', { type: 'audio/ogg' }) : new File([buf], 'voice.webm', { type: 'audio/webm' });
        cb.current.onDone(file, Math.max(1, Math.round(seconds)));
      });
    };
    mr.start(250);
    setRecording(true);
    setSecs(0);
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - state.started) / 1000);
      setSecs(s);
      if (s >= MAX_VOICE_SECONDS) finish(true);
    }, 250);
  }, [finish, release]);

  // Leaving the chat (or the page) while recording throws the recording away and frees the microphone.
  useEffect(() => () => finish(false), [finish]);

  return { recording, secs, start, send: () => finish(true), cancel: () => finish(false) };
}
