/** Calling the Worker as the app does: signing up, and sending the session cookie. */
import { SELF } from 'cloudflare:test';
import { expect } from 'vitest';

export const ORIGIN = 'https://abu.test';
export const PASSWORD = 'choir-practice-2026';

/** Sends a request as the app would, with the session cookie if there is one. */
export function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('origin', ORIGIN);
  if (init.body && typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (init.cookie) headers.set('cookie', init.cookie);
  return SELF.fetch(`${ORIGIN}/api${path}`, { ...init, headers });
}

export const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

/** Signs up a new person and returns their email and session cookie. */
export async function signUp(name: string) {
  const email = `${name.split(' ')[0].toLowerCase()}-${crypto.randomUUID().slice(0, 6)}@example.com`;
  const res = await call('/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ name, email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  return { email, cookie: cookieFrom(res) };
}

/** Sends JSON and returns the parsed reply with its status. */
export async function send<T = unknown>(path: string, method: string, cookie: string | undefined, data?: unknown) {
  const res = await call(path, { method, cookie, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: res.status, body: (await res.json()) as T };
}
