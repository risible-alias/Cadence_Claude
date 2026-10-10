import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves a project site from /<repository>/, so the deploy workflow
// sets BASE_PATH. Everything else (dev, preview, tests) runs at the root.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The new service worker waits until the user reloads (see src/app/pwa.ts).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cadence',
        short_name: 'Cadence',
        description: 'A private, local-first activity tracker.',
        lang: 'en',
        // Relative to the manifest, so they follow whatever base path the app is served from.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#f6f1e7',
        background_color: '#f6f1e7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole built app: it is small and makes no network requests of its own.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // A fixed zone with daylight saving makes local-day tests deterministic.
    env: { TZ: 'Europe/London' },
  },
})
