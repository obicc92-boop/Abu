// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
// Set in production with `npx wrangler secret put BETTER_AUTH_SECRET`.
interface Env {
  /** Signs session cookies. A long random string; never commit it. */
  BETTER_AUTH_SECRET: string;
}
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
  }
}
