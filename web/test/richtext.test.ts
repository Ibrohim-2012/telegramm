import { describe, expect, it } from 'vitest';
import { parseRich, plainText } from '@/lib/richtext';

describe('parseRich', () => {
  it('parses bold, italic, code and nesting', () => {
    expect(parseRich('a **b __c__** `d`')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'b', c: [{ t: 'text', v: 'b ' }, { t: 'i', c: [{ t: 'text', v: 'c' }] }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'd' },
    ]);
  });
  it('detects urls without trailing punctuation, mentions, and markdown links', () => {
    const r = parseRich('see https://example.com/a?b=1, @alisher_dev and [site](https://x.uz)');
    expect(r).toContainEqual({ t: 'url', v: 'https://example.com/a?b=1' });
    expect(r).toContainEqual({ t: 'mention', v: '@alisher_dev' });
    expect(r).toContainEqual({ t: 'link', href: 'https://x.uz', c: [{ t: 'text', v: 'site' }] });
  });
  it('never turns javascript: links or emails into anchors', () => {
    expect(parseRich('[x](javascript:alert(1))')).toEqual([{ t: 'text', v: '[x](javascript:alert(1))' }]);
    expect(parseRich('mail me@example.com')).toEqual([{ t: 'text', v: 'mail me@example.com' }]);
  });
  it('treats html as plain text', () => {
    expect(parseRich('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)>' }]);
  });
  it('code blocks keep markdown literal', () => {
    expect(parseRich('```**x**```')).toEqual([{ t: 'pre', v: '**x**' }]);
  });
  it('plainText strips markup for previews', () => {
    expect(plainText('**Muhim:** `09:00` [reja](https://a.uz) __x__')).toBe('Muhim: 09:00 reja x');
  });
});
