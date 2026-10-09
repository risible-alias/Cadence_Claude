import { expect, test } from '@playwright/test'

const MIN = 60_000

test('create category, start, pause, reload, resume, finish, see it in today', async ({ page }) => {
  // A controlled clock lets the test cover 20 minutes without real waiting.
  await page.clock.install({ time: new Date(2026, 0, 10, 9, 0, 0) })
  await page.goto('/')

  await expect(page.getByText('No saved sessions today')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled()

  // Two-level hierarchy: Academics → Mathematics.
  await page.getByLabel('New category name').fill('Academics')
  await page.getByRole('button', { name: 'Add category' }).click()
  await expect(page.getByLabel('Inside')).toContainText('Academics')
  await page.getByLabel('New category name').fill('Mathematics')
  await page.getByLabel('Inside').selectOption({ label: 'Academics' })
  await page.getByRole('button', { name: 'Add category' }).click()

  // The new category is preselected; start with an optional title.
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue(/.+/)
  await page.getByLabel(/^Title/).fill('Problem set 3')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')
  await expect(page.getByRole('region', { name: 'Current session' }).getByText('Academics → Mathematics')).toBeVisible()

  await page.clock.fastForward(10 * MIN)
  await expect(page.getByRole('timer')).toHaveText(/^00:10:0\d$/)

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Paused')
  await page.clock.fastForward(5 * MIN)
  await expect(page.getByRole('timer')).toHaveText(/^00:10:0\d$/)

  // The paused session survives a reload.
  await page.reload()
  await expect(page.getByTestId('timer-status')).toHaveText('Paused')
  await expect(page.getByRole('timer')).toHaveText(/^00:10:0\d$/)

  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')
  await page.clock.fastForward(5 * MIN)

  // A running session survives a reload too.
  await page.reload()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')
  await expect(page.getByRole('timer')).toHaveText(/^00:15:0\d$/)

  // Finish saves immediately: no reflection prompt, straight back to the start form.
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Current session' }).getByRole('status')).toContainText('Saved 15m 0')

  const today = page.getByRole('region', { name: 'Today' })
  await expect(today.getByRole('listitem').filter({ hasText: 'Academics → Mathematics' })).toBeVisible()
  await expect(today.getByText('Problem set 3')).toBeVisible()
  await expect(today.getByTestId('day-total')).toHaveText(/^15m 0\ds$/)

  // Saved history survives a reload.
  await page.reload()
  await expect(page.getByTestId('day-total')).toHaveText(/^15m 0\ds$/)
})

test('cancel asks for confirmation and saves nothing', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('New category name').fill('Violin')
  await page.getByRole('button', { name: 'Add category' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')

  await page.getByRole('button', { name: 'Cancel session' }).click()
  await page.getByRole('button', { name: 'Keep session' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')

  await page.getByRole('button', { name: 'Cancel session' }).click()
  await page.getByRole('button', { name: 'Discard session' }).click()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  await expect(page.getByText('No saved sessions today')).toBeVisible()
})
