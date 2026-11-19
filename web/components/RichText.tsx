import { Fragment } from 'react';
import { parseRich, type Rich } from '@/lib/richtext';

function render(nodes: Rich[]): React.ReactNode {
  const link = 'rt-link';
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'b':
        return <strong key={i}>{render(n.c)}</strong>;
      case 'i':
        return <em key={i}>{render(n.c)}</em>;
      case 's':
        return <s key={i}>{render(n.c)}</s>;
      case 'code':
        return (
          <code key={i} className="rt-code rounded px-1 py-0.5 font-mono text-[0.85em]">
            {n.v}
          </code>
        );
      case 'pre':
        return (
          <pre key={i} className="rt-code my-1 overflow-x-auto rounded-lg p-2 font-mono text-[0.85em]">
            {n.v}
          </pre>
        );
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className={link}>
            {render(n.c)}
          </a>
        );
      case 'url':
        return (
          <a key={i} href={n.v} target="_blank" rel="noopener noreferrer nofollow" className={`${link} break-all`}>
            {n.v}
          </a>
        );
      case 'mention':
        return (
          <a key={i} href={`https://t.me/${n.v.slice(1)}`} target="_blank" rel="noopener noreferrer nofollow" className={link}>
            {n.v}
          </a>
        );
    }
  });
}

export function RichText({ text }: { text: string }) {
  return <>{render(parseRich(text))}</>;
}
