import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createApp, hasAccess } from './app.js';
import { PremiumStore } from './premium.js';
import { config } from './config.js';
import { acquireLock } from './lock.js';
import { GramJsAdapter } from './services/GramJsAdapter.js';
import { AccountManager } from './services/AccountManager.js';
import { MockTelegramService } from './services/MockTelegramService.js';
import { RealTelegramService } from './services/RealTelegramService.js';
import { SessionStore } from './services/sessionStore.js';
import type { TelegramService } from './services/TelegramService.js';

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...extra }));

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
let tg: TelegramService;
let restore: (() => Promise<void>) | null = null;

if (config.mock) {
  tg = new AccountManager((slot) => new MockTelegramService({ realtimeMs: config.mockRealtimeMs, slot }), null, log);
} else {
  const { apiId, apiHash } = config as { apiId: number; apiHash: string };
  try {
    await acquireLock(path.join(dataDir, 'server.lock'));
  } catch (e) {
    console.error(String((e as Error).message));
    process.exit(1);
  }
  // Slot 0 keeps the original file name, so an existing login keeps working.
  const real = new AccountManager(
    (slot) => new RealTelegramService((s) => new GramJsAdapter(apiId, apiHash, s), new SessionStore(path.join(dataDir, slot === 0 ? 'session.enc' : `session-${slot}.enc`), config.sessionSecret), log),
    path.join(dataDir, 'accounts.json'),
    log,
  );
  tg = real;
  // Restore saved sessions; on network failure keep retrying with backoff.
  restore = async () => {
    for (let wait = 3000; ; wait = Math.min(wait * 2, 60_000)) {
      try {
        await real.init();
        return;
      } catch (e) {
        log('session restore failed, retrying', { inMs: wait, code: (e as { code?: string }).code });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  };
}

const app = createApp(tg, config.webOrigin, { maxUploadBytes: config.maxUploadBytes, authLimit: config.authRateLimit, accessToken: config.accessToken, secret: config.sessionSecret, secureCookie: config.secureCookie, premium: new PremiumStore(config.premiumFile ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/premium.json'), config.sessionSecret, Date.now, config.premiumTrialMonths), premiumUploadBytes: config.premiumUploadBytes, premiumPrice: config.premiumPrice, premiumBuyUrl: config.premiumBuyUrl });
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.webOrigin, credentials: true } });

// Same gate for realtime events.
io.use((socket, next) => (hasAccess(socket.handshake.headers.cookie, config.accessToken, config.sessionSecret) ? next() : next(new Error('ACCESS_REQUIRED'))));

io.on('connection', (socket) => {
  log('socket connected', { id: socket.id });
  socket.on('disconnect', () => log('socket disconnected', { id: socket.id }));
});
tg.onEvent((e) => io.emit(e.type, e));

const keysSet = Boolean(process.env.TG_API_ID || process.env.TG_API_HASH);
if (keysSet && config.mock) log('TG_API_ID/TG_API_HASH noto‘g‘ri yoki to‘liq emas — MOCK rejimda ishlayapti. `npm run doctor` ni ishga tushiring', { level: 'warn' });
if (!config.accessToken && !/localhost|127\.0\.0\.1/.test(config.webOrigin)) {
  log('DIQQAT: WEB_ORIGIN lokal emas, lekin ACCESS_TOKEN o‘rnatilmagan — serverga yetgan har kim chatlaringizni ko‘ra oladi', { level: 'warn' });
}

server.listen(config.port, () => {
  log('server started', { port: config.port, mode: tg.mode });
  void restore?.();
});

const shutdown = () => {
  void tg.dispose().then(() => server.close(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
