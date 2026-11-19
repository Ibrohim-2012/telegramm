import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, parseRange } from '../src/app.js';
import { MockTelegramService } from '../src/services/MockTelegramService.js';

const ORIGIN = 'http://localhost:3000';
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp(new MockTelegramService({ realtimeMs: 0 }), ORIGIN);
});

describe('REST API', () => {
  it('GET /health', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, mode: 'mock', auth: 'logged_out' });
  });

  it('sets security headers and locks CORS to the web origin', async () => {
    const r = await request(app).get('/health').set('Origin', ORIGIN);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN);
    const evil = await request(app).get('/health').set('Origin', 'http://evil.example');
    // Header only ever names our own origin, so browsers block any other site.
    expect(evil.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('validates phone input', async () => {
    const r = await request(app).post('/api/auth/phone').send({ phone: 'abc' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BAD_INPUT');
  });

  it('full login flow incl. 2FA, me, dialogs, logout', async () => {
    expect((await request(app).get('/api/dialogs')).status).toBe(401);
    expect((await request(app).post('/api/auth/phone').send({ phone: '+998901234560' })).body.state).toBe('code_sent');
    const bad = await request(app).post('/api/auth/code').send({ code: '99999' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('PHONE_CODE_INVALID');
    expect((await request(app).post('/api/auth/code').send({ code: '12345' })).body.state).toBe('password_needed');
    const badPw = await request(app).post('/api/auth/password').send({ password: 'x' });
    expect(badPw.body.error.code).toBe('PASSWORD_HASH_INVALID');
    expect((await request(app).post('/api/auth/password').send({ password: 'mock2fa' })).body.state).toBe('ready');

    const me = await request(app).get('/api/me');
    expect(me.body.phone).toBe('+998901234560');
    const d = await request(app).get('/api/dialogs?limit=5&offset=0');
    expect(d.body.items).toHaveLength(5);
    expect((await request(app).get('/api/dialogs?limit=0')).status).toBe(400);

    expect((await request(app).post('/api/auth/logout')).body.state).toBe('logged_out');
    expect((await request(app).get('/api/auth/status')).body.state).toBe('logged_out');
  });

  it('rejects code before requesting one', async () => {
    const r = await request(app).post('/api/auth/code').send({ code: '12345' });
    expect(r.body.error.code).toBe('NO_CODE_REQUESTED');
  });

  it('history / search / profile endpoints', async () => {
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: '12345' });
    const h = await request(app).get('/api/dialogs/1000/history?limit=10');
    expect(h.status).toBe(200);
    expect(h.body.items).toHaveLength(10);
    const older = await request(app).get(`/api/dialogs/1000/history?limit=10&beforeId=${h.body.items[0].id}`);
    expect(older.body.items.at(-1).id).toBe(h.body.items[0].id - 1);
    expect((await request(app).get('/api/dialogs/abc/history')).status).toBe(400);
    expect((await request(app).get('/api/dialogs/424242/history')).status).toBe(404);
    expect((await request(app).get('/api/search')).status).toBe(400);
    const s = await request(app).get('/api/search?q=%40barno');
    expect(s.body.items[0].username).toBe('barno.design');
    expect((await request(app).get('/api/profile/1000')).body.id).toBe('1000');
    expect((await request(app).get('/api/profile/424242')).status).toBe(404);
  });

  it('history requires login', async () => {
    expect((await request(app).get('/api/dialogs/1000/history')).status).toBe(401);
    expect((await request(app).get('/api/search?q=ab')).status).toBe(401);
  });

  describe('messaging endpoints', () => {
    const login = async () => {
      await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
      await request(app).post('/api/auth/code').send({ code: '12345' });
    };

    it('send / edit / forward / delete / read / typing', async () => {
      await login();
      const sent = await request(app).post('/api/dialogs/1000/messages').send({ text: 'hello' });
      expect(sent.status).toBe(201);
      const id = sent.body.id as number;
      const re = await request(app).post('/api/dialogs/1000/messages').send({ text: 'reply', replyTo: id });
      expect(re.body.replyToId).toBe(id);
      const ed = await request(app).patch(`/api/dialogs/1000/messages/${id}`).send({ text: 'hello 2' });
      expect(ed.body).toMatchObject({ text: 'hello 2', edited: true });
      const fw = await request(app).post('/api/dialogs/1000/forward').send({ ids: [id], toId: '1004' });
      expect(fw.body.items[0].dialogId).toBe('1004');
      expect((await request(app).post('/api/dialogs/1003/read').send({ maxId: 5 })).body.ok).toBe(true);
      expect((await request(app).post('/api/dialogs/1000/typing')).body.ok).toBe(true);
      const del = await request(app).post('/api/dialogs/1000/messages/delete').send({ ids: [id], revoke: true });
      expect(del.body.ok).toBe(true);
    });

    it('validates input and maps errors', async () => {
      await login();
      expect((await request(app).post('/api/dialogs/1000/messages').send({ text: '' })).status).toBe(400);
      expect((await request(app).post('/api/dialogs/1000/messages').send({ text: 'x'.repeat(5000) })).status).toBe(400);
      expect((await request(app).post('/api/dialogs/1021/messages').send({ text: 'x' })).status).toBe(403);
      expect((await request(app).post('/api/dialogs/1000/messages').send({ text: 'x', replyTo: 999999 })).status).toBe(404);
      expect((await request(app).post('/api/dialogs/1000/messages/delete').send({ ids: [], revoke: true })).status).toBe(400);
      expect((await request(app).post('/api/dialogs/zz/messages').send({ text: 'x' })).status).toBe(400);
    });

    it('requires login for every write', async () => {
      expect((await request(app).post('/api/dialogs/1000/messages').send({ text: 'x' })).status).toBe(401);
      expect((await request(app).patch('/api/dialogs/1000/messages/1').send({ text: 'x' })).status).toBe(401);
      expect((await request(app).post('/api/dialogs/1000/read').send({ maxId: 1 })).status).toBe(401);
    });
  });

  describe('media endpoints', () => {
    const login = async () => {
      await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
      await request(app).post('/api/auth/code').send({ code: '12345' });
    };
    const find = async (kind: string) => {
      const h = await request(app).get('/api/dialogs/1003/history?limit=100');
      return h.body.items.find((m: { media?: { kind: string } }) => m.media?.kind === kind) as { id: number; media: { kind: string } };
    };

    it('serves a photo with safe cross-origin headers', async () => {
      await login();
      const m = await find('photo');
      const r = await request(app).get(`/api/media/1003/${m.id}`);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('image/svg+xml');
      expect(r.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['content-security-policy']).toContain("default-src 'none'");
      expect(r.headers['content-disposition']).toContain('inline');
    });

    it('forces download for non-whitelisted types and with ?dl=1', async () => {
      await login();
      const up = await request(app).post('/api/dialogs/1000/upload').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'text/html' });
      expect(up.status).toBe(201);
      const r = await request(app).get(`/api/media/1000/${up.body.id}`);
      expect(r.headers['content-type']).toBe('application/octet-stream');
      expect(r.headers['content-disposition']).toContain('attachment');
      const m = await find('file');
      expect((await request(app).get(`/api/media/1003/${m.id}?dl=1`)).headers['content-disposition']).toContain('attachment');
    });

    it('supports byte ranges for audio', async () => {
      await login();
      const m = await find('voice');
      const full = await request(app).get(`/api/media/1003/${m.id}`);
      const size = full.body.length as number;
      expect(full.headers['accept-ranges']).toBe('bytes');
      const part = await request(app).get(`/api/media/1003/${m.id}`).set('Range', 'bytes=0-99');
      expect(part.status).toBe(206);
      expect(part.headers['content-range']).toBe(`bytes 0-99/${size}`);
      expect(part.body.length).toBe(100);
      const tail = await request(app).get(`/api/media/1003/${m.id}`).set('Range', 'bytes=-10');
      expect(tail.body.length).toBe(10);
      expect((await request(app).get(`/api/media/1003/${m.id}`).set('Range', `bytes=${size + 5}-`)).status).toBe(416);
    });

    it('uploads a photo with caption and reply, sanitizing the name', async () => {
      await login();
      const base = await request(app).post('/api/dialogs/1000/messages').send({ text: 'asl' });
      const r = await request(app)
        .post('/api/dialogs/1000/upload')
        .field('caption', 'izoh')
        .field('replyTo', String(base.body.id))
        .attach('file', Buffer.from('imgdata'), { filename: '../../etc/rasm.png', contentType: 'image/png' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ text: 'izoh', replyToId: base.body.id, media: { kind: 'photo', name: 'rasm.png' } });
      const back = await request(app).get(`/api/media/1000/${r.body.id}`);
      expect(back.body.toString()).toBe('imgdata');
    });

    it('validates uploads: missing file, too big, channel, auth', async () => {
      expect((await request(app).post('/api/dialogs/1000/upload').attach('file', Buffer.from('x'), 'a.txt')).status).toBe(401);
      await login();
      expect((await request(app).post('/api/dialogs/1000/upload').field('caption', 'x')).status).toBe(400);
      expect((await request(app).post('/api/dialogs/1021/upload').attach('file', Buffer.from('x'), 'a.txt')).status).toBe(403);
      expect((await request(app).get('/api/media/1000/99999')).status).toBe(404);
      expect((await request(app).get('/api/media/zz/1')).status).toBe(400);
      const small = createApp(new MockTelegramService({ realtimeMs: 0 }), ORIGIN, { maxUploadBytes: 10 });
      await request(small).post('/api/auth/phone').send({ phone: '+998901234567' });
      await request(small).post('/api/auth/code').send({ code: '12345' });
      const big = await request(small).post('/api/dialogs/1000/upload').attach('file', Buffer.alloc(100), 'big.bin');
      expect(big.status).toBe(413);
      expect(big.body.error.code).toBe('FILE_TOO_BIG');
    });
  });
});

describe('parseRange', () => {
  it('handles forms', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-5', 100)).toEqual({ start: 95, end: 99 });
    expect(parseRange('bytes=0-999', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=5-2', 100)).toBe('invalid');
    expect(parseRange('items=1-2', 100)).toBe('invalid');
  });
});
