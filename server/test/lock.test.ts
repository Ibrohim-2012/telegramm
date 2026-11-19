import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireLock } from '../src/lock.js';
import { SessionStore } from '../src/services/sessionStore.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lock-'));

describe('single server per Telegram session', () => {
  it('takes the lock, releases it, and replaces a stale one from a dead process', async () => {
    const file = path.join(tmp(), 'server.lock');
    const release = await acquireLock(file);
    expect(fs.readFileSync(file, 'utf8')).toBe(String(process.pid));
    release();
    expect(fs.existsSync(file)).toBe(false);
    fs.writeFileSync(file, '999999999'); // no such process
    const again = await acquireLock(file);
    expect(fs.readFileSync(file, 'utf8')).toBe(String(process.pid));
    again();
  });

  it('refuses to start next to a live server', async () => {
    const file = path.join(tmp(), 'server.lock');
    fs.writeFileSync(file, String(process.ppid)); // the parent process is alive
    await expect(acquireLock(file, 400)).rejects.toThrow(/Boshqa server/);
  });
});

describe('session file is never thrown away by a rejection', () => {
  it('archive keeps a .bak copy and clears the live file; clear (user logout) deletes', async () => {
    const dir = tmp();
    const file = path.join(dir, 'session.enc');
    const store = new SessionStore(file, 'a-secret-a-secret-a-secret-1234');
    await store.save('SESSION');
    await store.archive();
    expect(await store.load()).toBeNull();
    expect(fs.existsSync(`${file}.bak`)).toBe(true);
    await store.save('NEW');
    await store.clear();
    expect(fs.existsSync(file)).toBe(false);
  });
});
