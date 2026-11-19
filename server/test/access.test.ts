import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { accessCookieValue, createApp, hasAccess } from '../src/app.js';
import { MockTelegramService } from '../src/services/MockTelegramService.js';

const ORIGIN = 'http://localhost:3000';
const make = (extra = {}) => createApp(new MockTelegramService({ realtimeMs: 0 }), ORIGIN, { accessToken: 'sirli-kod-123', secret: 'test-secret', ...extra });

describe('access token gate', () => {
  it('blocks every /api route without the cookie, but not /health', async () => {
    const app = make();
    expect((await request(app).get('/health')).status).toBe(200);
    for (const path of ['/api/auth/status', '/api/dialogs', '/api/me', '/api/search?q=ab', '/api/avatar/me', '/api/media/1/1']) {
      const r = await request(app).get(path);
      expect(r.status, path).toBe(401);
      expect(r.body.error.code).toBe('ACCESS_REQUIRED');
    }
    expect((await request(app).post('/api/auth/phone').send({ phone: '+998901234567' })).status).toBe(401);
    expect((await request(app).post('/api/dialogs/1/upload').attach('file', Buffer.from('x'), 'a.txt')).status).toBe(401);
  });

  it('rejects a wrong token, accepts the right one and then lets requests through', async () => {
    const app = make();
    const agent = request.agent(app);
    const bad = await agent.post('/api/access').send({ token: 'nope' });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('ACCESS_DENIED');
    expect(bad.headers['set-cookie']).toBeUndefined();

    const ok = await agent.post('/api/access').send({ token: 'sirli-kod-123' });
    expect(ok.status).toBe(200);
    const cookie = String(ok.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('sirli-kod-123'); // only an HMAC is stored
    expect((await agent.get('/api/auth/status')).status).toBe(200);
  });

  it('uses Secure + SameSite=None cookies when served over https', async () => {
    const r = await request(make({ secureCookie: true })).post('/api/access').send({ token: 'sirli-kod-123' });
    expect(String(r.headers['set-cookie'])).toMatch(/Secure/);
    expect(String(r.headers['set-cookie'])).toMatch(/SameSite=None/);
  });

  it('a forged or other-secret cookie does not pass', async () => {
    const app = make();
    expect((await request(app).get('/api/auth/status').set('Cookie', 'mt_access=deadbeef')).status).toBe(401);
    const other = accessCookieValue('sirli-kod-123', 'another-secret');
    expect((await request(app).get('/api/auth/status').set('Cookie', `mt_access=${other}`)).status).toBe(401);
  });

  it('hasAccess is open when no token is configured (local use)', () => {
    expect(hasAccess(undefined, undefined, 's')).toBe(true);
    expect(hasAccess(undefined, 'tok', 's')).toBe(false);
    expect(hasAccess(`a=1; mt_access=${accessCookieValue('tok', 's')}`, 'tok', 's')).toBe(true);
  });

  it('without a configured token the gate is off and /api/access cannot be used to log in', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), ORIGIN);
    expect((await request(app).get('/api/auth/status')).status).toBe(200);
    expect((await request(app).post('/api/access').send({ token: 'anything-long' })).status).toBe(403);
  });
});

describe('rate limiting', () => {
  it('throttles auth attempts', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), ORIGIN, { authLimit: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).post('/api/auth/phone').send({ phone: '+998901234567' })).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
});
