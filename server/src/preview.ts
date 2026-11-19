import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  site?: string;
}

export class PreviewError extends Error {
  constructor(public readonly code: 'BLOCKED' | 'BAD_URL' | 'FETCH_FAILED' | 'NOT_HTML') {
    super(code);
  }
}

/** Expands an IPv6 literal (incl. `::` and trailing dotted IPv4) to 16 bytes. */
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const o = dotted[1]!.split('.').map(Number);
    s = s.slice(0, -dotted[1]!.length) + ((o[0]! << 8) | o[1]!).toString(16) + ':' + ((o[2]! << 8) | o[3]!).toString(16);
  }
  const [l, r, extra] = s.split('::');
  if (extra !== undefined) return null;
  const left = l ? l.split(':') : [];
  const right = r ? r.split(':') : [];
  const fill = r === undefined ? 0 : 8 - left.length - right.length;
  if (r === undefined ? left.length !== 8 : fill < 0) return null;
  const groups = [...left, ...Array<string>(fill).fill('0'), ...right];
  const out: number[] = [];
  for (const g of groups) {
    const n = parseInt(g, 16);
    if (!/^[0-9a-f]{1,4}$/.test(g) || Number.isNaN(n)) return null;
    out.push(n >> 8, n & 255);
  }
  return out;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const bytes = v6Bytes(ip);
    if (!bytes) return true;
    const head = (n: number) => bytes.slice(0, n).every((x) => x === 0);
    const embedded = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::/96) wrap an IPv4 address.
    if (head(10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPrivateIp(embedded);
    if (head(12)) return bytes.slice(12).every((x) => x === 0) || bytes.slice(12, 15).every((x) => x === 0) || isPrivateIp(embedded);
    if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every((x) => x === 0)) return isPrivateIp(embedded);
    const b0 = bytes[0]!;
    const b1 = bytes[1]!;
    return b0 === 0xff || (b0 & 0xfe) === 0xfc || (b0 === 0xfe && (b1 & 0xc0) === 0x80) || (b0 === 0x20 && b1 === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8);
  }
  return true; // not an IP at all -> refuse
}

/** DNS lookup that refuses non-public addresses. The address checked is the address connected to (no rebinding gap). */
export const safeLookup: typeof dns.lookup = ((hostname: string, options: unknown, cb: unknown) => {
  const done = (typeof options === 'function' ? options : cb) as (err: Error | null, address?: unknown, family?: number) => void;
  const wantAll = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return done(err);
    const bad = addrs.find((a) => isPrivateIp(a.address));
    if (bad || addrs.length === 0) return done(Object.assign(new Error('BLOCKED'), { code: 'EBLOCKED' }));
    if (wantAll) return done(null, addrs);
    done(null, addrs[0]!.address, addrs[0]!.family);
  });
}) as typeof dns.lookup;

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

function fetchOnce(url: URL): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': 'MeningTelegramimBot/1.0 (link preview)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en,uz;q=0.8' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: '' });
        }
        if (!/text\/html|application\/xhtml/i.test(type)) {
          res.destroy();
          return reject(new PreviewError('NOT_HTML'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          if (size >= MAX_BYTES) res.destroy(); // enough for <head>
        });
        const finish = () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') });
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', () => finish());
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject((e as { code?: string }).code === 'EBLOCKED' ? new PreviewError('BLOCKED') : new PreviewError('FETCH_FAILED')));
    req.end();
  });
}

export function parseUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new PreviewError('BAD_URL');
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) throw new PreviewError('BAD_URL');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new PreviewError('BLOCKED');
  // Node skips DNS (and so safeLookup) for IP literals, so they must be checked here. WHATWG parsing already
  // normalises decimal/hex/octal forms to dotted notation.
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateIp(host)) throw new PreviewError('BLOCKED');
  return u;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();

function meta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      if (name !== key) continue;
      const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
      const v = decode(content?.[1] ?? content?.[2] ?? '');
      if (v) return v;
    }
  }
  return undefined;
}

export function parseMeta(html: string, url: string): LinkPreview {
  const head = html.slice(0, MAX_BYTES);
  const title = meta(head, ['og:title', 'twitter:title']) ?? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '');
  const description = meta(head, ['og:description', 'twitter:description', 'description']);
  const site = meta(head, ['og:site_name']) ?? new URL(url).hostname.replace(/^www\./, '');
  return { url, title: title ? title.slice(0, 200) : undefined, description: description?.slice(0, 300), site: site.slice(0, 80) };
}

export type PreviewFetcher = (url: string) => Promise<LinkPreview>;

export const fetchPreview: PreviewFetcher = async (raw) => {
  let url = parseUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await fetchOnce(url);
    if (r.status >= 300 && r.status < 400 && r.location) {
      url = parseUrl(new URL(r.location, url).toString()); // every hop is re-validated
      continue;
    }
    if (r.status >= 400) throw new PreviewError('FETCH_FAILED');
    return parseMeta(r.body, url.toString());
  }
  throw new PreviewError('FETCH_FAILED');
};

/** Tiny TTL + size capped cache wrapper. */
export function cachedPreview(inner: PreviewFetcher, ttlMs = 3_600_000, max = 200): PreviewFetcher {
  const cache = new Map<string, { at: number; value: LinkPreview | null }>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttlMs) {
      if (!hit.value) throw new PreviewError('FETCH_FAILED');
      return hit.value;
    }
    try {
      const value = await inner(url);
      cache.set(url, { at: Date.now(), value });
      if (cache.size > max) cache.delete(cache.keys().next().value as string);
      return value;
    } catch (e) {
      if (e instanceof PreviewError && e.code !== 'BLOCKED') cache.set(url, { at: Date.now(), value: null }); // negative cache
      throw e;
    }
  };
}
