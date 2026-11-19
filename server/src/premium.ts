import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * "Premium" of THIS app (not Telegram's own Premium): a free trial, then paid months activated with single-use codes.
 * State lives in a small signed file next to the Telegram session, so it works only in this installation.
 */

export const ACCENTS = ['blue', 'green', 'pink', 'orange', 'teal', 'violet'] as const;
export type Accent = (typeof ACCENTS)[number];

export interface PremiumSettings {
  emojiStatus?: string;
  accent?: Accent;
}

interface FileState {
  trialStartedAt?: number;
  paidUntil?: number;
  /** Nonces of codes that were already used (each code works once). */
  redeemed: string[];
  settings: PremiumSettings;
}

export type PremiumState = 'none' | 'trial' | 'active' | 'expired';

export interface PremiumStatus {
  state: PremiumState;
  /** Is any premium perk available right now? */
  active: boolean;
  /** Unix ms when the current access ends (trial or paid, whichever is later). */
  until?: number;
  daysLeft?: number;
  trialUsed: boolean;
  trialMonths: number;
  settings: PremiumSettings;
}

export class PremiumError extends Error {
  constructor(
    public readonly code: 'TRIAL_USED' | 'CODE_INVALID' | 'CODE_USED' | 'PREMIUM_REQUIRED' | 'BAD_SETTING',
    message: string,
  ) {
    super(message);
  }
}

const DAY = 86_400_000;

export function addMonths(from: number, months: number): number {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export class PremiumStore {
  private state: FileState = { redeemed: [], settings: {} };

  constructor(
    private readonly file: string,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
    readonly trialMonths = 2,
  ) {
    this.load();
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(`premium-state:${body}`).digest('hex');
  }

  private load() {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return; // first run: nothing yet
    }
    try {
      const { body, sig } = JSON.parse(raw) as { body: string; sig: string };
      const a = Buffer.from(this.sign(body));
      const b = Buffer.from(String(sig));
      // A hand-edited or foreign file is ignored rather than trusted.
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        const saved = JSON.parse(body) as Partial<FileState>;
        this.state = { ...saved, redeemed: saved.redeemed ?? [], settings: saved.settings ?? {} };
      }
    } catch {
      /* corrupted: start clean */
    }
  }

  private save() {
    const body = JSON.stringify(this.state);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ body, sig: this.sign(body) }), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  status(): PremiumStatus {
    const now = this.now();
    const trialEnds = this.state.trialStartedAt ? addMonths(this.state.trialStartedAt, this.trialMonths) : 0;
    const paid = this.state.paidUntil ?? 0;
    const until = Math.max(trialEnds, paid) || undefined;
    const active = !!until && now < until;
    let state: PremiumState = 'none';
    if (active) state = paid > now ? 'active' : 'trial';
    else if (until) state = 'expired';
    return {
      state,
      active,
      until,
      daysLeft: active ? Math.max(1, Math.ceil((until! - now) / DAY)) : undefined,
      trialUsed: !!this.state.trialStartedAt,
      trialMonths: this.trialMonths,
      // Perks that were switched on stay stored, but only count while premium is active.
      settings: active ? this.state.settings : {},
    };
  }

  isActive(): boolean {
    return this.status().active;
  }

  startTrial(): PremiumStatus {
    if (this.state.trialStartedAt) throw new PremiumError('TRIAL_USED', 'Bepul sinov allaqachon ishlatilgan');
    this.state.trialStartedAt = this.now();
    this.save();
    return this.status();
  }

  /** Code format: MT-<months>-<nonce>-<signature>; made with `npm run premium:code`. */
  static makeCode(secret: string, months: number, nonce = crypto.randomBytes(5).toString('hex').toUpperCase()): string {
    const sig = crypto.createHmac('sha256', secret).update(`premium-code:${months}:${nonce}`).digest('hex').slice(0, 12).toUpperCase();
    return `MT-${months}-${nonce}-${sig}`;
  }

  redeem(raw: string): PremiumStatus {
    const m = /^MT-(\d{1,2})-([0-9A-F]{10})-([0-9A-F]{12})$/.exec(raw.trim().toUpperCase());
    const months = m ? Number(m[1]) : 0;
    if (!m || months < 1 || months > 24) throw new PremiumError('CODE_INVALID', 'Kod noto‘g‘ri');
    const expected = PremiumStore.makeCode(this.secret, months, m[2]);
    const a = Buffer.from(expected);
    const b = Buffer.from(m[0]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new PremiumError('CODE_INVALID', 'Kod noto‘g‘ri');
    if (this.state.redeemed.includes(m[2]!)) throw new PremiumError('CODE_USED', 'Bu kod allaqachon ishlatilgan');
    const now = this.now();
    // Months stack on top of whatever is left.
    this.state.paidUntil = addMonths(Math.max(now, this.state.paidUntil ?? 0, this.state.trialStartedAt ? addMonths(this.state.trialStartedAt, this.trialMonths) : 0), months);
    this.state.redeemed.push(m[2]!);
    this.save();
    return this.status();
  }

  updateSettings(patch: { emojiStatus?: string | null; accent?: Accent | null }): PremiumStatus {
    if (!this.isActive()) throw new PremiumError('PREMIUM_REQUIRED', 'Bu imkoniyat Premium uchun');
    if (patch.accent && !ACCENTS.includes(patch.accent)) throw new PremiumError('BAD_SETTING', 'Noto‘g‘ri rang');
    const s = { ...this.state.settings };
    if ('emojiStatus' in patch) {
      if (patch.emojiStatus) s.emojiStatus = patch.emojiStatus;
      else delete s.emojiStatus;
    }
    if ('accent' in patch) {
      if (patch.accent) s.accent = patch.accent;
      else delete s.accent;
    }
    this.state.settings = s;
    this.save();
    return this.status();
  }
}
