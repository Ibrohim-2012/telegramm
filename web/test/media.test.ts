import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from '@/lib/format';
import { fitBox, mediaUrl } from '@/lib/media';

describe('media helpers', () => {
  it('formats sizes and durations', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatDuration(4)).toBe('0:04');
    expect(formatDuration(125.4)).toBe('2:05');
  });
  it('fitBox keeps ratio, never upscales, and has a fallback', () => {
    expect(fitBox(1280, 960)).toEqual({ width: 320, height: 240 });
    expect(fitBox(100, 100)).toEqual({ width: 100, height: 100 });
    expect(fitBox(400, 2000).height).toBeLessThanOrEqual(360);
    expect(fitBox(undefined, undefined)).toEqual({ width: 320, height: 240 });
  });
  it('builds media urls', () => {
    expect(mediaUrl('-100123', 5)).toMatch(/\/api\/media\/-100123\/5$/);
    expect(mediaUrl('1', 2, { thumb: true, download: true })).toMatch(/\?thumb=1&dl=1$/);
  });
});
