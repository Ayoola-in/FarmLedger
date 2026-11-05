/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Preview serves the production headers, so browser tests run under the real CSP.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] };
const securityHeaders = Object.fromEntries(
  (vercel.headers[0]?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value]),
);

export default defineConfig({
  preview: { headers: securityHeaders },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'logo-mark.webp'],
      manifest: {
        name: 'FarmLedger',
        short_name: 'FarmLedger',
        description: 'Poultry farm records and accounts that work offline.',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        background_color: '#16191b',
        theme_color: '#16191b',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Every screen, font and icon ships in the precache, so the whole app
        // works offline after one online visit.
        globPatterns: ['**/*.{js,css,html,woff2,png,webp,svg}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: { sourcemap: true, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
