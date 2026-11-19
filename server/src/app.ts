import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { TelegramService } from './services/TelegramService.js';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import { cachedPreview, fetchPreview, PreviewError, type PreviewFetcher } from './preview.js';
import { ACCENTS, PremiumError, PremiumStore } from './premium.js';
import { AccountManager, MAX_ACCOUNTS } from './services/AccountManager.js';
import { TgError } from './types.js';

export const ACCESS_COOKIE = 'mt_access';

/** Cookie value proving the visitor knew ACCESS_TOKEN (an HMAC, so the token itself never sits in a cookie). */
export const accessCookieValue = (token: string, secret: string) => crypto.createHmac('sha256', secret).update(`access:${token}`).digest('hex');

const safeEqual = (a: string, b: string) => {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
};

export function hasAccess(cookieHeader: string | undefined, token: string | undefined, secret: string): boolean {
  if (!token) return true; // gate disabled (local use)
  const m = new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([0-9a-f]+)`).exec(cookieHeader ?? '');
  return !!m && safeEqual(m[1]!, accessCookieValue(token, secret));
}

const INLINE_OK = /^(image\/(jpeg|png|gif|webp|svg\+xml)|video\/(mp4|webm|quicktime)|audio\/(mpeg|ogg|wav|webm|mp4|aac|x-wav|opus)|text\/plain)$/;

/** Parses a single `bytes=a-b` range. Returns null when absent, 'invalid' when unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end };
}

// Control characters are stripped on purpose, hence the regex below.
/* eslint-disable no-control-regex */
const safeName = (raw: string) =>
  // multer decodes multipart names as latin1; restore UTF-8, drop paths and control chars.
  Buffer.from(raw, 'latin1').toString('utf8').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f"]/g, '').slice(0, 120) || 'fayl';
/* eslint-enable no-control-regex */

export function createApp(tg: TelegramService, webOrigin: string, opts: {
    maxUploadBytes?: number;
    preview?: PreviewFetcher;
    authLimit?: number;
    accessToken?: string;
    secret?: string;
    secureCookie?: boolean;
    premium?: PremiumStore;
    premiumUploadBytes?: number;
    premiumPrice?: string;
    premiumBuyUrl?: string;
  } = {},
) {
  const maxUpload = opts.maxUploadBytes ?? 50 * 1024 * 1024;
  const preview = opts.preview ?? cachedPreview(fetchPreview);
  const premiumUpload = Math.max(maxUpload, opts.premiumUploadBytes ?? 200 * 1024 * 1024);
  const premium = opts.premium ?? new PremiumStore(path.join(os.tmpdir(), `mt-premium-${process.pid}-${Math.random().toString(36).slice(2)}.json`), opts.secret ?? 'dev-only-secret');
  const app = express();
  // The web app lives on another origin and loads avatars/media with <img>/<audio>; CORS still limits fetch() to WEB_ORIGIN.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: webOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  const wrap =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      fn(req, res).catch(next);
    };

  app.get('/health', (_req, res) => {
    res.json({ ok: true, mode: tg.mode, auth: tg.getAuthState(), uptime: Math.round(process.uptime()) });
  });

  // Optional shared-secret gate for deployments: without it anyone who can reach the server would see your chats.
  const secret = opts.secret ?? 'dev-only-secret';
  const accessLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Juda ko‘p urinish' } } });
  app.post('/api/access', accessLimiter, wrap(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1).max(256) }).parse(req.body);
    if (!opts.accessToken || !safeEqual(token, opts.accessToken)) {
      res.status(403).json({ error: { code: 'ACCESS_DENIED', message: 'Kod noto‘g‘ri' } });
      return;
    }
    res.cookie(ACCESS_COOKIE, accessCookieValue(opts.accessToken, secret), {
      httpOnly: true,
      secure: opts.secureCookie ?? false,
      sameSite: opts.secureCookie ? 'none' : 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.json({ ok: true });
  }));
  app.use('/api', (req, res, next) => {
    if (hasAccess(req.headers.cookie, opts.accessToken, secret)) return next();
    res.status(401).json({ error: { code: 'ACCESS_REQUIRED', message: 'Kirish kodi kerak' } });
  });

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: opts.authLimit ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Juda ko‘p urinish. Keyinroq qayta urinib ko‘ring' } },
  });

  const auth = express.Router();
  auth.use(authLimiter);

  auth.get('/status', (_req, res) => {
    res.json({ state: tg.getAuthState(), mode: tg.mode });
  });

  auth.post('/phone', wrap(async (req, res) => {
    const { phone } = z.object({ phone: z.string().regex(/^\+\d{7,15}$/) }).parse(req.body);
    await tg.sendCode(phone);
    res.json({ state: tg.getAuthState() });
  }));

  auth.post('/code', wrap(async (req, res) => {
    const { code } = z.object({ code: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
    res.json({ state: await tg.signIn(code) });
  }));

  auth.post('/password', wrap(async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(256) }).parse(req.body);
    res.json({ state: await tg.checkPassword(password) });
  }));

  auth.post('/logout', wrap(async (_req, res) => {
    await tg.logout();
    res.json({ state: tg.getAuthState() });
  }));

  app.use('/api/auth', auth);

  // Several accounts (like Telegram's own apps). Not behind the "logged in" check: adding an account happens on the login screen.
  if (tg instanceof AccountManager) {
    const accounts = tg;
    const acc = express.Router();
    const view = async () => ({ items: await accounts.list(), max: MAX_ACCOUNTS, state: accounts.getAuthState() });
    acc.get('/', wrap(async (_req, res) => res.json(await view())));
    acc.post('/', wrap(async (_req, res) => {
      accounts.addAccount();
      res.status(201).json(await view());
    }));
    acc.post('/cancel', wrap(async (_req, res) => {
      await accounts.cancelAdd();
      res.json(await view());
    }));
    acc.post('/:slot/switch', wrap(async (req, res) => {
      accounts.switchTo(z.coerce.number().int().min(0).max(9).parse(req.params.slot));
      res.json(await view());
    }));
    app.use('/api/accounts', acc);
  }

  const api = express.Router();
  // Generous but finite: protects the account from runaway clients (Telegram would throttle us anyway).
  api.use('/dialogs/:id/messages', rateLimit({ windowMs: 10_000, limit: 25, standardHeaders: true, legacyHeaders: false, skip: (r) => r.method !== 'POST' && r.method !== 'PATCH', message: { error: { code: 'RATE_LIMITED', message: 'Juda tez yuboryapsiz' } } }));
  api.get('/me', wrap(async (_req, res) => {
    res.json(await tg.getMe());
  }));
  api.get('/dialogs', wrap(async (req, res) => {
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) })
      .parse(req.query);
    res.json(await tg.getDialogs(q));
  }));
  const peerId = z.string().regex(/^-?\d{1,20}$/);
  api.get('/dialogs/:id/history', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(40), beforeId: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    res.json(await tg.getHistory(id, q));
  }));
  api.get('/folders', wrap(async (_req, res) => {
    res.json({ items: await tg.getFolders() });
  }));
  api.get('/search', wrap(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(64) }).parse(req.query);
    res.json({ items: await tg.searchGlobal(q) });
  }));
  api.get('/profile/:id', wrap(async (req, res) => {
    res.json(await tg.getProfile(peerId.parse(req.params.id)));
  }));
  const uploader = (bytes: number) => multer({ storage: multer.memoryStorage(), limits: { fileSize: bytes, files: 1, fields: 9 } });
  const freeUpload = uploader(maxUpload);
  const bigUpload = uploader(premiumUpload);
  // Premium (of this app) raises the upload limit; the limit is chosen before the body is read.
  const upload = { single: (field: string): RequestHandler => (req, res, next) => (premium.isActive() ? bigUpload : freeUpload).single(field)(req, res, next) };
  const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Juda tez yuboryapsiz' } } });
  api.post('/dialogs/:id/upload', uploadLimiter, upload.single('file'), wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    if (!req.file) throw new TgError('BAD_INPUT', 'Fayl tanlanmagan');
    const f = z
      .object({ caption: z.string().max(1024).optional(), replyTo: z.coerce.number().int().positive().optional(), asFile: z.enum(['0', '1']).default('0'), voice: z.enum(['0', '1']).default('0'), round: z.enum(['0', '1']).default('0'), duration: z.coerce.number().int().min(0).max(3600).optional() })
      .parse(req.body);
    const msg = await tg.sendMedia(
      id,
      { name: safeName(req.file.originalname), mime: req.file.mimetype || 'application/octet-stream', data: req.file.buffer },
      { caption: f.caption?.trim() || undefined, replyTo: f.replyTo, asFile: f.asFile === '1', voice: f.voice === '1' && (req.file.mimetype || '').startsWith('audio/'), round: f.round === '1' && (req.file.mimetype || '').startsWith('video/'), duration: f.duration },
    );
    res.status(201).json(msg);
  }));

  // ---- Premium of this app (trial -> codes). Independent of Telegram's own Premium.
  const premiumView = () => ({
    ...premium.status(),
    price: opts.premiumPrice ?? '29 000 so‘m / oy',
    buyUrl: opts.premiumBuyUrl,
    uploadMb: { free: Math.round(maxUpload / 1048576), premium: Math.round(premiumUpload / 1048576) },
    accents: ACCENTS,
  });
  const redeemLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Juda ko‘p urinish' } } });
  api.get('/premium', wrap(async (_req, res) => res.json(premiumView())));
  api.post('/premium/trial', wrap(async (_req, res) => {
    premium.startTrial();
    res.status(201).json(premiumView());
  }));
  api.post('/premium/redeem', redeemLimiter, wrap(async (req, res) => {
    const { code } = z.object({ code: z.string().min(8).max(64) }).parse(req.body);
    premium.redeem(code);
    res.json(premiumView());
  }));
  api.post('/premium/settings', wrap(async (req, res) => {
    const body = z.object({ emojiStatus: z.string().max(16).nullable().optional(), accent: z.enum(ACCENTS).nullable().optional() }).parse(req.body);
    premium.updateSettings(body);
    res.json(premiumView());
  }));

  api.post('/groups', wrap(async (req, res) => {
    const { title, userIds } = z.object({ title: z.string().trim().min(1).max(128), userIds: z.array(peerId).min(1).max(200) }).parse(req.body);
    res.status(201).json(await tg.createGroup(title, userIds));
  }));
  api.post('/channels', wrap(async (req, res) => {
    const { title, about } = z.object({ title: z.string().trim().min(1).max(128), about: z.string().trim().max(255).optional() }).parse(req.body);
    res.status(201).json(await tg.createChannel(title, about));
  }));
  api.get('/calls', wrap(async (_req, res) => res.json({ items: await tg.getCalls() })));

  api.get('/media/:id/:mid', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const mid = z.coerce.number().int().positive().parse(req.params.mid);
    const q = z.object({ thumb: z.enum(['0', '1']).optional(), dl: z.enum(['0', '1']).optional() }).parse(req.query);
    const blob = await tg.openMedia(id, mid, q.thumb === '1');
    const inline = q.dl !== '1' && INLINE_OK.test(blob.mime);
    const size = blob.data.length;
    res.set({
      'Content-Type': inline ? blob.mime : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(blob.name)}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      // The web app lives on another origin; helmet's default (same-origin) would block <img>/<video>.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // Direct navigation to an SVG must never run script.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    const range = parseRange(req.headers.range, size);
    if (range === 'invalid') {
      res.status(416).set('Content-Range', `bytes */${size}`).end();
    } else if (range) {
      res.status(206).set({ 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) });
      res.end(blob.data.subarray(range.start, range.end + 1));
    } else {
      res.set('Content-Length', String(size));
      res.end(blob.data);
    }
  }));

  api.get('/avatar/:id', wrap(async (req, res) => {
    const id = z.union([z.literal('me'), peerId]).parse(req.params.id);
    const blob = await tg.getAvatar(id);
    if (!blob) {
      // 204: "no picture" is normal (most group senders have none) and must not show up as a failed request in the browser
      res.status(204).set('Cache-Control', 'private, max-age=300').end();
      return;
    }
    res.set({
      'Content-Type': blob.mime,
      'Cache-Control': 'private, max-age=86400',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Content-Length': String(blob.data.length),
    });
    res.end(blob.data);
  }));

  const previewLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Juda ko‘p so‘rov' } } });
  api.get('/preview', previewLimiter, wrap(async (req, res) => {
    const { url } = z.object({ url: z.string().url().max(2048) }).parse(req.query);
    try {
      const p = await preview(url);
      res.set('Cache-Control', 'private, max-age=3600').json(p);
    } catch (e) {
      if (e instanceof PreviewError) {
        // Unreachable / non-HTML / blocked targets are normal: answer 204 so browsers don't log an error for every such link.
        if (e.code === 'BAD_URL') res.status(400).json({ error: { code: 'PREVIEW_BAD_URL', message: 'Noto‘g‘ri havola' } });
        else res.status(204).end();
        return;
      }
      throw e;
    }
  }));

  const msgBody = z.object({ text: z.string().min(1).max(4096), replyTo: z.number().int().positive().optional() });
  api.post('/dialogs/:id/messages', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const { text, replyTo } = msgBody.parse(req.body);
    res.status(201).json(await tg.sendMessage(id, text, replyTo));
  }));
  api.patch('/dialogs/:id/messages/:mid', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const mid = z.coerce.number().int().positive().parse(req.params.mid);
    const { text } = z.object({ text: z.string().min(1).max(4096) }).parse(req.body);
    res.json(await tg.editMessage(id, mid, text));
  }));
  api.post('/dialogs/:id/messages/delete', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const { ids, revoke } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), revoke: z.boolean() }).parse(req.body);
    await tg.deleteMessages(id, ids, revoke);
    res.json({ ok: true });
  }));
  api.post('/dialogs/:id/forward', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const { ids, toId } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), toId: peerId }).parse(req.body);
    res.json({ items: await tg.forwardMessages(id, ids, toId) });
  }));
  api.post('/dialogs/:id/messages/:mid/reaction', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const mid = z.coerce.number().int().positive().parse(req.params.mid);
    const { emoji } = z.object({ emoji: z.string().min(1).max(16).nullable() }).parse(req.body);
    res.json(await tg.react(id, mid, emoji));
  }));
  api.post('/dialogs/:id/pin', wrap(async (req, res) => {
    const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);
    await tg.setPinned(peerId.parse(req.params.id), pinned);
    res.json({ ok: true });
  }));
  api.post('/dialogs/:id/archive', wrap(async (req, res) => {
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    await tg.setArchived(peerId.parse(req.params.id), archived);
    res.json({ ok: true });
  }));
  api.post('/dialogs/:id/mute', wrap(async (req, res) => {
    const { muted } = z.object({ muted: z.boolean() }).parse(req.body);
    await tg.setMuted(peerId.parse(req.params.id), muted);
    res.json({ ok: true });
  }));
  api.get('/dialogs/:id/shared', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const q = z
      .object({ kind: z.enum(['media', 'files', 'links']), limit: z.coerce.number().int().min(1).max(60).default(30), beforeId: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    res.json(await tg.getShared(id, q.kind, { limit: q.limit, beforeId: q.beforeId }));
  }));
  api.get('/dialogs/:id/search', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const q = z
      .object({ q: z.string().trim().min(1).max(100), limit: z.coerce.number().int().min(1).max(50).default(20), beforeId: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    res.json(await tg.searchMessages(id, q.q, { limit: q.limit, beforeId: q.beforeId }));
  }));
  api.post('/dialogs/:id/read', wrap(async (req, res) => {
    const id = peerId.parse(req.params.id);
    const { maxId } = z.object({ maxId: z.number().int().nonnegative() }).parse(req.body);
    await tg.markRead(id, maxId);
    res.json({ ok: true });
  }));
  api.post('/dialogs/:id/typing', wrap(async (req, res) => {
    await tg.setTyping(peerId.parse(req.params.id));
    res.json({ ok: true });
  }));
  app.use('/api', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const big = err.code === 'LIMIT_FILE_SIZE';
      const hint = big && !premium.isActive() && premiumUpload > maxUpload ? Math.round(premiumUpload / 1024 / 1024) : undefined;
      res.status(big ? 413 : 400).json({ error: { code: big ? 'FILE_TOO_BIG' : 'BAD_INPUT', message: big ? 'Fayl juda katta' : 'Noto‘g‘ri fayl', premiumLimitMb: hint } });
    } else if (err instanceof PremiumError) {
      const code = err.code;
      res.status(code === 'PREMIUM_REQUIRED' ? 402 : code === 'TRIAL_USED' || code === 'CODE_USED' ? 409 : 400).json({ error: { code, message: err.message } });
    } else if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Noto‘g‘ri ma’lumot' } });
    } else if (err instanceof TgError) {
      const status = err.code === 'AUTH_KEY_UNREGISTERED' ? 401 : err.code === 'FLOOD_WAIT' ? 429 : err.code === 'NETWORK' ? 503 : err.code === 'PEER_ID_INVALID' || err.code === 'MESSAGE_ID_INVALID' || err.code === 'MEDIA_NOT_FOUND' ? 404 : err.code === 'FILE_TOO_BIG' ? 413 : err.code === 'CHAT_WRITE_FORBIDDEN' || err.code === 'MESSAGE_AUTHOR_REQUIRED' ? 403 : 400;
      res.status(status).json({ error: { code: err.code, message: err.message, retryAfter: err.retryAfter } });
    } else {
      console.error(JSON.stringify({ level: 'error', msg: err instanceof Error ? err.message : 'unknown' }));
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Ichki xatolik' } });
    }
  });

  return app;
}
