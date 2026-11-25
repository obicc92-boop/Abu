import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime (Miniflare) with a local D1 database,
// migrated before each test file. Nothing touches the real Cloudflare account.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // The AI binding only works remotely; the tests give scanning a fake one instead, so never reach Cloudflare.
        remoteBindings: false,
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_URL: 'https://abu.test',
            BETTER_AUTH_SECRET: 'test-only-secret-that-is-long-enough-for-better-auth',
            // Never the real key (wrangler dev's .dev.vars may hold one): tests must not reach Claude.
            ANTHROPIC_API_KEY: '',
            // Covers made without anyone asking (src/auto-covers.ts) stay off: its tests call it themselves.
            AUTO_COVERS: 'off',
          },
        },
      }),
    ],
    // Signing up hashes a password with 100,000 rounds of PBKDF2 on purpose (src/auth.ts), so a test that signs up
    // three people takes a few seconds, and far longer while the machine is busy: vitest's 5 seconds timed out at random.
    test: { setupFiles: ['./test/apply-migrations.ts'], testTimeout: 30_000 },
  };
});
