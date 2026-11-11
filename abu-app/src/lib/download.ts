import { Linking } from 'react-native';

/** Downloads a file from Abụ's own API (signed in): phones hand the link to the browser. */
export function download(url: string): void {
  void Linking.openURL(url);
}
