import { expect, test } from '@playwright/test'

// Runs against the production build (see playwright.config.ts), in Chromium.

test('after one online visit the app loads and tracks time with no network', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Cadence is ready to work offline')).toBeVisible()
  // The first page load predates the service worker; the next one is served by it.
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await page.getByLabel('New category name').fill('Reading')
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')

  await context.setOffline(true)
  await page.reload()

  // The shell came from the cache and the timer from IndexedDB.
  await expect(page.getByRole('heading', { name: 'Cadence' })).toBeVisible()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Paused')
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('day-total')).toBeVisible()

  // Still offline: a full reload keeps both the app and the saved session.
  await page.reload()
  await expect(page.getByTestId('day-total')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Today' }).getByRole('listitem').filter({ hasText: 'Reading' })).toBeVisible()
})

test('a deep reload offline does not show a browser error page', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.goto('/?source=homescreen')
  await expect(page.getByRole('heading', { name: 'Cadence' })).toBeVisible()
})

test('the manifest and its icons are served', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'Cadence', display: 'standalone', start_url: '.', scope: '.' })
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const response = await request.get(new URL(icon.src, new URL(href!, page.url())).href)
    expect(response.status(), icon.src).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  }
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200)
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
})
