import type { MediaBlob, MediaInfo } from '../types.js';

/** Generated stand-ins for Telegram media so the whole UI works offline in MOCK mode. */

const PALETTES = [
  ['#ff885e', '#ff516a'],
  ['#82b1ff', '#665fff'],
  ['#a0de7e', '#54cb68'],
  ['#72d5fd', '#2a9ef1'],
  ['#e0a2f3', '#d669ed'],
  ['#ffcd6a', '#ffa85c'],
] as const;

export function photoSvg(seed: number, width: number, height: number): MediaBlob {
  const [a, b] = PALETTES[seed % PALETTES.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${width * 0.72}" cy="${height * 0.3}" r="${height * 0.14}" fill="#fff" fill-opacity=".55"/>
<path d="M0 ${height} L${width * 0.35} ${height * 0.55} L${width * 0.55} ${height * 0.78} L${width * 0.75} ${height * 0.5} L${width} ${height} Z" fill="#000" fill-opacity=".22"/>
<text x="16" y="${height - 16}" font-family="sans-serif" font-size="22" fill="#fff" fill-opacity=".85">Rasm #${seed}</text></svg>`;
  return { mime: 'image/svg+xml', name: `rasm-${seed}.svg`, data: Buffer.from(svg) };
}

export function stickerSvg(alt: string): MediaBlob {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><text x="128" y="128" font-size="190" text-anchor="middle" dominant-baseline="central">${alt}</text></svg>`;
  return { mime: 'image/svg+xml', name: 'sticker.svg', data: Buffer.from(svg) };
}

export function fileText(seed: number): MediaBlob {
  const body = `Hisobot #${seed}\n${'-'.repeat(24)}\nBu MOCK rejimda yaratilgan namunaviy fayl.\n`;
  return { mime: 'text/plain', name: `hisobot-${seed}.txt`, data: Buffer.from(body) };
}

/** A valid 16-bit mono PCM WAV with a soft two-tone beep pattern (plays in <audio>). */
export function voiceWav(seconds: number): MediaBlob {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f = Math.floor(t * 2) % 2 === 0 ? 440 : 554;
    const env = Math.min(1, (t * 2 - Math.floor(t * 2)) * 8) * (1 - (t * 2 - Math.floor(t * 2)) * 0.6);
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * f * t) * 9000 * env), 44 + i * 2);
  }
  return { mime: 'audio/wav', name: 'ovozli-xabar.wav', data: buf };
}

/** Deterministic media for mock history messages, keyed by message id. */
export function mockMediaFor(id: number): MediaInfo | undefined {
  if (id % 13 === 0) return { kind: 'photo', mime: 'image/svg+xml', width: 640, height: id % 2 ? 480 : 360, name: `rasm-${id}.svg` };
  if (id % 17 === 0) {
    const f = fileText(id);
    return { kind: 'file', mime: f.mime, name: f.name, size: f.data.length };
  }
  if (id % 19 === 0) return { kind: 'voice', mime: 'audio/wav', duration: 4, name: 'ovozli-xabar.wav' };
  if (id % 23 === 0) return { kind: 'sticker', mime: 'image/svg+xml', alt: ['😂', '❤️', '👍', '🔥'][id % 4], width: 256, height: 256 };
  return undefined;
}

export function mockBlob(id: number, media: MediaInfo): MediaBlob | undefined {
  switch (media.kind) {
    case 'photo':
      return photoSvg(id, media.width ?? 640, media.height ?? 480);
    case 'file':
      return fileText(id);
    case 'voice':
      return voiceWav(media.duration ?? 4);
    case 'sticker':
      return stickerSvg(media.alt ?? '🙂');
    default:
      return undefined;
  }
}

export function avatarSvg(seed: number): MediaBlob {
  const [a, b] = PALETTES[seed % PALETTES.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><circle cx="80" cy="62" r="28" fill="#fff" fill-opacity=".85"/><path d="M24 160c4-38 28-54 56-54s52 16 56 54z" fill="#fff" fill-opacity=".85"/></svg>`;
  return { mime: 'image/svg+xml', name: `avatar-${seed}.svg`, data: Buffer.from(svg) };
}
