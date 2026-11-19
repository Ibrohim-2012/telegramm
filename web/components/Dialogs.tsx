'use client';
import { useMemo, useState } from 'react';
import type { Dialog, Message } from '@/lib/types';
import { useChats } from '@/store/chats';
import { useMessages } from '@/store/messages';
import { useToast } from '@/store/toast';
import { useT } from '@/store/ui';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

export function DeleteDialog({ dialog, messages, onClose, onDone }: { dialog: Dialog; messages: Message[]; onClose: () => void; onDone?: () => void }) {
  const t = useT();
  const canRevoke = dialog.kind === 'private' || messages.every((m) => m.out);
  const run = (revoke: boolean) => {
    onClose();
    void useMessages.getState().remove(dialog.id, messages.map((m) => m.id), revoke).then(() => onDone?.());
  };
  return (
    <Modal title={messages.length > 1 ? `${t('delete.title')} (${messages.length})` : t('delete.title')} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {canRevoke && (
          <button onClick={() => run(true)} className="rounded-xl bg-danger px-4 py-2.5 font-medium text-white transition hover:brightness-110">
            {t('delete.all')}
          </button>
        )}
        <button onClick={() => run(false)} className="rounded-xl bg-raised px-4 py-2.5 font-medium text-danger transition hover:brightness-95">
          {t('delete.me')}
        </button>
        <button onClick={onClose} className="rounded-xl px-4 py-2.5 font-medium text-muted transition hover:text-ink">
          {t('compose.cancel')}
        </button>
      </div>
    </Modal>
  );
}

export function ForwardDialog({ from, messages, onClose, onDone }: { from: Dialog; messages: Message[]; onClose: () => void; onDone?: () => void }) {
  const t = useT();
  const dialogs = useChats((s) => s.dialogs);
  const meId = useChats((s) => s.meId);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(
    () => dialogs.filter((d) => d.kind !== 'channel' && d.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60),
    [dialogs, q],
  );
  const go = async (to: Dialog) => {
    if (busy) return;
    setBusy(true);
    const ok = await useMessages.getState().forward(from.id, messages.map((m) => m.id), to.id);
    if (ok) {
      useToast.getState().show(`${t('forward.done')} → ${to.title}`);
      onDone?.();
    }
    onClose();
  };
  return (
    <Modal title={t('forward.title')} onClose={onClose}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('forward.search')}
        aria-label={t('forward.search')}
        className="mb-2 w-full rounded-xl bg-raised px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
      />
      <ul className="scroll-thin -mr-2 max-h-72 overflow-y-auto pr-2">
        {list.map((d) => (
          <li key={d.id}>
            <button onClick={() => void go(d)} disabled={busy} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-raised disabled:opacity-60">
              <Avatar id={d.id} title={d.title} size={36} photo={d.photo} saved={meId === d.id} />

              <span className="truncate font-medium">{meId === d.id ? t('saved') : d.title}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-sm text-muted">{t('chats.empty')}</li>}
      </ul>
    </Modal>
  );
}

/** Contacts / "new message": every private chat, searchable; picking one opens it. */
export function ContactsDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const t = useT();
  const dialogs = useChats((s) => s.dialogs);
  const meId = useChats((s) => s.meId);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dialogs
      .filter((x) => x.kind === 'private' && x.id !== meId && (!needle || x.title.toLowerCase().includes(needle) || (x.username?.toLowerCase().includes(needle) ?? false)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 80);
  }, [dialogs, meId, q]);
  const open = (x: Dialog) => {
    onClose();
    useChats.getState().select(x.id);
  };
  return (
    <Modal title={title} onClose={onClose}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('forward.search')}
        aria-label={t('forward.search')}
        className="mb-2 h-11 w-full rounded-[22px] bg-raised px-4 text-base outline-none ring-1 ring-transparent focus:ring-accent"
      />
      <ul className="scroll-thin -mr-2 max-h-80 overflow-y-auto pr-2">
        {list.map((x) => (
          <li key={x.id}>
            <button data-ripple onClick={() => open(x)} className="flex h-[60px] w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-raised">
              <Avatar id={x.id} title={x.title} size={42} online={x.online} photo={x.photo} />
              <span className="min-w-0">
                <span className="block truncate text-base font-medium">{x.title}</span>
                <span className="block truncate text-sm text-muted">{x.username ? `@${x.username}` : x.online ? t('chat.online') : ''}</span>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-8 text-center text-sm text-muted">{t('contacts.empty')}</li>}
      </ul>
    </Modal>
  );
}
