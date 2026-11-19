/** `npm run doctor` — checks everything needed to run against real Telegram, with the exact fix for every ❌. */
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { GramJsAdapter } from '../services/GramJsAdapter.js';
import { SessionStore } from '../services/sessionStore.js';

type Status = 'ok' | 'warn' | 'fail';
interface Result {
  name: string;
  status: Status;
  detail: string;
  fix?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const dataDir = path.resolve(here, '../../data');
const sessionFile = path.join(dataDir, 'session.enc');

const results: Result[] = [];
const add = (r: Result) => {
  results.push(r);
  const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️ ' : '❌';
  console.log(`${icon} ${r.name} — ${r.detail}`);
  if (r.fix && r.status !== 'ok') console.log(`   ↳ Yechim: ${r.fix}`);
};

const tcp = (host: string, port: number, ms = 5000) =>
  new Promise<number>((resolve, reject) => {
    const t0 = Date.now();
    const s = net.connect({ host, port });
    const fail = (e: Error) => (s.destroy(), reject(e));
    s.setTimeout(ms, () => fail(new Error('vaqt tugadi')));
    s.once('error', fail);
    s.once('connect', () => (s.destroy(), resolve(Date.now() - t0)));
  });

const portState = (port: number) =>
  new Promise<'free' | 'busy'>((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve('busy'));
    s.once('listening', () => s.close(() => resolve('free')));
    s.listen(port, '127.0.0.1');
  });

async function health(port: number): Promise<{ mode?: string; auth?: string } | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? ((await r.json()) as { mode?: string; auth?: string }) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('Mening Telegramim — doctor\n');

  // 1. Node
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20 ? { name: 'Node.js', status: 'ok', detail: `v${process.versions.node}` } : { name: 'Node.js', status: 'fail', detail: `v${process.versions.node} (kamida 20 kerak)`, fix: 'https://nodejs.org dan Node 20+ (LTS) o‘rnating' });

  // 2. .env + keys
  const envPath = path.join(root, '.env');
  const hasEnv = fs.existsSync(envPath);
  add(hasEnv ? { name: '.env fayli', status: 'ok', detail: envPath } : { name: '.env fayli', status: 'warn', detail: 'topilmadi — MOCK rejim ishlaydi', fix: '`cp .env.example .env` (Windows: `copy .env.example .env`) va TG_API_ID / TG_API_HASH ni to‘ldiring' });

  const idOk = !!config.apiId && Number.isInteger(config.apiId) && config.apiId > 0;
  const hashOk = !!config.apiHash && /^[0-9a-f]{32}$/i.test(config.apiHash);
  if (!process.env.TG_API_ID && !process.env.TG_API_HASH) {
    add({ name: 'TG_API_ID / TG_API_HASH', status: 'warn', detail: 'bo‘sh — MOCK rejim', fix: 'https://my.telegram.org → API development tools → api_id va api_hash ni .env ga yozing' });
  } else {
    add(idOk ? { name: 'TG_API_ID', status: 'ok', detail: 'to‘g‘ri ko‘rinishda' } : { name: 'TG_API_ID', status: 'fail', detail: `noto‘g‘ri: "${process.env.TG_API_ID ?? ''}"`, fix: 'api_id faqat raqamlardan iborat bo‘lishi kerak (my.telegram.org)' });
    add(hashOk ? { name: 'TG_API_HASH', status: 'ok', detail: '32 belgili hex' } : { name: 'TG_API_HASH', status: 'fail', detail: 'noto‘g‘ri uzunlik/format', fix: 'api_hash — 32 ta hex belgi (my.telegram.org dan nusxa oling, bo‘sh joysiz)' });
  }
  const secretWeak = config.sessionSecret === 'dev-only-secret' || config.sessionSecret.length < 32;
  add(secretWeak ? { name: 'SESSION_SECRET', status: config.mock ? 'warn' : 'fail', detail: 'kalit zaif yoki standart', fix: 'Kamida 32 belgili tasodifiy matn: `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`' } : { name: 'SESSION_SECRET', status: 'ok', detail: `${config.sessionSecret.length} belgi` });

  const publicOrigin = !/localhost|127\.0\.0\.1/.test(config.webOrigin);
  add(config.accessToken ? { name: 'ACCESS_TOKEN (server himoyasi)', status: 'ok', detail: 'o‘rnatilgan' } : publicOrigin ? { name: 'ACCESS_TOKEN (server himoyasi)', status: 'fail', detail: 'WEB_ORIGIN lokal emas, lekin kirish kodi yo‘q — serverga yetgan har kim chatlaringizni ko‘radi', fix: '.env ga ACCESS_TOKEN=<kamida 8 belgi> qo‘shing' } : { name: 'ACCESS_TOKEN (server himoyasi)', status: 'ok', detail: 'lokal ishlatish — shart emas (deploy qilsangiz o‘rnating)' });

  // 3. Origin + ports
  try {
    new URL(config.webOrigin);
    add({ name: 'WEB_ORIGIN', status: 'ok', detail: config.webOrigin });
  } catch {
    add({ name: 'WEB_ORIGIN', status: 'fail', detail: `noto‘g‘ri URL: ${config.webOrigin}`, fix: '.env da WEB_ORIGIN=http://localhost:3000 ko‘rinishida yozing' });
  }
  for (const [label, port] of [['Server porti', config.port], ['Web porti', 3000]] as const) {
    const s = await portState(port);
    if (s === 'free') add({ name: `${label} ${port}`, status: 'ok', detail: 'bo‘sh' });
    else {
      const h = label === 'Server porti' ? await health(port) : null;
      if (h) add({ name: `${label} ${port}`, status: 'ok', detail: `ilova allaqachon ishlayapti (${h.mode}, ${h.auth})` });
      else add({ name: `${label} ${port}`, status: label === 'Server porti' ? 'fail' : 'warn', detail: 'band (boshqa dastur)', fix: label === 'Server porti' ? `.env da PORT ni o‘zgartiring yoki ${port}-portni band qilgan dasturni to‘xtating` : 'Boshqa dasturni to‘xtating yoki `next dev -p 3001` ishlating' });
    }
  }

  // 4. Network to Telegram
  try {
    const a = await dns.lookup('web.telegram.org');
    add({ name: 'DNS (web.telegram.org)', status: 'ok', detail: a.address });
  } catch {
    add({ name: 'DNS (web.telegram.org)', status: 'fail', detail: 'domen topilmadi', fix: 'Internet / DNS ni tekshiring (8.8.8.8 yoki 1.1.1.1 sinab ko‘ring), VPN yoqilmaganligiga ishonch hosil qiling' });
  }
  let dcOk = false;
  for (const [dc, ip] of [['DC2', '149.154.167.51'], ['DC4', '149.154.167.91'], ['DC1', '149.154.175.53']] as const) {
    try {
      const t = await tcp(ip, 443);
      add({ name: `Telegram ${dc} (${ip}:443)`, status: 'ok', detail: `${t} ms` });
      dcOk = true;
      break;
    } catch (e) {
      add({ name: `Telegram ${dc} (${ip}:443)`, status: 'warn', detail: (e as Error).message, fix: 'Firewall/antivirus 443-portga chiqishga ruxsat berishini tekshiring; ba’zi tarmoqlarda Telegram bloklangan — VPN yoki boshqa tarmoq' });
    }
  }
  if (!dcOk) add({ name: 'Telegram serverlariga ulanish', status: 'fail', detail: 'hech bir DC ga ulanib bo‘lmadi', fix: 'Internetni tekshiring yoki VPN ishlating' });

  // 5. Data dir + session
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    add({ name: 'Ma’lumotlar papkasi', status: 'ok', detail: dataDir });
  } catch {
    add({ name: 'Ma’lumotlar papkasi', status: 'fail', detail: `yozib bo‘lmaydi: ${dataDir}`, fix: 'Papkaga yozish huquqini bering' });
  }

  let session: string | null = null;
  if (!fs.existsSync(sessionFile)) {
    add({ name: 'Sessiya fayli', status: 'ok', detail: 'hali yo‘q (birinchi kirishda yaratiladi)' });
  } else {
    session = await new SessionStore(sessionFile, config.sessionSecret).load();
    add(session ? { name: 'Sessiya fayli', status: 'ok', detail: 'mavjud va shifrdan ochildi' } : { name: 'Sessiya fayli', status: 'fail', detail: 'shifrdan ochib bo‘lmadi (SESSION_SECRET o‘zgargan yoki fayl buzilgan)', fix: `${sessionFile} ni o‘chiring va qayta kiring, yoki avvalgi SESSION_SECRET ni qaytaring` });
  }

  // 6. Is the saved session still valid at Telegram?
  if (session && idOk && hashOk && dcOk) {
    const adapter = new GramJsAdapter(config.apiId!, config.apiHash!, session);
    try {
      await Promise.race([adapter.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error('ulanish vaqti tugadi')), 15_000))]);
      const ok = await adapter.isAuthorized();
      add(ok ? { name: 'Sessiya Telegramda amal qiladi', status: 'ok', detail: 'avtorizatsiya tasdiqlandi' } : { name: 'Sessiya Telegramda amal qiladi', status: 'fail', detail: 'sessiya bekor qilingan', fix: `${sessionFile} ni o‘chirib, ilovada qayta kiring` });
    } catch (e) {
      add({ name: 'Sessiya Telegramda amal qiladi', status: 'warn', detail: (e as Error).message, fix: 'Keyinroq qayta urinib ko‘ring (internet yoki FLOOD_WAIT bo‘lishi mumkin)' });
    } finally {
      await adapter.disconnect().catch(() => {});
    }
  }

  const bad = results.filter((r) => r.status === 'fail').length;
  const warn = results.filter((r) => r.status === 'warn').length;
  console.log(`\n${bad ? '❌' : '✅'} ${results.length} ta tekshiruv: ${bad} ta xato, ${warn} ta ogohlantirish. Rejim: ${config.mock ? 'MOCK' : 'HAQIQIY Telegram'}`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ doctor o‘zi xato berdi:', e instanceof Error ? e.message : e);
  process.exit(2);
});
