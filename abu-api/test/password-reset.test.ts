/**
 * Forgot password, the way the app does it: ask for a link with your email, open it, choose a new password. The
 * email isn't sent: `mail.send` is replaced, and what it was given is checked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mail, resetEmail, type Email } from '../src/email';
import { call, cookieFrom, ORIGIN, PASSWORD, signUp } from './helpers';

const NEW_PASSWORD = 'sunday-rehearsal-2026';

let sent: Email[] = [];
beforeEach(() => {
  sent = [];
  vi.spyOn(mail, 'send').mockImplementation(async (_env, email) => void sent.push(email));
});
afterEach(() => vi.restoreAllMocks());

const ask = (email: string) => call('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email, redirectTo: '/reset-password' }) });
const linkIn = (email: Email) => email.text.match(/https:\/\/\S+/)![0];
const signIn = (email: string, password: string) => call('/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) });

describe('Forgot password', () => {
  it('emails a link that opens the page to choose a new password, which then signs in, and the old one no longer does', async () => {
    const { email, cookie } = await signUp('Chioma Eze');
    const asked = await ask(email);
    expect(asked.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: email, subject: 'Choose a new password for SolfaScores' });
    expect(sent[0].text).toContain('Hi Chioma Eze,');

    // The link checks itself, then opens the app's page with the token.
    const link = linkIn(sent[0]);
    expect(link).toMatch(/^https:\/\/abu\.test\/api\/auth\/reset-password\/\w+\?callbackURL=%2Freset-password$/);
    const opened = await fetchManual(link);
    expect(opened.status).toBe(302);
    const page = new URL(opened.headers.get('location')!);
    expect(`${page.origin}${page.pathname}`).toBe(`${ORIGIN}/reset-password`);
    const token = page.searchParams.get('token')!;
    expect(token).toBe(link.split('/reset-password/')[1].split('?')[0]);

    const reset = await call('/auth/reset-password', { method: 'POST', body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) });
    expect(reset.status).toBe(200);
    expect((await signIn(email, PASSWORD)).status).toBe(401);
    const signedIn = await signIn(email, NEW_PASSWORD);
    expect(signedIn.status).toBe(200);
    expect((await call('/me', { cookie: cookieFrom(signedIn) })).status).toBe(200);
    // Signed out everywhere it was signed in before.
    expect((await call('/me', { cookie })).status).toBe(401);

    // A link works once.
    const again = await call('/auth/reset-password', { method: 'POST', body: JSON.stringify({ newPassword: 'another-one-2026', token }) });
    expect(again.status).toBe(400);
    const reopened = await fetchManual(link);
    expect(new URL(reopened.headers.get('location')!).searchParams.get('error')).toBe('INVALID_TOKEN');
  });

  it('answers the same for an email with no account, and sends nothing', async () => {
    const res = await ask(`nobody-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: true });
    expect(sent).toHaveLength(0);
  });

  it('sends at most 3 links an hour to an account', async () => {
    const { email } = await signUp('Bisi Lawal');
    for (let i = 0; i < 5; i++) expect((await ask(email)).status).toBe(200);
    expect(sent).toHaveLength(3);
    // The links sent still work.
    const token = linkIn(sent[2]).split('/reset-password/')[1].split('?')[0];
    expect((await call('/auth/reset-password', { method: 'POST', body: JSON.stringify({ newPassword: NEW_PASSWORD, token }) })).status).toBe(200);
  });

  it('answers the same when the email can’t be sent', async () => {
    const { email } = await signUp('Uche Obi');
    vi.spyOn(mail, 'send').mockRejectedValue(Object.assign(new Error('Sending to this address needs Workers Paid'), { code: 'E_RECIPIENT_PLAN_RESTRICTED' }));
    const res = await ask(email);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: true });
  });

  it('wants a new password of 8 characters or more', async () => {
    const { email } = await signUp('Femi Bello');
    await ask(email);
    const token = linkIn(sent[0]).split('/reset-password/')[1].split('?')[0];
    const res = await call('/auth/reset-password', { method: 'POST', body: JSON.stringify({ newPassword: 'short', token }) });
    expect(res.status).toBe(400);
    expect((await signIn(email, PASSWORD)).status).toBe(200);
  });
});

describe('The email', () => {
  it('keeps what people typed as their name from being read as HTML', () => {
    const email = resetEmail({ name: '<b>Ada</b> & "Co"', email: 'ada@example.com' }, 'https://solfascores.com/api/auth/reset-password/x?callbackURL=%2Freset-password');
    expect(email.html).toContain('Hi &lt;b&gt;Ada&lt;/b&gt; &amp; &quot;Co&quot;,');
    expect(email.html).not.toContain('<b>Ada');
    expect(email.text).toContain('Hi <b>Ada</b> & "Co",');
    expect(email.html).toContain('href="https://solfascores.com/api/auth/reset-password/x?callbackURL=%2Freset-password"');
  });
});

/** Opens a link without following where it sends you. */
async function fetchManual(url: string) {
  const { SELF } = await import('cloudflare:test');
  return SELF.fetch(url, { redirect: 'manual' });
}
