/**
 * Sign-in on Android and iOS. The session cookie is kept in the phone's secure
 * storage and sent with every API call (see src/api/client.ts).
 */
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { API_URL } from '@/api/config';

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [expoClient({ scheme: 'abu', storagePrefix: 'abu', storage: SecureStore })],
});

/** The session cookie to send to the API. */
export async function authCookie(): Promise<string | null> {
  return (await authClient.getCookie()) || null;
}
