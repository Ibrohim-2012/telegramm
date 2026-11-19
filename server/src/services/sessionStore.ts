import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** AES-256-GCM encrypted file holding the GramJS StringSession. Never sent to the browser. */
export class SessionStore {
  private readonly key: Buffer;

  constructor(
    private readonly file: string,
    secret: string,
  ) {
    this.key = crypto.scryptSync(secret, 'mening-telegramim-session', 32);
  }

  async load(): Promise<string | null> {
    let raw: Buffer;
    try {
      raw = Buffer.from(await fs.readFile(this.file, 'utf8'), 'base64');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    try {
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const data = raw.subarray(28);
      const d = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    } catch {
      // Wrong SESSION_SECRET or corrupted file: treat as logged out, never crash.
      return null;
    }
  }

  async save(session: string): Promise<void> {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(session, 'utf8'), c.final()]);
    const payload = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, payload, { mode: 0o600 });
  }

  /**
   * Telegram rejected the session (not the user's choice). Never throw the login away for good:
   * keep it next to the original as `.bak`, so a wrongly reported error costs nothing.
   */
  async archive(): Promise<void> {
    await fs.rename(this.file, `${this.file}.bak`).catch(() => {});
  }

  async clear(): Promise<void> {
    await fs.rm(this.file, { force: true });
  }
}
