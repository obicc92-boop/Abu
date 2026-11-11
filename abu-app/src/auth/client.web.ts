/** Sign-in on the web: same origin as the API, so the browser keeps the session cookie. */
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: `${typeof window === 'undefined' ? 'https://abu.adalingo.workers.dev' : window.location.origin}/api/auth`,
});

/** The browser sends the cookie itself. */
export async function authCookie(): Promise<string | null> {
  return null;
}
