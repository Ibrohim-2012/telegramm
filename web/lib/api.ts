export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAfter?: number,
    public extra?: { premiumLimitMb?: number },
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? (init?.body ? 'POST' : 'GET'),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('NETWORK', 'Tarmoq xatosi');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string; retryAfter?: number; premiumLimitMb?: number };
  };
  if (!res.ok) {
    const e = data.error;
    throw new ApiError(e?.code ?? 'UNKNOWN', e?.message ?? 'Xatolik', e?.retryAfter, e?.premiumLimitMb ? { premiumLimitMb: e.premiumLimitMb } : undefined);
  }
  return data as T;
}
