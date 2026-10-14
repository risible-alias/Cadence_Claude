import { expect, test } from '@playwright/test'
import { addActivity, addPastSession, section } from './helpers'

// Saturday 10 January 2026, 12:00 local time.
const NOON = new Date(2026, 0, 10, 12, 0, 0)

test('move existing groups under a new parent, keeping inks and regrouping history', async ({ page }) => {
  await page.clock.install({ time: NOON })
  await page.goto('/#settings')
  await addActivity(page, 'Science')
  await addActivity(page, 'Physics', 'Science')
  await addActivity(page, 'Music')
  await addActivity(page, 'Violin', 'Music')
  const row = (name: string) => page.getByRole('button', { name: `Edit ${name}`, exact: true })

  // Give Music a chosen ink, so it is not simply the default.
  await row('Music').click()
  let sheet = page.getByRole('dialog', { name: 'Edit Music' })
  await sheet.getByRole('radio', { name: 'Brass' }).check()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()
  await addActivity(page, 'Learning')

  await section(page, 'Explore').click()
  await addPastSession(page, 'Physics — Science', '2026-01-10T09:00', '2026-01-10T10:00')
  await addPastSession(page, 'Violin — Music', '2026-01-10T10:00', '2026-01-10T10:45')
  await addPastSession(page, 'Science', '2026-01-10T11:00', '2026-01-10T11:30')
  await expect(page.getByTestId('day-total')).toHaveText('2 h 15 m')

  // Move Science and Music under Learning.
  await section(page, 'Settings').click()
  for (const name of ['Science', 'Music']) {
    await row(name).click()
    sheet = page.getByRole('dialog', { name: `Edit ${name}` })
    await sheet.getByLabel('Inside').selectOption({ label: 'Learning' })
    await expect(sheet.getByText(/past sessions and everything inside it move with it/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet).toBeHidden()
  }

  // The outline shows the new tree; sub-activities came along.
  const list = page.getByTestId('activity-list').getByRole('listitem')
  await expect(list).toHaveText([/^Learning/, /^Music/, /^Violin/, /^Science/, /^Physics/])
  const indent = async (name: string) => row(name).evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
  expect(await indent('Music')).toBeGreaterThan(await indent('Learning'))
  expect(await indent('Violin')).toBeGreaterThan(await indent('Music'))

  // Colours did not change: each group kept its ink, and what is inside follows it.
  await expect(row('Science')).toContainText('Lapis')
  await expect(row('Music')).toContainText('Brass')
  await expect(row('Physics').locator('.mark')).toHaveClass(/ink-lapis/)
  await expect(row('Violin').locator('.mark')).toHaveClass(/ink-brass/)

  // Only valid places are offered: Learning cannot go inside anything inside it.
  await row('Learning').click()
  sheet = page.getByRole('dialog', { name: 'Edit Learning' })
  await expect(sheet.getByLabel('Inside').locator('option')).toHaveText(['Nothing (on its own)'])
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  // Science can go inside Music, but not inside Physics.
  await row('Science').click()
  sheet = page.getByRole('dialog', { name: 'Edit Science' })
  const options = await sheet.getByLabel('Inside').locator('option').allTextContents()
  expect(options).toContain('Music — Learning')
  expect(options.some((o) => o.startsWith('Physics'))).toBe(false)
  expect(options.some((o) => o.startsWith('Science'))).toBe(false)
  await sheet.getByRole('button', { name: 'Cancel' }).click()

  // History is regrouped retrospectively; no session changed.
  await section(page, 'Explore').click()
  await expect(page.getByTestId('day-total')).toHaveText('2 h 15 m')
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Learning (whole group)' })
  await expect(page.getByTestId('day-total')).toHaveText('2 h 15 m')
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Science — Learning (whole group)' })
  await expect(page.getByTestId('day-total')).toHaveText('1 h 30 m')
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'all activities' })

  // The week chart still has a Lapis part and a Brass part; the tree beneath totals Learning.
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  const groups = page.getByTestId('week-groups').getByRole('listitem')
  await expect(groups).toHaveCount(2)
  await expect(groups.filter({ hasText: 'Science — Learning' })).toContainText('1 h 30 m')
  await expect(groups.filter({ hasText: 'Music — Learning' })).toContainText('45 m')
  const tree = page.getByTestId('week-breakdown').getByRole('listitem')
  await expect(tree.first()).toContainText('Learning')
  await expect(tree.first()).toContainText('2 h 15 m')
  await expect(tree.first()).toHaveAttribute('data-depth', '0')
  await expect(tree.filter({ hasText: 'Physics' })).toHaveAttribute('data-depth', '2')

  // And it can all be moved back out.
  await section(page, 'Settings').click()
  await row('Music').click()
  sheet = page.getByRole('dialog', { name: 'Edit Music' })
  await sheet.getByLabel('Inside').selectOption({ label: 'Nothing (on its own)' })
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()
  await expect(list).toHaveText([/^Learning/, /^Science/, /^Physics/, /^Music/, /^Violin/])
  await expect(row('Music')).toContainText('Brass')
  await section(page, 'Explore').click()
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Learning (whole group)' })
  await expect(page.getByTestId('day-total')).toHaveText('1 h 30 m')
})
