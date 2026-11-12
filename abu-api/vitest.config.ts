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
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_URL: 'https://abu.test',
            BETTER_AUTH_SECRET: 'test-only-secret-that-is-long-enough-for-better-auth',
            // Never the real key (wrangler dev's .dev.vars may hold one): tests must not reach Claude.
            ANTHROPIC_API_KEY: '',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
