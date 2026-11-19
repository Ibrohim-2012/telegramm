'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/lib/format';
import type { Dialog } from '@/lib/types';
import { useCompose } from '@/store/compose';
import { useUploads } from '@/store/uploads';
import { useT } from '@/store/ui';
import { Modal } from './Modal';

function Thumb({ file, asFile }: { file: File; asFile: boolean }) {
  const url = useMemo(() => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (url && !asFile) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-ink">
      {(file.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}
    </span>
  );
}

export function UploadDialog({ dialog }: { dialog: Dialog }) {
  const t = useT();
  const files = useUploads((s) => s.staged);
  const [caption, setCaption] = useState('');
  const [asFile, setAsFile] = useState(false);
  const hasImage = files.some((f) => f.type.startsWith('image/'));

  const close = () => useUploads.getState().unstage();
  const send = () => {
    const reply = useCompose.getState().replyTo?.id;
    files.forEach((f, i) => useUploads.getState().start(dialog.id, f, { asFile: asFile || !f.type.startsWith('image/') && !f.type.startsWith('video/') && !f.type.startsWith('audio/'), caption: i === 0 ? caption.trim() || undefined : undefined, replyTo: i === 0 ? reply : undefined }));
    useCompose.getState().clear();
    close();
  };

  return (
    <Modal title={t('attach.title')} onClose={close}>
      <ul className="scroll-thin mb-3 max-h-56 space-y-2 overflow-y-auto">
        {files.map((f) => (
          <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-3">
            <Thumb file={f} asFile={asFile} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{f.name}</span>
              <span className="block text-xs text-muted">{formatBytes(f.size)}</span>
            </span>
          </li>
        ))}
      </ul>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.preventDefault(), send())}
        maxLength={1024}
        placeholder={t('attach.caption')}
        aria-label={t('attach.caption')}
        className="mb-3 w-full rounded-xl bg-raised px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
      />
      {hasImage && (
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={asFile} onChange={(e) => setAsFile(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          {t('attach.asFile')}
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={close} className="rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:text-ink">
          {t('compose.cancel')}
        </button>
        <button onClick={send} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110">
          {t('attach.send')}
        </button>
      </div>
    </Modal>
  );
}
