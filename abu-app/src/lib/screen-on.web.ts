import { useEffect } from 'react';

/**
 * Keep the screen on while the screen using this is open (Perform). Browsers
 * drop the lock whenever the page is hidden, so take it again on return; where
 * there's no wake lock (older browsers), do nothing.
 */
export function useScreenOn(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let open = true;
    const take = () => {
      if (!open || document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (open) lock = l;
          else void l.release();
        })
        .catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      open = false;
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => {});
    };
  }, []);
}
