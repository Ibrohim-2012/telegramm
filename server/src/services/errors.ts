import { TgError } from '../types.js';

interface RpcLike {
  errorMessage?: string;
  seconds?: number;
  message?: string;
  code?: string | number;
}

const PASSTHROUGH = new Set([
  'PHONE_CODE_INVALID',
  'PHONE_CODE_EMPTY',
  'PHONE_CODE_EXPIRED',
  'PHONE_NUMBER_INVALID',
  'PHONE_NUMBER_BANNED',
  'PASSWORD_HASH_INVALID',
  'SESSION_REVOKED',
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_DUPLICATED',
  'USER_DEACTIVATED',
  'API_ID_INVALID',
  'PINNED_DIALOGS_TOO_MUCH',
  'REACTION_INVALID',
  'REACTIONS_TOO_MANY',
]);

const NETWORK_RE = /ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|network|timeout|not connected|connection/i;

/** Translate GramJS / Node errors into stable TgError codes the UI understands. */
export function mapError(e: unknown): TgError {
  if (e instanceof TgError) return e;
  const r = (typeof e === 'object' && e !== null ? e : {}) as RpcLike;
  const em = r.errorMessage ?? '';
  const text = r.message ?? String(e);

  const flood = /^FLOOD_WAIT_(\d+)$/.exec(em) ?? /FLOOD_WAIT_(\d+)/.exec(text);
  if (flood || em === 'FLOOD' || typeof r.seconds === 'number') {
    const secs = flood ? Number(flood[1]) : (r.seconds ?? 30);
    return new TgError('FLOOD_WAIT', `Kuting: ${secs}s`, secs);
  }
  if (PASSTHROUGH.has(em)) return new TgError(em, em);
  if (NETWORK_RE.test(text) || NETWORK_RE.test(String(r.code ?? ''))) return new TgError('NETWORK', 'Tarmoq xatosi');
  return new TgError('UNKNOWN', 'Kutilmagan xatolik');
}

export const isSessionDead = (e: TgError) => e.code === 'AUTH_KEY_UNREGISTERED' || e.code === 'SESSION_REVOKED' || e.code === 'USER_DEACTIVATED';
