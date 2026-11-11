import { useKeepAwake } from 'expo-keep-awake';

/** Keep the screen on while the screen using this is open (Perform). */
export function useScreenOn(): void {
  useKeepAwake('abu-screen-on', { suppressDeactivateWarnings: true });
}
