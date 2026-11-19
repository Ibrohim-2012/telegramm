import fs from 'node:fs';
import path from 'node:path';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * One server per Telegram session. Two processes using the same login at once make Telegram revoke it
 * (AUTH_KEY_DUPLICATED), which logs you out. Waits briefly for a restarting predecessor, then refuses to start.
 */
export async function acquireLock(file: string, waitMs = 8000): Promise<() => void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      break;
    } catch {
      let other = 0;
      try {
        other = Number(fs.readFileSync(file, 'utf8'));
      } catch {
        /* vanished meanwhile: retry */
      }
      if (other === process.pid) break;
      if (!other || !alive(other)) {
        fs.rmSync(file, { force: true }); // stale lock of a crashed process
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Boshqa server (PID ${other}) shu Telegram sessiyasidan foydalanmoqda. Avval uni to‘xtating.`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.rmSync(file, { force: true });
    } catch {
      /* already gone */
    }
  };
  process.on('exit', release);
  return release;
}
