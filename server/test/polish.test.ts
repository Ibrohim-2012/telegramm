import http from 'node:http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { cachedPreview, fetchPreview, isPrivateIp, parseMeta, parseUrl, PreviewError } from '../src/preview.js';
import { MockTelegramService } from '../src/services/MockTelegramService.js';
import { limiter } from '../src/util.js';

describe('isPrivateIp', () => {
  it('blocks private, loopback, link-local and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fe80::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.5', '::ffff:7f00:1', '::7f00:1', '64:ff9b::7f00:1', '2001:db8::1', 'ff02::1', 'not-an-ip']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:808:808', '64:ff9b::808:808']) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

describe('parseUrl / SSRF guards', () => {
  it('rejects non-http schemes, credentials and odd ports', () => {
    expect(() => parseUrl('file:///etc/passwd')).toThrow(PreviewError);
    expect(() => parseUrl('ftp://a.com')).toThrow(PreviewError);
    expect(() => parseUrl('http://user:pw@a.com')).toThrow(PreviewError);
    expect(() => parseUrl('http://a.com:22')).toThrow(PreviewError);
    expect(() => parseUrl('nope')).toThrow(PreviewError);
    expect(parseUrl('https://a.com/x').hostname).toBe('a.com');
  });

  it('refuses to fetch loopback/private hosts, even a live local server', async () => {
    const srv = http.createServer((_q, r) => r.end('<title>secret</title>'));
    await new Promise<void>((ok) => srv.listen(8080, '127.0.0.1', ok));
    try {
      await expect(fetchPreview('http://127.0.0.1:8080/')).rejects.toMatchObject({ code: 'BLOCKED' });
      await expect(fetchPreview('http://localhost:8080/')).rejects.toMatchObject({ code: 'BLOCKED' });
      await expect(fetchPreview('http://[::1]:8080/')).rejects.toMatchObject({ code: 'BLOCKED' });
      await expect(fetchPreview('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({ code: 'BLOCKED' });
      await expect(fetchPreview('http://2130706433:8080/')).rejects.toMatchObject({ code: 'BLOCKED' }); // decimal 127.0.0.1
      await expect(fetchPreview('http://[::ffff:127.0.0.1]:8080/')).rejects.toMatchObject({ code: 'BLOCKED' });
      await expect(fetchPreview('http://0.0.0.0:8080/')).rejects.toMatchObject({ code: 'BLOCKED' });
    } finally {
      await new Promise((ok) => srv.close(ok));
    }
  });
});

describe('parseMeta', () => {
  it('prefers og tags, decodes entities, falls back to <title>', () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Salom &amp; xush &#x43;elibsiz">
      <meta name="description" content="Tavsif   matni">
      <meta content="Sayt" property="og:site_name"></head></html>`;
    expect(parseMeta(html, 'https://www.example.com/a')).toEqual({ url: 'https://www.example.com/a', title: 'Salom & xush Celibsiz', description: 'Tavsif matni', site: 'Sayt' });
    expect(parseMeta('<title> Faqat sarlavha </title>', 'https://www.example.com/')).toMatchObject({ title: 'Faqat sarlavha', site: 'example.com' });
  });
  it('never returns markup', () => {
    const p = parseMeta('<meta property="og:title" content="&lt;img src=x onerror=1&gt;">', 'https://a.com');
    expect(p.title).toBe('<img src=x onerror=1>'); // plain text; React escapes it when rendering
  });
});

describe('cachedPreview', () => {
  it('caches successes and failures', async () => {
    let n = 0;
    const c = cachedPreview(async (u) => {
      n++;
      if (u.includes('bad')) throw new PreviewError('FETCH_FAILED');
      return { url: u, title: 't' };
    });
    await c('https://a.com');
    await c('https://a.com');
    expect(n).toBe(1);
    await expect(c('https://bad.com')).rejects.toBeInstanceOf(PreviewError);
    await expect(c('https://bad.com')).rejects.toBeInstanceOf(PreviewError);
    expect(n).toBe(2);
  });
});

describe('limiter', () => {
  it('never exceeds the concurrency limit', async () => {
    const run = limiter(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        run(async () => {
          peak = Math.max(peak, ++active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe('avatar + preview endpoints', () => {
  const make = async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000', {
      preview: async (url) => {
        if (url.includes('nope')) throw new PreviewError('FETCH_FAILED');
        if (url.includes('private')) throw new PreviewError('BLOCKED');
        return { url, title: 'Sarlavha', site: 'example.com' };
      },
    });
    await request(app).post('/api/auth/phone').send({ phone: '+998901234567' });
    await request(app).post('/api/auth/code').send({ code: '12345' });
    return app;
  };

  it('serves avatars only for peers that have one, and for me', async () => {
    const app = await make();
    const list = await request(app).get('/api/dialogs?limit=100');
    const withPhoto = list.body.items.find((d: { photo?: boolean }) => d.photo);
    const without = list.body.items.find((d: { photo?: boolean }) => !d.photo);
    const ok = await request(app).get(`/api/avatar/${withPhoto.id}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('svg');
    expect(ok.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect((await request(app).get(`/api/avatar/${without.id}`)).status).toBe(204);
    expect((await request(app).get('/api/avatar/me')).status).toBe(200);
    expect((await request(app).get('/api/avatar/zz')).status).toBe(400);
  });

  it('avatars require login', async () => {
    const app = createApp(new MockTelegramService({ realtimeMs: 0 }), 'http://localhost:3000');
    expect((await request(app).get('/api/avatar/me')).status).toBe(401);
  });

  it('preview endpoint maps results and errors', async () => {
    const app = await make();
    const ok = await request(app).get('/api/preview').query({ url: 'https://example.com/x' });
    expect(ok.body).toMatchObject({ title: 'Sarlavha', site: 'example.com' });
    expect((await request(app).get('/api/preview').query({ url: 'https://nope.com' })).status).toBe(204);
    expect((await request(app).get('/api/preview').query({ url: 'http://private.local' })).status).toBe(204); // blocked looks the same as unavailable
    expect((await request(app).get('/api/preview').query({ url: 'not a url' })).status).toBe(400);
    expect((await request(app).get('/api/preview')).status).toBe(400);
  });
});
