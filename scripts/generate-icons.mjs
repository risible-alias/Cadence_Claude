// Renders the PNG app icons in public/ from one SVG drawing, using the
// Chromium that Playwright already installs. Run with `npm run icons` after
// changing the artwork; the PNGs are committed so builds do not need a browser.
import { chromium } from '@playwright/test'

/** `glyph` is the clock's size relative to the canvas; maskable icons need a wider margin. */
const icon = (glyph) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <rect width="32" height="32" fill="#0f766e"/>
  <g transform="translate(16 16) scale(${glyph}) translate(-16 -16)" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="16" cy="16" r="8"/>
    <path d="M16 11v5l3 2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`

const targets = [
  { file: 'pwa-192.png', size: 192, glyph: 1.15 },
  { file: 'pwa-512.png', size: 512, glyph: 1.15 },
  { file: 'pwa-maskable-512.png', size: 512, glyph: 0.9 },
  // iOS masks the corners itself and needs an opaque square.
  { file: 'apple-touch-icon.png', size: 180, glyph: 1.15 },
]

const browser = await chromium.launch()
for (const { file, size, glyph } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0">${icon(glyph)}</body>`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname })
  await page.close()
  console.log(`wrote public/${file}`)
}
await browser.close()
