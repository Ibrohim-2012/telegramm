'use client';
import { memo, useState } from 'react';
import { API_URL } from '@/lib/api';
import { gradientFor, initials } from '@/lib/format';

/** Initials on a gradient; the real profile picture fades in on top when there is one (browser-cached for a day). */
export const Avatar = memo(function Avatar({ id, title, size = 54, online, photo, saved }: { id: string; title: string; size?: number; online?: boolean; photo?: boolean; saved?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (saved) {
    return (
      <div className="grid shrink-0 place-items-center rounded-full text-white" style={{ width: size, height: size, background: 'linear-gradient(135deg,#72d5fd,#2a9ef1)' }} aria-hidden="true">
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="relative grid h-full w-full select-none place-items-center overflow-hidden rounded-full font-semibold text-white"
        style={{ background: gradientFor(id), fontSize: size * 0.38 }}
        aria-hidden="true"
      >
        {initials(title)}
        {photo && !failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${API_URL}/api/avatar/${id}`}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </div>
      {online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface bg-ok" aria-label="online" />}
    </div>
  );
});
