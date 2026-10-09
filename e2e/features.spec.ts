import { expect, test, type Page } from '@playwright/test'

// Saturday 10 January 2026, 12:00 local time. Its week runs Mon 5 – Sun 11 January.
const NOON = new Date(2026, 0, 10, 12, 0, 0)
const MIN = 60_000

async function addCategory(page: Page, name: string) {
  await page.getByLabel('New category name').fill(name)
  await page.getByRole('button', { name: 'Add category' }).click()
  await expect(page.getByLabel('New category name')).toHaveValue('')
}

async function addPastSession(page: Page, category: string, start: string, end: string) {
  await page.getByRole('button', { name: 'Add a past session' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a past session' })
  await dialog.getByLabel('Category').selectOption({ label: category })
  await dialog.getByLabel('Start').fill(start)
  await dialog.getByLabel('End').fill(end)
  await dialog.getByRole('button', { name: /^Save/ }).click()
  await expect(dialog).toBeHidden()
}

async function runTimer(page: Page, category: string, minutes: number) {
  await page.getByLabel('Category', { exact: true }).selectOption({ label: category })
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('Running')
  await page.clock.fastForward(minutes * MIN)
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOON })
  await page.goto('/')
  await addCategory(page, 'Mathematics')
  await addCategory(page, 'Violin')
})

test('a session can be finished with no reflection, or with any single field', async ({ page }) => {
  const timer = page.getByRole('region', { name: 'Current session' })
  const today = page.getByRole('region', { name: 'Today' })

  // Finish and ignore the reflection entirely: nothing to dismiss, nothing recorded.
  await runTimer(page, 'Mathematics', 10)
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('day-total')).toHaveText(/^10m 0\ds$/)
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled()
  await expect(today.getByText(/Concentration|Fatigue/)).toHaveCount(0)

  // Starting the next session needs no interaction with the reflection offer.
  await runTimer(page, 'Violin', 20)
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('day-total')).toHaveText(/^30m 0\ds$/)

  // This time answer just one field; no rating is preselected.
  await timer.getByRole('button', { name: 'Add a reflection (optional)' }).click()
  const fatigue = timer.getByRole('group', { name: /Mental fatigue/ })
  const concentration = timer.getByRole('group', { name: /Concentration/ })
  await expect(fatigue.getByRole('radio', { name: 'Not answered' })).toBeChecked()
  await expect(concentration.getByRole('radio', { name: 'Not answered' })).toBeChecked()
  await expect(timer.getByRole('button', { name: 'Save reflection' })).toBeDisabled()
  await fatigue.getByRole('radio', { name: '4', exact: true }).check()
  await timer.getByRole('button', { name: 'Save reflection' }).click()
  await expect(timer.getByRole('status')).toHaveText('Reflection saved.')
  await expect(today.getByText('Fatigue 4/10')).toBeVisible()
  await expect(today.getByText(/Concentration/)).toHaveCount(0)

  // Later, from Edit: add concentration and notes, and withdraw the fatigue answer.
  await page.getByRole('button', { name: /^Edit Violin/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit session' })
  await expect(dialog.getByRole('group', { name: /Mental fatigue/ }).getByRole('radio', { name: '4', exact: true })).toBeChecked()
  await dialog.getByRole('group', { name: /Concentration/ }).getByRole('radio', { name: '7', exact: true }).check()
  await dialog.getByRole('group', { name: /Mental fatigue/ }).getByRole('radio', { name: 'Not answered' }).check()
  await dialog.getByLabel('Notes').fill('Intonation better after warm-up.')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(today.getByText('Concentration 7/10')).toBeVisible()
  await expect(today.getByText(/Fatigue/)).toHaveCount(0)
  await expect(today.getByText('Intonation better after warm-up.')).toBeVisible()

  // Reflections persist and never alter recorded time.
  await page.reload()
  await expect(today.getByText('Concentration 7/10')).toBeVisible()
  await expect(page.getByTestId('day-total')).toHaveText(/^30m 0\ds$/)
})

test('the running session is shown apart from completed ones and is not in the total', async ({ page }) => {
  await addPastSession(page, 'Violin', '2026-01-10T09:00', '2026-01-10T10:00')
  await expect(page.getByTestId('day-total')).toHaveText('1h 00m 00s')

  await runTimer(page, 'Mathematics', 15)
  const row = page.getByTestId('in-progress-row')
  await expect(row).toContainText('Mathematics')
  await expect(row).toContainText('Running')
  await expect(row).toContainText('in progress, not in the total yet')
  await expect(row).toContainText(/15m 0\ds/)
  await expect(row.getByRole('button', { name: /Edit/ })).toHaveCount(0)
  await expect(page.getByTestId('day-total')).toHaveText('1h 00m 00s')
  await expect(page).toHaveTitle(/▶ Mathematics · Cadence/)

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(row).toContainText('Paused')
  await expect(page).toHaveTitle(/⏸ Mathematics · Cadence/)

  // The week view marks it the same way, under today.
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(page.getByTestId('in-progress-row')).toContainText('Paused')
  await page.getByRole('button', { name: 'Day', exact: true }).click()

  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('in-progress-row')).toHaveCount(0)
  await expect(page.getByTestId('day-total')).toHaveText(/^1h 15m 0\ds$/)
  await expect(page.getByRole('button', { name: /^Edit Mathematics/ })).toBeVisible()
  await expect(page).toHaveTitle('Cadence')
})

test('week view totals, category breakdown and filter', async ({ page }) => {
  await addPastSession(page, 'Mathematics', '2026-01-05T09:00', '2026-01-05T11:00') // Monday
  await addPastSession(page, 'Violin', '2026-01-07T23:30', '2026-01-08T00:30') // Wednesday into Thursday
  await addPastSession(page, 'Violin', '2026-01-10T08:00', '2026-01-10T08:30') // today
  await addPastSession(page, 'Mathematics', '2026-01-04T22:00', '2026-01-05T01:00') // Sunday into this week's Monday

  // The day view is unchanged.
  await expect(page.getByTestId('day-total')).toHaveText('30m 00s')

  await page.getByRole('button', { name: 'Week', exact: true }).click()
  const week = page.getByRole('region', { name: 'This week' })
  // 1h (the part of the Sunday session after midnight) + 2h + 1h + 30m.
  await expect(page.getByTestId('week-total')).toHaveText('4h 30m 00s')
  await expect(page.getByTestId('week-breakdown')).toContainText('Mathematics3h 00m 00s')
  await expect(page.getByTestId('week-breakdown')).toContainText('Violin1h 30m 00s')

  // The midnight-crossing session gives each day its share.
  await expect(week.getByRole('region', { name: /Wednesday/ })).toContainText('30m 00s')
  await expect(week.getByRole('region', { name: /Thursday/ })).toContainText('30m 00s')
  await expect(week.getByRole('region', { name: /Friday/ })).toContainText('No sessions')
  // Sunday the 11th has not happened yet.
  await expect(week.getByRole('region', { name: /Sunday/ })).toHaveCount(0)

  // Filter to one category: totals follow, in both views.
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Violin' })
  await expect(page.getByTestId('week-total')).toHaveText('1h 30m 00s')
  await expect(week.getByRole('region', { name: /Monday/ })).toContainText('No sessions')
  await page.getByRole('button', { name: 'Day', exact: true }).click()
  await expect(page.getByTestId('day-total')).toHaveText('30m 00s')
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Mathematics' })
  await expect(page.getByText('No saved sessions today in Mathematics.')).toBeVisible()

  // Editing from the week view updates its totals straight away.
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'All categories' })
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await week.getByRole('region', { name: /Monday/ }).getByRole('button', { name: /^Edit Mathematics, 09/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit session' })
  await dialog.getByLabel('End').fill('2026-01-05T10:00')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByTestId('week-total')).toHaveText('3h 30m 00s')

  // The previous week holds only the part of the Sunday session before midnight.
  await page.getByRole('button', { name: '← Previous week' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.getByTestId('week-total')).toHaveText('2h 00m 00s')

  // A day heading opens that day.
  await page.getByRole('button', { name: /^Sunday/ }).click()
  await expect(page.getByTestId('day-total')).toHaveText('2h 00m 00s')
  await expect(page.getByText('this day, of 3h 00m 00s')).toBeVisible()
})
