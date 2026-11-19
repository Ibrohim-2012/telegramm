'use client';
import { useEffect } from 'react';
import { useChats } from '@/store/chats';
import { Sidebar } from './Sidebar';
import { ChatPanel } from './ChatPanel';
import { Toasts } from './Toasts';

export function AppShell() {
  const hasChat = useChats((s) => s.selectedId !== null);

  // Ctrl/Cmd+K focuses chat search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement | null)?.tagName ?? '') || (e.target as HTMLElement | null)?.isContentEditable;
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[type=search]')?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useChats.getState().select(null);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[type=search]')?.focus());
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      <div className={`${hasChat ? 'hidden md:flex' : 'flex'} h-full w-full shrink-0 md:w-[clamp(320px,34vw,420px)] lg:w-[clamp(400px,36vw,500px)]`}>
        <Sidebar />
      </div>
      <main id="main" tabIndex={-1} className={`${hasChat ? 'flex' : 'hidden md:flex'} h-full min-w-0 flex-1 outline-none`}>
        <ChatPanel />
      </main>
      <Toasts />
    </div>
  );
}
