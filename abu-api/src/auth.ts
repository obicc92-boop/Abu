/**
 * Sign-in with Better Auth, running on this Worker with accounts in D1.
 *
 * For now: email and password, so people can get in without a domain to send
 * email from. Email codes and Google sign-in come later; they attach to the
 * same accounts.
 */
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';

import { ensureUser } from './domain/groups';

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

function build(env: Env) {
  return betterAuth({
    appName: 'Abụ',
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    // The website itself, and the phone apps (abu:// deep links).
    trustedOrigins: [env.BETTER_AUTH_URL, 'abu://'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
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
