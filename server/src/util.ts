/** Runs at most `n` async tasks at once (keeps avatar downloads from hammering Telegram). */
export function limiter(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    active--;
    waiting.shift()?.();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}
