/**
 * Sign-in with Better Auth, running on this Worker with accounts in D1.
 *
 * Email and password, with Forgot password by email (src/email.ts). Email codes
 * and Google sign-in come later; they attach to the same accounts.
 */
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';

import { ensureUser } from './domain/groups';
import { mail, resetEmail, RESET_LINK_LIFE } from './email';

/**
 * Passwords are hashed with PBKDF2 from the Workers runtime's own Web Crypto.
 * Better Auth's default (scrypt in JavaScript) costs too much CPU for a Worker
 * request. 100,000 iterations is the most Workers allow.
 */
const ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [scheme, iterations, salt, expected] = hash.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !expected) return false;
  const actual = await derive(password, fromBase64(salt), Number(iterations));
  const wanted = fromBase64(expected);
  return actual.length === wanted.length && crypto.subtle.timingSafeEqual(actual, wanted);
}

/**
 * Links to choose a new password emailed in an hour: 3 an account, 60 for everyone. Anyone can ask for one with an
 * address, so this keeps a stranger from filling someone's inbox, or using up the month's emails. Counted from the
 * links not yet used or out of date (Better Auth's `verification` rows, each lasting an hour, dates as ISO text).
 */
const RESETS_AN_HOUR = { account: 3, everyone: 60 };

export async function mayEmailReset(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `select count(*) as everyone, coalesce(sum(value = ?1), 0) as account from verification
       where identifier like 'reset-password:%' and expiresAt > ?2`,
    )
    .bind(userId, new Date().toISOString())
    .first<{ everyone: number; account: number }>();
  // Better Auth stores this request's link before asking for the email, so it's among those counted.
  return !row || (row.account <= RESETS_AN_HOUR.account && row.everyone <= RESETS_AN_HOUR.everyone);
}

function build(env: Env) {
  return betterAuth({
    appName: 'SolfaScores',
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    // The website itself, its old address (pages opened there before the move to
    // solfascores.com, and the app installed from it), and the phone apps (solfascores:// links).
    trustedOrigins: [env.BETTER_AUTH_URL, 'https://abu.adalingo.workers.dev', 'solfascores://'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
      // Forgot password (22 November 2026): an email with a link to choose a new one. It answers the same whether or
      // not there's an account (Better Auth's), and a send that fails is logged, not shown. Choosing the new password
      // signs the account out everywhere, as changing it does.
      resetPasswordTokenExpiresIn: RESET_LINK_LIFE,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (!(await mayEmailReset(env.DB, user.id))) {
          console.warn('Forgot password: too many links asked for this hour; none sent.');
          return;
        }
        try {
          await mail.send(env, { to: user.email, ...resetEmail(user, url) });
        } catch (e) {
          console.error('Forgot password: the email wasn’t sent.', (e as { code?: string }).code ?? '', (e as Error).message);
        }
      },
    },
    // Stay signed in on your own phone: 90 days, renewed as you use the app.
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    plugins: [expo()],
    databaseHooks: {
      user: {
        create: {
          // Everyone gets a profile and their own space ("My space") on sign-up.
          after: async (user) => {
            await ensureUser(env.DB, { id: user.id, name: user.name, email: user.email });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof build>;

const instances = new WeakMap<Env, Auth>();

/** The Better Auth instance for this Worker's bindings (built once per isolate where possible). */
export function getAuth(env: Env): Auth {
  let auth = instances.get(env);
  if (!auth) {
    auth = build(env);
    instances.set(env, auth);
  }
  return auth;
}
