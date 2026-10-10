import { expect, type Locator, type Page } from '@playwright/test'

export const MIN = 60_000

/** Adds an activity from the Settings screen, which must be showing. */
export async function addActivity(page: Page, name: string, inside?: string) {
  await page.getByLabel('New activity name').fill(name)
  await page.getByLabel('Inside').selectOption(inside ? { label: inside } : '')
  await page.getByRole('button', { name: 'Add activity' }).click()
  await expect(page.getByLabel('New activity name')).toHaveValue('')
}

/** Opens Settings, adds the activities, and returns to the section given. */
export async function setUpActivities(page: Page, activities: Array<string | [string, string]>, then = 'track') {
  await page.goto('/#settings')
  for (const a of activities) await (typeof a === 'string' ? addActivity(page, a) : addActivity(page, a[0], a[1]))
  await page.goto(`/#${then}`)
}

/** Fills the "Add a past session" sheet from Explore and returns it, unsaved. */
export async function fillPastSession(page: Page, activity: string, start: string, end: string, title?: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Add a past session' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a past session' })
  await dialog.getByLabel('Activity').selectOption({ label: activity })
  await dialog.getByLabel('Start').fill(start)
  await dialog.getByLabel('End').fill(end)
  if (title) await dialog.getByLabel(/^Title/).fill(title)
  return dialog
}

export async function addPastSession(page: Page, activity: string, start: string, end: string, title?: string) {
  const dialog = await fillPastSession(page, activity, start, end, title)
  await dialog.getByRole('button', { name: /^Save/ }).click()
  await expect(dialog).toBeHidden()
}

/** Starts the timer from a ledger row on Track. `label` is as shown, e.g. "Violin — Music". */
export async function begin(page: Page, label: string) {
  await page.getByRole('button', { name: `Begin ${label}`, exact: true }).click()
  await expect(page.getByTestId('timer-status')).toHaveText('In progress')
}

export const section = (page: Page, name: 'Track' | 'Explore' | 'Settings') =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name })
