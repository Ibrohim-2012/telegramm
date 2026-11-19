'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { Profile } from './types';

const cache = new Map<string, { at: number; p: Profile }>();
const TTL = 60_000;

/** Profile of a chat (last seen, member count), cached for a minute. */
export function useProfile(id: string | undefined): Profile | null {
  const [p, setP] = useState<Profile | null>(() => (id ? (cache.get(id)?.p ?? null) : null));
  useEffect(() => {
    if (!id) return setP(null);
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL) return setP(hit.p);
    setP(hit?.p ?? null);
    let live = true;
    api<Profile>(`/api/profile/${id}`)
      .then((r) => {
        cache.set(id, { at: Date.now(), p: r });
        if (cache.size > 100) cache.delete(cache.keys().next().value as string);
        if (live) setP(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return p;
}
