/**
 * After `expo export`, makes the website work without data. Workbox (Expo's
 * recommendation) writes dist/sw.js, a service worker that keeps every file
 * of this build on the phone, versioned, so Abụ opens offline and each deploy
 * replaces the old files cleanly. Original sheets are kept too: the network
 * first, the saved copy when there's no connection.
 *
 * Updates wait (no skipWaiting): the app shows "New version ready" and only
 * reloads when someone taps Update, never in the middle of Perform.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateSW } from 'workbox-build';

// The interface fonts download alongside the scripts instead of after them, so
// a first visit on slow data opens sooner. (The sol-fa font loads later.)
const fonts = readdirSync('dist/assets', { recursive: true })
  .map(String)
  .filter((f) => /(Figtree_(500Medium|700Bold|800ExtraBold)|Marcellus_400Regular)\.[0-9a-f]+\.ttf$/.test(f));
const html = readFileSync('dist/index.html', 'utf8');
if (fonts.length && !html.includes('rel="preload"')) {
  const links = fonts.map((f) => `<link rel="preload" href="/${join('assets', f).split('\\').join('/')}" as="font" type="font/ttf" crossorigin />`).join('');
  writeFileSync('dist/index.html', html.replace('</head>', `${links}</head>`));
}
console.log(`Preloading ${fonts.length} fonts.`);

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist',
  globPatterns: ['**/*.{html,js,css,json,png,ico,svg,ttf,otf,woff,woff2}'],
  // pdf.js is only for scanning PDFs, which needs a connection anyway: not worth the space on every phone.
  globIgnores: ['metadata.json', 'sw.js', 'workbox-*.js', 'pdfjs/**', 'ort/**', 'reader/**'],
  swDest: 'dist/sw.js',
  mode: 'production',
  sourcemap: false,
  inlineWorkboxRuntime: true,
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  // Hashed file names never change, so they need no extra version check.
  dontCacheBustURLsMatching: /^(_expo\/static|assets)\//,
  // Every page of the app is the same single-page shell.
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//],
  clientsClaim: true,
  skipWaiting: false,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      urlPattern: /\/api\/songs\/[^/]+\/sheet$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'abu-sheets',
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 120 },
        cacheableResponse: { statuses: [200] },
      },
    },
  ],
});

for (const w of warnings) console.warn(w);
console.log(`Offline: sw.js keeps ${count} files (${(size / 1024 / 1024).toFixed(1)} MB) on the phone.`);
