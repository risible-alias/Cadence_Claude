import { expect, test } from '@playwright/test'
import { addActivity, begin, MIN, section, setUpActivities } from './helpers'

test('add an activity, begin, pause, reload, resume, title, finish, see it today', async ({ page }) => {
  // A controlled clock lets the test cover 20 minutes without real waiting.
  await page.clock.install({ time: new Date(2026, 0, 10, 9, 0, 0) })
  await page.goto('/')

  // A fresh install explains itself and leads to Settings.
  await expect(page.getByText('No activities yet.')).toBeVisible()
  await expect(page.getByText('Nothing recorded yet today.')).toBeVisible()
  await page.getByRole('link', { name: 'Add your first activity' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  // Two-level hierarchy: Mathematics inside Academics.
  await addActivity(page, 'Academics')
  await addActivity(page, 'Mathematics', 'Academics')

  await section(page, 'Track').click()
  const current = page.getByRole('region', { name: 'Current session' })
  await begin(page, 'Mathematics — Academics')
  // The specific name leads; its group is secondary.
  await expect(current.getByRole('heading', { name: 'Mathematics' })).toBeVisible()
  await expect(current.getByText('Academics', { exact: true })).toBeVisible()

  await page.clock.fastForward(10 * MIN)
  await expect(page.getByRole('timer')).toHaveText(/^10:0\d$/)

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Paused')
  await page.clock.fastForward(5 * MIN)
  await expect(page.getByRole('timer')).toHaveText(/^10:0\d$/)
  await expect(current.getByText(/15 m elapsed · 5 m paused/)).toBeVisible()

  // The paused session survives a reload.
  await page.reload()
  await expect(page.getByTestId('timer-status')).toHaveText('Paused')
  await expect(page.getByRole('timer')).toHaveText(/^10:0\d$/)

  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('In progress')
  await page.clock.fastForward(5 * MIN)

  // A running session survives a reload too.
  await page.reload()
  await expect(page.getByTestId('timer-status')).toHaveText('In progress')
  await expect(page.getByRole('timer')).toHaveText(/^15:0\d$/)

  // A title can be added while it runs.
  await page.getByRole('button', { name: 'Other options' }).click()
  await current.getByLabel(/^Title/).fill('Problem set 3')
  await current.getByRole('button', { name: 'Save title' }).click()
  await expect(current.getByText('Academics · Problem set 3')).toBeVisible()

  // Finish saves immediately: no reflection required, straight back to the ledger.
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('button', { name: 'Begin Mathematics — Academics' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Start a session' }).getByRole('status')).toHaveText(
    'Saved 15 m of Mathematics — Academics.',
  )

  const today = page.getByRole('region', { name: 'Today' })
  await expect(today.getByTestId('today-total')).toHaveText('15 m')
  await expect(today.getByRole('listitem').filter({ hasText: 'Mathematics — Academics' })).toContainText('Problem set 3')

  // Saved history survives a reload.
  await page.reload()
  await expect(page.getByTestId('today-total')).toHaveText('15 m')
})

test('discarding is tucked away, asks for confirmation and saves nothing', async ({ page }) => {
  await setUpActivities(page, ['Violin'])
  await begin(page, 'Violin')

  // The destructive action is not on the main screen.
  await expect(page.getByRole('button', { name: /Discard/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Other options' }).click()
  await page.getByRole('button', { name: 'Discard this session…' }).click()
  await page.getByRole('button', { name: 'Keep session' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('In progress')

  await page.getByRole('button', { name: 'Discard this session…' }).click()
  await page.getByRole('button', { name: 'Discard session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Begin Violin' })).toBeVisible()
  await expect(page.getByText('Session discarded.')).toBeVisible()
  await expect(page.getByText('Nothing recorded yet today.')).toBeVisible()
})
