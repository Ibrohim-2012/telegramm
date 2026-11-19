'use client';
import { useToast } from '@/store/toast';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVoice } from '@/lib/useVoice';
import { RoundRecorder } from './RoundRecorder';
import { useUploads } from '@/store/uploads';
import { api } from '@/lib/api';
import { plainText } from '@/lib/richtext';
import type { Dialog } from '@/lib/types';
import { useCompose } from '@/store/compose';
import { useDrafts } from '@/store/drafts';
import { stageFiles } from './stage';
import { useMessages } from '@/store/messages';
import { useT } from '@/store/ui';
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(() => import('./EmojiPicker').then((m) => m.EmojiPicker), { ssr: false });

const MAX = 4096;
const TYPING_EVERY_MS = 4000;

export function Composer({ dialog }: { dialog: Dialog }) {
  const t = useT();
  const replyTo = useCompose((s) => s.replyTo);
  const editing = useCompose((s) => s.editing);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [attach, setAttach] = useState(false);
  const [round, setRound] = useState(false);
  const voice = useVoice(
    (file, seconds) => {
      useUploads.getState().start(dialog.id, file, { asFile: false, voice: true, duration: seconds, replyTo: useCompose.getState().replyTo?.id });
      useCompose.getState().clear();
    },
    (why) => useToast.getState().show(t(`voice.${why === 'denied' ? 'denied' : why === 'short' ? 'short' : why === 'unsupported' ? 'unsupported' : 'error'}` as 'voice.error'), 'error'),
  );
  const mediaPicker = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const loadedFor = useRef<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Escape cancels a recording in progress.
  useEffect(() => {
    if (!voice.recording) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        voice.cancel();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [voice.recording, voice.cancel]); // eslint-disable-line react-hooks/exhaustive-deps

  // The attach menu closes on outside click and Escape.
  useEffect(() => {
    if (!attach) return;
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest('[data-attach-toggle], [role=menu]')) setAttach(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAttach(false);
      }
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [attach]);

  // Fresh composer per chat.
  useEffect(() => {
    setText(useDrafts.getState().drafts[dialog.id] ?? ''); // restore the unsent draft of this chat
    loadedFor.current = dialog.id;
    setEmoji(false);
    useCompose.getState().clear();
    return () => useCompose.getState().clear();
  }, [dialog.id]);

  // Save drafts (not while editing a sent message, and never into the wrong chat).
  useEffect(() => {
    if (editing || loadedFor.current !== dialog.id) return;
    const id = setTimeout(() => useDrafts.getState().set(dialog.id, text), 350);
    return () => clearTimeout(id);
  }, [text, editing, dialog.id]);

  useEffect(() => {
    if (editing) setText(editing.text);
    if (editing || replyTo) ta.current?.focus();
  }, [editing, replyTo]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden'; // no scrollbar for short text
  }, [text]);

  if (dialog.kind === 'channel') {
    return <div className="border-t border-line bg-surface px-4 py-3 text-center text-sm text-muted">{t('compose.readonly')}</div>;
  }

  const trimmed = text.trim();

  const submit = async () => {
    if (!trimmed || saving || text.length > MAX) return;
    if (editing) {
      if (trimmed === editing.text) return useCompose.getState().clear(), setText('');
      setSaving(true);
      const ok = await useMessages.getState().edit(dialog.id, editing.id, trimmed);
      setSaving(false);
      if (ok) {
        useCompose.getState().clear();
        setText('');
      }
      return;
    }
    const reply = replyTo?.id;
    setText('');
    useDrafts.getState().set(dialog.id, '');
    useCompose.getState().clear();
    await useMessages.getState().send(dialog.id, trimmed, reply);
  };

  const notifyTyping = () => {
    const now = Date.now();
    if (now - lastTyping.current < TYPING_EVERY_MS) return;
    lastTyping.current = now;
    void api(`/api/dialogs/${dialog.id}/typing`, { method: 'POST', body: {} }).catch(() => {});
  };

  const insert = (e: string) => {
    const el = ta.current;
    const s = el?.selectionStart ?? text.length;
    const en = el?.selectionEnd ?? text.length;
    setText(text.slice(0, s) + e + text.slice(en));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + e.length, s + e.length);
    });
  };

  const barLabel = editing ? t('compose.editing') : t('compose.reply');
  const bar = editing ?? replyTo;

  return (
    <div className="pb-safe relative border-t border-line bg-surface">
      <div className="w-full">
        {bar && (
          <div className="mx-3 mb-1 mt-2 flex items-center gap-2 rounded-xl bg-raised px-3 py-1.5" data-testid="compose-bar">
            <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2">
              <p className="text-xs font-semibold text-accent">{barLabel}</p>
              <p className="truncate text-sm text-muted">{plainText(bar.text)}</p>
            </div>
            <button
              onClick={() => {
                useCompose.getState().clear();
                if (editing) setText('');
              }}
              aria-label={t('compose.cancel')}
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}
        {voice.recording ? (
          <div className="flex items-center gap-1 px-2 py-1 md:px-3" role="group" aria-label={t('voice.recording')} data-testid="voice-bar">
            <button onClick={voice.cancel} aria-label={t('voice.cancel')} title={t('voice.cancel')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-danger transition hover:bg-danger/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2" role="status">
              <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden="true" />
              <span className="tabular-nums text-base" data-testid="voice-time">{Math.floor(voice.secs / 60)}:{String(voice.secs % 60).padStart(2, '0')}</span>
              <span className="truncate text-sm text-muted">{t('voice.recording')}</span>
            </div>
            <button onClick={voice.send} aria-label={t('voice.send')} title={t('voice.send')} className="grid h-11 w-11 shrink-0 animate-pop place-items-center rounded-full bg-accent text-accent-ink shadow transition hover:brightness-110 active:scale-95">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12 2-12 2z" /></svg>
            </button>
          </div>
        ) : (
        <div className="flex items-end gap-0.5 px-2 py-1 md:px-3">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            data-testid="file-input"
            onChange={(e) => {
              stageFiles([...(e.target.files ?? [])], t);
              e.target.value = '';
            }}
          />
          <input ref={mediaPicker} type="file" accept="image/*,video/*" multiple hidden data-testid="media-input" onChange={(e) => { stageFiles([...(e.target.files ?? [])], t); e.target.value = ''; }} />
          <div className="relative">
          <button
            data-attach-toggle
            onClick={() => setAttach((v) => !v)}
            aria-label={t('attach.button')}
            aria-haspopup="menu"
            aria-expanded={attach}
            title={t('attach.button')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.4 11-9.2 9.2a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5" />
            </svg>
          </button>
          {attach && (
            <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-56 origin-bottom-left animate-pop rounded-xl bg-surface py-1.5 shadow-xl ring-1 ring-line">
              <button role="menuitem" onClick={() => { setAttach(false); mediaPicker.current?.click(); }} className="flex h-11 w-full items-center gap-4 px-4 text-left text-[0.9375rem] font-medium transition-colors hover:bg-raised">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>
                {t('attach.media')}
              </button>
              <button role="menuitem" onClick={() => { setAttach(false); picker.current?.click(); }} className="flex h-11 w-full items-center gap-4 px-4 text-left text-[0.9375rem] font-medium transition-colors hover:bg-raised">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></svg>
                {t('attach.file')}
              </button>
            </div>
          )}
          </div>
          <textarea
            ref={ta}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                stageFiles(files, t);
              }
            }}
            value={text}
            rows={1}
            maxLength={MAX + 200}
            placeholder={t('compose.placeholder')}
            aria-label={t('compose.placeholder')}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              } else if (e.key === 'ArrowUp' && !text && !editing && !e.nativeEvent.isComposing) {
                // Telegram: Up in an empty box edits your last message
                const mine = useMessages.getState().threads[dialog.id]?.items.findLast((m) => m.out && m.id > 0 && !m.media);
                if (mine) {
                  e.preventDefault();
                  useCompose.getState().setEdit(mine);
                }
              } else if (e.key === 'Escape' && (editing || replyTo)) {
                e.stopPropagation();
                useCompose.getState().clear();
                if (editing) setText('');
              }
            }}
            className="scroll-thin max-h-[240px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-[0.6875rem] text-base leading-snug outline-none focus-visible:!outline-none placeholder:text-muted"
          />
          <div className="relative">
            <button
              data-emoji-toggle
              onClick={() => setEmoji((v) => !v)}
              aria-label={t('compose.emoji')}
              aria-expanded={emoji}
              className="grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 14.2a4 4 0 0 0 7 0" />
                <circle cx="9" cy="10" r=".6" fill="currentColor" />
                <circle cx="15" cy="10" r=".6" fill="currentColor" />
              </svg>
            </button>
            {emoji && <EmojiPicker onPick={insert} onClose={() => setEmoji(false)} />}
          </div>
          {trimmed || editing ? (
            <button
              onClick={() => void submit()}
              disabled={!trimmed || saving || text.length > MAX}
              aria-label={t('compose.send')}
              className="grid h-11 w-11 shrink-0 animate-pop place-items-center rounded-full text-accent transition hover:bg-accent/10 active:scale-95 disabled:opacity-40"
            >
              {editing ? '✓' : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12 2-12 2z" /></svg>}
            </button>
          ) : (
            <>
            <button
              onClick={() => setRound(true)}
              aria-label={t('round.open')}
              title={t('round.open')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="13" height="12" rx="3" /><path d="m16 10.5 5-3v9l-5-3" /></svg>
            </button>
            <button
              onClick={() => void voice.start()}
              aria-label={t('compose.voice')}
              title={t('compose.voice')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
              </svg>
            </button>
            </>
          )}
        </div>
        )}
        {text.length > MAX - 200 && (
          <p className={`mt-1 text-right text-xs ${text.length > MAX ? 'text-danger' : 'text-muted'}`}>
            {text.length} / {MAX}
          </p>
        )}
      </div>
      {round && (
        <RoundRecorder
          onClose={() => setRound(false)}
          onSend={(file, seconds) => {
            useUploads.getState().start(dialog.id, file, { asFile: false, round: true, duration: seconds, replyTo: useCompose.getState().replyTo?.id });
            useCompose.getState().clear();
          }}
        />
      )}
    </div>
  );
}
