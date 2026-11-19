/**
 * Live verification against YOUR real Telegram account (Saved Messages only).
 *   npm run live            -> real account (asks phone / code / 2FA in this terminal)
 *   npm run live -- --mock  -> dry run of the same checks against the built-in mock
 */
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { GramJsAdapter } from '../services/GramJsAdapter.js';
import { MockTelegramService, MOCK_CODE } from '../services/MockTelegramService.js';
import { RealTelegramService } from '../services/RealTelegramService.js';
import { SessionStore } from '../services/sessionStore.js';
import type { TelegramService } from '../services/TelegramService.js';
import { formatTable, runLiveChecks } from './liveChecks.js';

const mock = process.argv.includes('--mock');
const log = (s: string) => console.log(s);

function ask(q: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    if (!hidden) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(q, (a) => (rl.close(), resolve(a.trim())));
      return;
    }
    // Hidden input for the 2FA password: no echo, never logged.
    process.stdout.write(q);
    const stdin = process.stdin;
    let buf = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function login(svc: TelegramService) {
  if (svc.getAuthState() === 'ready') return log('Saqlangan sessiya topildi — qayta kirish shart emas.');
  for (;;) {
    const phone = mock ? '+998901234567' : await ask('Telefon raqami (+998901234567 ko‘rinishida): ');
    try {
      await svc.sendCode(phone);
      break;
    } catch (e) {
      log(`  ❌ ${(e as Error).message}. Qayta urinib ko‘ring.`);
      if (mock) process.exit(1);
    }
  }
  for (;;) {
    const code = mock ? MOCK_CODE : await ask('Telegramdan kelgan kod: ');
    try {
      const st = await svc.signIn(code);
      if (st === 'password_needed') {
        for (;;) {
          try {
            await svc.checkPassword(await ask('2FA (bulut) paroli: ', true));
            break;
          } catch (e) {
            log(`  ❌ ${(e as Error).message}`);
          }
        }
      }
      return;
    } catch (e) {
      const code2 = (e as { code?: string }).code;
      log(`  ❌ ${(e as Error).message}`);
      if (code2 === 'PHONE_CODE_EXPIRED' || code2 === 'FLOOD_WAIT') process.exit(1);
    }
  }
}

async function main() {
  let svc: TelegramService;
  let restart: (() => Promise<TelegramService>) | undefined;

  if (mock) {
    svc = new MockTelegramService({ realtimeMs: 0 });
    log('MOCK rejim: haqiqiy Telegramga ulanilmaydi (tekshiruv mantig‘ini sinash uchun).');
  } else {
    if (config.mock) {
      log('❌ TG_API_ID / TG_API_HASH topilmadi. .env faylini to‘ldiring (README → "api_id olish"), so‘ng `npm run doctor`.');
      process.exit(1);
    }
    const { apiId, apiHash } = config as { apiId: number; apiHash: string };
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/session.enc');
    const store = new SessionStore(file, config.sessionSecret);
    const make = async () => {
      const s = new RealTelegramService((sess) => new GramJsAdapter(apiId, apiHash, sess), store, () => {});
      await s.init();
      return s;
    };
    svc = await make();
    restart = make;
  }

  await login(svc);
  log('\nTekshiruvlar (faqat Saqlangan xabarlar):');
  const rows = await runLiveChecks({
    svc,
    restart,
    searchQuery: mock ? 'barno' : 'telegram',
    log,
    confirmLogout: mock
      ? undefined
      : async () => /^y(es)?$|^ha$/i.test(await ask('\nSessiyani tugatib chiqilsinmi (logout)? [y/N]: ')),
  });

  log(`\n${formatTable(rows)}`);
  const failed = rows.some((r) => r.status === 'fail');
  log(failed ? '\n❌ Ba’zi tekshiruvlar o‘tmadi. Yuqoridagi xatoni ko‘rib, tuzatib qayta ishga tushiring.' : '\n✅ Hammasi o‘tdi.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ Kutilmagan xato:', e instanceof Error ? e.message : e);
  process.exit(1);
});
