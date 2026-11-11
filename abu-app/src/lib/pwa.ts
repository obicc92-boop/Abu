/** On phones Abụ is an app already: nothing to install, and updates come from the store. */
export interface PwaState {
  updateReady: boolean;
  canInstall: boolean;
  installed: boolean;
  ios: boolean;
}

const state: PwaState = { updateReady: false, canInstall: false, installed: true, ios: false };

export function startPwa(): void {}
export function applyUpdate(): void {}
export async function install(): Promise<boolean> {
  return false;
}
export function usePwa(): PwaState {
  return state;
}
