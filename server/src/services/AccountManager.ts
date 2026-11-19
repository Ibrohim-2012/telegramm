import fs from 'node:fs';
import path from 'node:path';
import { TgError, type AuthState, type Me, type TgEvent } from '../types.js';
import type { TelegramService } from './TelegramService.js';

export interface AccountInfo {
  slot: number;
  active: boolean;
  ready: boolean;
  me?: Me;
}

type Log = (msg: string, extra?: Record<string, unknown>) => void;
type Initable = TelegramService & { init?: () => Promise<void> };

/** Telegram allows three accounts side by side in its apps; so does this client. */
export const MAX_ACCOUNTS = 3;

const DELEGATED = [
  'sendCode', 'signIn', 'checkPassword', 'getMe', 'getDialogs', 'createGroup', 'createChannel', 'getCalls', 'getFolders', 'getHistory',
  'searchGlobal', 'getProfile', 'sendMessage', 'editMessage', 'deleteMessages', 'forwardMessages', 'sendMedia', 'openMedia', 'getAvatar',
  'react', 'getShared', 'setPinned', 'setMuted', 'setArchived', 'searchMessages', 'markRead', 'setTyping',
] as const;

/**
 * Several signed-in accounts, one of them active. Every API call goes to the active account, so the rest of the
 * server does not need to know that more than one exists. Realtime events of inactive accounts are not forwarded.
 */
export class AccountManager implements TelegramService {
  declare sendCode: TelegramService['sendCode'];
  declare signIn: TelegramService['signIn'];
  declare checkPassword: TelegramService['checkPassword'];
  declare getMe: TelegramService['getMe'];
  declare getDialogs: TelegramService['getDialogs'];
  declare createGroup: TelegramService['createGroup'];
  declare createChannel: TelegramService['createChannel'];
  declare getCalls: TelegramService['getCalls'];
  declare getFolders: TelegramService['getFolders'];
  declare getHistory: TelegramService['getHistory'];
  declare searchGlobal: TelegramService['searchGlobal'];
  declare getProfile: TelegramService['getProfile'];
  declare sendMessage: TelegramService['sendMessage'];
  declare editMessage: TelegramService['editMessage'];
  declare deleteMessages: TelegramService['deleteMessages'];
  declare forwardMessages: TelegramService['forwardMessages'];
  declare sendMedia: TelegramService['sendMedia'];
  declare openMedia: TelegramService['openMedia'];
  declare getAvatar: TelegramService['getAvatar'];
  declare react: TelegramService['react'];
  declare getShared: TelegramService['getShared'];
  declare setPinned: TelegramService['setPinned'];
  declare setMuted: TelegramService['setMuted'];
  declare setArchived: TelegramService['setArchived'];
  declare searchMessages: TelegramService['searchMessages'];
  declare markRead: TelegramService['markRead'];
  declare setTyping: TelegramService['setTyping'];

  private readonly slots = new Map<number, Initable>();
  private readonly unsubs = new Map<number, () => void>();
  private readonly initialised = new Set<number>();
  private readonly meCache = new Map<number, Me>();
  private readonly handlers = new Set<(e: TgEvent) => void>();
  private active = 0;
  /** While a new account is being signed in: the account to return to on cancel. */
  private returnTo: number | null = null;

  constructor(
    private readonly factory: (slot: number) => Initable,
    private readonly file: string | null,
    private readonly log: Log = () => {},
  ) {
    for (const k of DELEGATED) {
      (this as unknown as Record<string, unknown>)[k] = (...args: unknown[]) => (this.cur() as unknown as Record<string, (...a: unknown[]) => unknown>)[k]!(...args);
    }
    let slots = [0];
    try {
      if (file) {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { slots?: number[]; active?: number };
        const ok = (saved.slots ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < 10).slice(0, MAX_ACCOUNTS);
        if (ok.length > 0) {
          slots = ok;
          this.active = ok.includes(saved.active ?? -1) ? (saved.active as number) : ok[0]!;
        }
      }
    } catch {
      /* first run */
    }
    for (const s of slots) this.create(s);
  }

  get mode(): 'mock' | 'real' {
    return this.cur().mode;
  }

  private cur(): Initable {
    return this.slots.get(this.active)!;
  }

  private create(slot: number): Initable {
    const svc = this.factory(slot);
    this.slots.set(slot, svc);
    this.unsubs.set(slot, svc.onEvent((e) => slot === this.active && this.handlers.forEach((h) => h(e))));
    return svc;
  }

  private save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ slots: [...this.slots.keys()], active: this.active }));
    } catch (e) {
      this.log('accounts file not saved', { error: String(e) });
    }
  }

  /** Restores every saved session. Network errors are rethrown (callers retry; finished accounts are not redone). */
  async init(): Promise<void> {
    let failure: unknown;
    for (const [slot, svc] of this.slots) {
      if (this.initialised.has(slot)) continue;
      try {
        await svc.init?.();
        this.initialised.add(slot);
      } catch (e) {
        failure = e;
      }
    }
    if (failure) throw failure;
    // An account whose sign-in never finished (browser closed halfway) is not kept.
    // With nobody signed in, one empty slot (the lowest) stays so the login screen has something to sign into.
    const entries = [...this.slots];
    const anyReady = entries.some(([, v]) => v.getAuthState() === 'ready');
    const keepEmpty = anyReady ? undefined : Math.min(...entries.map(([s]) => s));
    for (const [slot, svc] of entries) {
      if (svc.getAuthState() !== 'ready' && slot !== keepEmpty) await this.drop(slot);
    }
    if (!this.slots.has(this.active)) {
      this.active = [...this.slots].find(([, v]) => v.getAuthState() === 'ready')?.[0] ?? [...this.slots.keys()][0]!;
    }
    this.save();
  }

  getAuthState(): AuthState {
    return this.cur().getAuthState();
  }

  onEvent(handler: (e: TgEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async list(): Promise<AccountInfo[]> {
    const out: AccountInfo[] = [];
    for (const [slot, svc] of this.slots) {
      const ready = svc.getAuthState() === 'ready';
      let me = this.meCache.get(slot);
      if (ready && !me) {
        try {
          me = await svc.getMe();
          this.meCache.set(slot, me);
        } catch {
          /* shown without a name */
        }
      }
      if (ready || slot === this.active) out.push({ slot, active: slot === this.active, ready, me: ready ? me : undefined });
    }
    return out;
  }

  switchTo(slot: number): void {
    const svc = this.slots.get(slot);
    if (!svc || svc.getAuthState() !== 'ready') throw new TgError('BAD_INPUT', 'Akkaunt topilmadi');
    this.dropPending(slot);
    this.active = slot;
    this.save();
    this.log('account switched', { slot });
  }

  /** Opens an empty slot and makes it active: the normal login screen then signs the new account in. */
  addAccount(): number {
    const pending = [...this.slots].find(([s, v]) => s !== this.active && v.getAuthState() !== 'ready');
    if (pending) {
      this.returnTo ??= this.active;
      this.active = pending[0];
      this.save();
      return pending[0];
    }
    if (this.slots.size >= MAX_ACCOUNTS) throw new TgError('ACCOUNT_LIMIT', `Ko‘pi bilan ${MAX_ACCOUNTS} ta akkaunt qo‘shish mumkin`);
    let slot = 0;
    while (this.slots.has(slot)) slot++;
    const svc = this.create(slot);
    this.initialised.add(slot);
    if (this.cur().getAuthState() === 'ready') this.returnTo = this.active;
    this.active = slot;
    void svc; // fresh service: logged out until the login flow finishes
    this.save();
    return slot;
  }

  /** Leaves the sign-in of a new account and returns to the account that was open. */
  async cancelAdd(): Promise<void> {
    const slot = this.active;
    if (this.cur().getAuthState() === 'ready' || this.slots.size < 2) return;
    const back = this.returnTo !== null && this.slots.has(this.returnTo) ? this.returnTo : [...this.slots.keys()].find((s) => s !== slot)!;
    this.returnTo = null;
    this.active = back;
    await this.drop(slot);
    this.save();
  }

  private dropPending(except: number) {
    for (const [s, v] of [...this.slots]) if (s !== except && s !== this.active && v.getAuthState() !== 'ready') void this.drop(s);
  }

  private async drop(slot: number) {
    const svc = this.slots.get(slot);
    this.unsubs.get(slot)?.();
    this.unsubs.delete(slot);
    this.slots.delete(slot);
    this.initialised.delete(slot);
    this.meCache.delete(slot);
    await svc?.dispose().catch(() => {});
  }

  /** Signs out of the active account. With others present it is removed and the next one takes over. */
  async logout(): Promise<void> {
    const slot = this.active;
    const svc = this.cur();
    await svc.logout();
    this.meCache.delete(slot);
    if (this.slots.size > 1) {
      const next = [...this.slots].find(([s, v]) => s !== slot && v.getAuthState() === 'ready')?.[0] ?? [...this.slots.keys()].find((s) => s !== slot)!;
      this.active = next;
      await this.drop(slot);
    }
    this.returnTo = null;
    this.save();
  }

  async dispose(): Promise<void> {
    for (const s of [...this.slots.values()]) await s.dispose();
    this.handlers.clear();
  }
}
