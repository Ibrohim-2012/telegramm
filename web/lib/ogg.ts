/**
 * Browsers record voice as WebM/Opus, Telegram voice notes are Ogg/Opus. The audio (Opus packets) is identical, only the
 * container differs, so we re-wrap the packets: no re-encoding, no quality loss.
 */

const ID = { segment: 0x18538067, cluster: 0x1f43b675, tracks: 0x1654ae6b, trackEntry: 0xae, blockGroup: 0xa0, block: 0xa1, simpleBlock: 0xa3, codecPrivate: 0x63a2 } as const;
const MASTER = new Set<number>([ID.segment, ID.cluster, ID.tracks, ID.trackEntry, ID.blockGroup]);

function readId(b: Uint8Array, p: number): [number, number] | null {
  const first = b[p];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23; // 1..4
  if (len > 4 || p + len > b.length) return null;
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[p + i]!;
  return [v, len];
}

function readSize(b: Uint8Array, p: number): [number, number] | null {
  const first = b[p];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23; // 1..8
  if (p + len > b.length) return null;
  let v = first & (0xff >> len);
  let allOnes = v === 0xff >> len;
  for (let i = 1; i < len; i++) {
    const x = b[p + i]!;
    v = v * 256 + x;
    if (x !== 0xff) allOnes = false;
  }
  return [allOnes ? -1 : v, len]; // -1 = unknown size (live recordings)
}

interface Parsed {
  head?: Uint8Array;
  packets: Uint8Array[];
}

function walk(b: Uint8Array, start: number, end: number, out: Parsed): boolean {
  let p = start;
  while (p < end) {
    const id = readId(b, p);
    if (!id) return false;
    const sz = readSize(b, p + id[1]);
    if (!sz) return false;
    const dataStart = p + id[1] + sz[1];
    const dataEnd = sz[0] < 0 ? end : Math.min(end, dataStart + sz[0]);
    if (MASTER.has(id[0])) {
      if (!walk(b, dataStart, dataEnd, out)) return false;
    } else if (id[0] === ID.codecPrivate) {
      const d = b.subarray(dataStart, dataEnd);
      if (d.length >= 19 && String.fromCharCode(...d.subarray(0, 8)) === 'OpusHead') out.head = d.slice();
    } else if (id[0] === ID.simpleBlock || id[0] === ID.block) {
      const t = readSize(b, dataStart); // track number (a vint)
      if (!t) return false;
      const frame = dataStart + t[1] + 3; // + 2 bytes timecode + 1 byte flags
      const lacing = (b[dataStart + t[1] + 2] ?? 0) & 0x06;
      if (lacing !== 0) return false; // lacing is not used for single-track Opus recordings
      if (frame < dataEnd) out.packets.push(b.slice(frame, dataEnd));
    }
    p = dataEnd;
  }
  return true;
}

/** Samples (at 48 kHz) in one Opus packet, from its TOC byte (RFC 6716 §3.1). */
export function opusSamples(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) return 0;
  const cfg = toc >> 3;
  const ms = cfg < 12 ? [10, 20, 40, 60][cfg & 3]! : cfg < 16 ? [10, 20][cfg & 1]! : [2.5, 5, 10, 20][cfg & 3]!;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 1) & 0x3f : 2;
  return Math.round(ms * 48 * frames);
}

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      crcTable[i] = r >>> 0;
    }
  }
  let c = 0;
  for (let i = 0; i < data.length; i++) c = ((c << 8) ^ crcTable[((c >>> 24) ^ data[i]!) & 0xff]!) >>> 0;
  return c >>> 0;
}

function page(type: number, granule: number, serial: number, seq: number, packets: Uint8Array[]): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const body = packets.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, type]); // "OggS", version 0
  v.setUint32(6, granule % 2 ** 32, true);
  v.setUint32(10, Math.floor(granule / 2 ** 32), true);
  v.setUint32(14, serial, true);
  v.setUint32(18, seq, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, o);
    o += p.length;
  }
  v.setUint32(22, crc32(out), true);
  return out;
}

function opusHead(): Uint8Array {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1]); // "OpusHead", version 1, mono
  new DataView(h.buffer).setUint16(10, 312, true); // pre-skip
  new DataView(h.buffer).setUint32(12, 48000, true);
  return h;
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('mening-telegramim');
  const t = new Uint8Array(8 + 4 + vendor.length + 4);
  t.set(new TextEncoder().encode('OpusTags'));
  new DataView(t.buffer).setUint32(8, vendor.length, true);
  t.set(vendor, 12);
  return t; // zero comments
}

/** WebM/Opus bytes -> Ogg/Opus bytes, or null if this is not a WebM with Opus packets we understand. */
export function webmToOgg(webm: Uint8Array): Uint8Array | null {
  const parsed: Parsed = { packets: [] };
  try {
    if (!walk(webm, 0, webm.length, parsed) || parsed.packets.length === 0) return null;
  } catch {
    return null;
  }
  const serial = Math.floor(Math.random() * 0xffffffff);
  const pages: Uint8Array[] = [page(0x02, 0, serial, 0, [parsed.head ?? opusHead()]), page(0, 0, serial, 1, [opusTags()])];
  let seq = 2;
  let granule = 0;
  let batch: Uint8Array[] = [];
  let segs = 0;
  const flush = (last: boolean) => {
    if (batch.length === 0) return;
    pages.push(page(last ? 0x04 : 0, granule, serial, seq++, batch));
    batch = [];
    segs = 0;
  };
  parsed.packets.forEach((p, i) => {
    const need = Math.floor(p.length / 255) + 1;
    if (segs + need > 250 || batch.length >= 25) flush(false);
    batch.push(p);
    segs += need;
    granule += opusSamples(p);
    if (i === parsed.packets.length - 1) flush(true);
  });
  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Reads Ogg pages back (used by tests to prove the output is well-formed). */
export function readOgg(buf: Uint8Array): { type: number; granule: number; seq: number; crcOk: boolean; packets: Uint8Array[] }[] {
  const pages: { type: number; granule: number; seq: number; crcOk: boolean; packets: Uint8Array[] }[] = [];
  let p = 0;
  while (p + 27 <= buf.length) {
    if (String.fromCharCode(...buf.subarray(p, p + 4)) !== 'OggS') throw new Error('not an Ogg page');
    const n = buf[p + 26]!;
    const lacing = buf.subarray(p + 27, p + 27 + n);
    const body = lacing.reduce((a, b) => a + b, 0);
    const end = p + 27 + n + body;
    const v = new DataView(buf.buffer, buf.byteOffset + p);
    const copy = buf.slice(p, end);
    const want = new DataView(copy.buffer).getUint32(22, true);
    new DataView(copy.buffer).setUint32(22, 0, true);
    const packets: Uint8Array[] = [];
    let o = p + 27 + n;
    let cur = 0;
    for (const l of lacing) {
      cur += l;
      if (l < 255) {
        packets.push(buf.slice(o, o + cur));
        o += cur;
        cur = 0;
      }
    }
    pages.push({ type: buf[p + 5]!, granule: v.getUint32(6, true) + v.getUint32(10, true) * 2 ** 32, seq: v.getUint32(18, true), crcOk: crc32(copy) === want, packets });
    p = end;
  }
  return pages;
}
