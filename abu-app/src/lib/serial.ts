import { useRef, useState } from 'react';

/**
 * Runs jobs one at a time, in the order they were asked for, so quick taps
 * reach the server in order (the song order editor, the attendance register).
 * `busy` counts jobs not finished; `error` is the last one's message.
 */
export function useSerial(onSettled?: () => void) {
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function run<T>(job: () => Promise<T>): Promise<T> {
    setBusy((n) => n + 1);
    setError(null);
    const next = chain.current.then(job);
    chain.current = next.catch(() => {});
    next
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        setBusy((n) => n - 1);
        onSettled?.();
      });
    return next;
  }
  /** Resolves once every job asked for so far has finished. */
  const idle = () => chain.current;

  return { run, idle, busy, error };
}
