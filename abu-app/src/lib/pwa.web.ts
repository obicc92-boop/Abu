/**
 * The installable website: the service worker that keeps Abụ on the phone
 * (scripts/offline-build.mjs writes it), "New version ready", and "Install".
 */
import { useSyncExternalStore } from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** A new version is downloaded and waits for "Update". */
  updateReady: boolean;
  /** The browser can install Abụ (Android Chrome and others). */
  canInstall: boolean;
  /** Opened from the home screen, as an app. */
  installed: boolean;
  /** iPhone or iPad Safari: install with Share, then "Add to Home Screen". */
  ios: boolean;
}

let waiting: ServiceWorker | null = null;
let installPrompt: InstallPrompt | null = null;
let updating = false;
let started = false;
const listeners = new Set<() => void>();

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

let state: PwaState = { updateReady: false, canInstall: false, installed: false, ios: false };
function emit() {
  state = {
    updateReady: !!waiting,
    canInstall: !!installPrompt && !standalone(),
    installed: standalone(),
    ios: typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent),
  };
  listeners.forEach((l) => l());
}

/** Registers the service worker once, when the app starts (not in development, where there's none). */
export function startPwa(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  emit();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    emit();
  });
  if (__DEV__ || !('serviceWorker' in navigator)) return;

  // Only reload when someone tapped "Update" (the first install also changes the controller).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) window.location.reload();
  });
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      const watch = (sw: ServiceWorker | null) =>
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            emit();
          }
        });
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        emit();
      }
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // An installed app can stay open for days: look for a new version every hour.
      setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
    })
    .catch(() => {});
}

/** Switch to the new version (the page reloads). */
export function applyUpdate(): void {
  if (!waiting) return;
  updating = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Shows the browser's own "Install Abụ?" question. Returns whether it was installed. */
export async function install(): Promise<boolean> {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  emit();
  return outcome === 'accepted';
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => state,
    () => state,
  );
}
