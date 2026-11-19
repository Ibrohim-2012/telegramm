/** Tiny, safe parser for Telegram-style markdown (no HTML is ever injected). */
export type Rich =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i' | 's'; c: Rich[] }
  | { t: 'code' | 'pre'; v: string }
  | { t: 'link'; href: string; c: Rich[] }
  | { t: 'url'; v: string }
  | { t: 'mention'; v: string };

const RE =
  /```([\s\S]+?)```|`([^`\n]+)`|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]"'])|(?<![\w@])(@[A-Za-z][A-Za-z0-9_]{3,31})/g;

export function parseRich(src: string, depth = 0): Rich[] {
  const out: Rich[] = [];
  let last = 0;
  const push = (v: string) => v && out.push({ t: 'text', v });
  for (const m of src.matchAll(RE)) {
    const at = m.index ?? 0;
    push(src.slice(last, at));
    last = at + m[0].length;
    const nest = (s: string) => (depth < 4 ? parseRich(s, depth + 1) : [{ t: 'text', v: s } as Rich]);
    if (m[1] !== undefined) out.push({ t: 'pre', v: m[1].replace(/^\n|\n$/g, '') });
    else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'b', c: nest(m[3]) });
    else if (m[4] !== undefined) out.push({ t: 'i', c: nest(m[4]) });
    else if (m[5] !== undefined) out.push({ t: 's', c: nest(m[5]) });
    else if (m[6] !== undefined && m[7] !== undefined) out.push({ t: 'link', href: m[7], c: nest(m[6]) });
    else if (m[8] !== undefined) out.push({ t: 'url', v: m[8] });
    else if (m[9] !== undefined) out.push({ t: 'mention', v: m[9] });
  }
  push(src.slice(last));
  return out;
}

/** Plain text for previews (chat list, reply quotes). */
export function plainText(src: string): string {
  return src
    .replace(/```([\s\S]+?)```/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/~~([\s\S]+?)~~/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First http(s) link in a message (for the link preview card). */
export function firstUrl(src: string): string | null {
  const walk = (nodes: Rich[]): string | null => {
    for (const n of nodes) {
      if (n.t === 'url') return n.v;
      if (n.t === 'link') return n.href;
      if (n.t === 'b' || n.t === 'i' || n.t === 's') {
        const r = walk(n.c);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(parseRich(src));
}
