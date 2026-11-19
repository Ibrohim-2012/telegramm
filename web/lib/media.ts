import { API_URL } from './api';

export function mediaUrl(dialogId: string, messageId: number, opts: { thumb?: boolean; download?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.thumb) q.set('thumb', '1');
  if (opts.download) q.set('dl', '1');
  const qs = q.toString();
  return `${API_URL}/api/media/${dialogId}/${messageId}${qs ? `?${qs}` : ''}`;
}

/** Display box that keeps the aspect ratio but never exceeds max size (prevents layout jumps). */
export function fitBox(w: number | undefined, h: number | undefined, maxW = 320, maxH = 360): { width: number; height: number } {
  if (!w || !h) return { width: maxW, height: Math.round(maxW * 0.75) };
  const k = Math.min(maxW / w, maxH / h, 1);
  return { width: Math.max(80, Math.round(w * k)), height: Math.max(60, Math.round(h * k)) };
}

export const MEDIA_EMOJI: Record<string, string> = {
  photo: '📷',
  video: '🎬',
  file: '📎',
  voice: '🎤',
  audio: '🎵',
  sticker: '🙂',
  gif: 'GIF',
  round: '⭕',
};
