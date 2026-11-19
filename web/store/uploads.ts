'use client';
import { create } from 'zustand';
import { API_URL, ApiError } from '@/lib/api';
import type { Message } from '@/lib/types';
import { useMessages, toastError } from './messages';
import { usePremium } from './premium';

const DEFAULT_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 50);
/** Current upload limit: the server's number for this account (bigger with Premium). */
export function maxUploadMb(): number {
  const i = usePremium.getState().info;
  return i ? (i.active ? i.uploadMb.premium : i.uploadMb.free) || DEFAULT_UPLOAD_MB : DEFAULT_UPLOAD_MB;
}
export const MAX_FILES = 10;

export interface Upload {
  id: number;
  dialogId: string;
  name: string;
  size: number;
  mime: string;
  /** 0..1 of bytes sent to our server. */
  progress: number;
  status: 'uploading' | 'processing' | 'failed';
  previewUrl?: string;
}

export interface SendOpts {
  caption?: string;
  replyTo?: number;
  asFile: boolean;
  /** A recorded voice note (Telegram shows a waveform player). */
  voice?: boolean;
  /** A round video message ("kruzhok"). */
  round?: boolean;
  duration?: number;
}

interface UploadsStore {
  items: Upload[];
  /** Files chosen (picker / drop / paste) and waiting in the preview dialog. */
  staged: File[];
  stage: (files: File[]) => void;
  unstage: () => void;
  start: (dialogId: string, file: File, opts: SendOpts) => void;
  retry: (id: number) => void;
  cancel: (id: number) => void;
}

let seq = 0;
const running = new Map<number, XMLHttpRequest>();
const sources = new Map<number, { file: File; opts: SendOpts }>();

export const useUploads = create<UploadsStore>((set, get) => {
  const patch = (id: number, p: Partial<Upload>) => set((s) => ({ items: s.items.map((u) => (u.id === id ? { ...u, ...p } : u)) }));
  const drop = (id: number) => {
    const u = get().items.find((x) => x.id === id);
    if (u?.previewUrl) URL.revokeObjectURL(u.previewUrl);
    running.delete(id);
    sources.delete(id);
    set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
  };

  const run = (id: number) => {
    const src = sources.get(id);
    const u = get().items.find((x) => x.id === id);
    if (!src || !u) return;
    const form = new FormData();
    form.append('asFile', src.opts.asFile ? '1' : '0');
    if (src.opts.caption) form.append('caption', src.opts.caption);
    if (src.opts.round) {
      form.append('round', '1');
      form.append('duration', String(Math.round(src.opts.duration ?? 0)));
    }
    if (src.opts.voice) {
      form.append('voice', '1');
      form.append('duration', String(Math.round(src.opts.duration ?? 0)));
    }
    if (src.opts.replyTo) form.append('replyTo', String(src.opts.replyTo));
    form.append('file', src.file, src.file.name); // file last so the text fields are parsed first

    const xhr = new XMLHttpRequest();
    running.set(id, xhr);
    xhr.open('POST', `${API_URL}/api/dialogs/${u.dialogId}/upload`);
    xhr.withCredentials = true;
    patch(id, { status: 'uploading', progress: 0 });
    xhr.upload.onprogress = (e) => e.lengthComputable && patch(id, { progress: e.loaded / e.total });
    xhr.upload.onload = () => patch(id, { progress: 1, status: 'processing' });
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status === 201 && body) {
        useMessages.getState().applyNew(body as Message);
        drop(id);
      } else {
        const e = (body as { error?: { code: string; message: string; retryAfter?: number; premiumLimitMb?: number } } | null)?.error;
        patch(id, { status: 'failed' });
        toastError(new ApiError(e?.code ?? 'UNKNOWN', e?.message ?? 'Xatolik', e?.retryAfter, e?.premiumLimitMb ? { premiumLimitMb: e.premiumLimitMb } : undefined));
      }
    };
    xhr.onerror = () => {
      patch(id, { status: 'failed' });
      toastError(new ApiError('NETWORK', 'Tarmoq xatosi'));
    };
    xhr.onabort = () => drop(id);
    xhr.send(form);
  };

  return {
    items: [],
    staged: [],
    stage: (files) => set({ staged: files.slice(0, MAX_FILES) }),
    unstage: () => set({ staged: [] }),
    start: (dialogId, file, opts) => {
      const id = ++seq;
      const previewUrl = !opts.asFile && file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      sources.set(id, { file, opts });
      set((s) => ({ items: [...s.items, { id, dialogId, name: file.name, size: file.size, mime: file.type, progress: 0, status: 'uploading', previewUrl }] }));
      run(id);
    },
    retry: (id) => run(id),
    cancel: (id) => {
      const x = running.get(id);
      if (x && get().items.find((u) => u.id === id)?.status !== 'failed') x.abort();
      else drop(id);
    },
  };
});
