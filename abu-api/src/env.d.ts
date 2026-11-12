// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
// Set in production with `npx wrangler secret put BETTER_AUTH_SECRET`.
interface Env {
  /** Signs session cookies. A long random string; never commit it. */
  BETTER_AUTH_SECRET: string;
  /** Claude, for reading scanned sheets. */
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
}
// Scanning sheets: `npx wrangler secret put ANTHROPIC_API_KEY`. Without it, scanning says it isn't switched on.
// ANTHROPIC_BASE_URL (optional) sends the calls through Cloudflare AI Gateway instead of straight to Anthropic.
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_BASE_URL?: string;
  }
}
