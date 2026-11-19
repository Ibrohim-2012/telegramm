import { describe, expect, it } from 'vitest';
import { opusSamples, readOgg, webmToOgg } from '@/lib/ogg';

// --- a tiny WebM writer, just enough to build what MediaRecorder produces
const vint = (n: number): number[] => (n < 127 ? [0x80 | n] : n < 16383 ? [0x40 | (n >> 8), n & 0xff] : [0x20 | (n >> 16), (n >> 8) & 0xff, n & 0xff]);
const idBytes = (id: number): number[] => {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256);
  return out;
};
const el = (id: number, payload: number[] | Uint8Array): number[] => [...idBytes(id), ...vint(payload.length), ...payload];
const simpleBlock = (packet: Uint8Array, tc: number) => el(0xa3, [0x81, tc >> 8, tc & 0xff, 0x80, ...packet]); // track 1, keyframe flag, no lacing
const head = (): number[] => [...new TextEncoder().encode('OpusHead'), 1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0];
const webm = (packets: Uint8Array[], withHead = true) =>
  new Uint8Array([
    ...el(0x1a45dfa3, [0x42, 0x82, 0x84, ...new TextEncoder().encode('webm')]),
    ...el(
      0x18538067,
      [
        ...el(0x1654ae6b, el(0xae, [...el(0xd7, [1]), ...(withHead ? el(0x63a2, head()) : [])])),
        ...el(0x1f43b675, [...el(0xe7, [0]), ...packets.flatMap((p, i) => simpleBlock(p, i * 20))]),
      ],
    ),
  ]);

// 20 ms CELT packet (TOC 0xF8 = config 31, mono, 1 frame) with some payload
const packet = (n: number, len = 40) => new Uint8Array([0xf8, ...Array.from({ length: len - 1 }, (_, i) => (i * 7 + n) & 0xff)]);

describe('opus helpers', () => {
  it('reads packet durations from the TOC byte', () => {
    expect(opusSamples(new Uint8Array([0xf8]))).toBe(960); // CELT 20 ms
    expect(opusSamples(new Uint8Array([0x78]))).toBe(960); // SILK 20 ms
    expect(opusSamples(new Uint8Array([0xf9, 0]))).toBe(1920); // two frames
    expect(opusSamples(new Uint8Array([0xfb, 3]))).toBe(2880); // code 3, three frames
    expect(opusSamples(new Uint8Array([]))).toBe(0);
  });
});

describe('WebM -> Ogg Opus', () => {
  it('keeps every Opus packet byte for byte, with valid pages, checksums and timing', () => {
    const packets = Array.from({ length: 60 }, (_, i) => packet(i, 20 + (i % 5) * 60));
    const ogg = webmToOgg(webm(packets))!;
    expect(ogg).not.toBeNull();
    const pages = readOgg(ogg);
    expect(pages.every((p) => p.crcOk)).toBe(true);
    expect(pages.map((p) => p.seq)).toEqual(pages.map((_, i) => i)); // consecutive sequence numbers
    expect(pages[0]!.type).toBe(0x02); // beginning of stream
    expect(pages.at(-1)!.type & 0x04).toBe(0x04); // end of stream
    expect(new TextDecoder().decode(pages[0]!.packets[0]!.subarray(0, 8))).toBe('OpusHead');
    expect(new TextDecoder().decode(pages[1]!.packets[0]!.subarray(0, 8))).toBe('OpusTags');
    const audio = pages.slice(2).flatMap((p) => p.packets);
    expect(audio).toHaveLength(60);
    audio.forEach((p, i) => expect([...p]).toEqual([...packets[i]!]));
    expect(pages.at(-1)!.granule).toBe(60 * 960); // 1.2 s at 48 kHz
  });

  it('handles packets of 255 bytes and longer (segment lacing) and unknown-size clusters', () => {
    const packets = [packet(1, 255), packet(2, 510), packet(3, 700)];
    const ogg = webmToOgg(webm(packets))!;
    const audio = readOgg(ogg).slice(2).flatMap((p) => p.packets);
    expect(audio.map((p) => p.length)).toEqual([255, 510, 700]);
    expect(readOgg(ogg).every((p) => p.crcOk)).toBe(true);
  });

  it('writes its own OpusHead when the recorder did not provide one', () => {
    const pages = readOgg(webmToOgg(webm([packet(1)], false))!);
    const h = pages[0]!.packets[0]!;
    expect(new TextDecoder().decode(h.subarray(0, 8))).toBe('OpusHead');
    expect(new DataView(h.buffer, h.byteOffset).getUint32(12, true)).toBe(48000);
  });

  it('returns null for anything that is not a WebM with audio', () => {
    expect(webmToOgg(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(webmToOgg(new Uint8Array([]))).toBeNull();
    expect(webmToOgg(webm([]))).toBeNull();
  });
});
