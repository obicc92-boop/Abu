/** Small settings kept on this phone (current group, "looking around"). */
import * as SecureStore from 'expo-secure-store';

export function readSetting(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string | null): void {
  try {
    if (value === null) void SecureStore.deleteItemAsync(key);
    else SecureStore.setItem(key, value);
  } catch {
    // Not critical: the app falls back to defaults.
  }
}
