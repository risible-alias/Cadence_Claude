import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addPastSession, fillPastSession, section, setUpActivities } from './helpers'

// Saturday 10 January 2026, 12:00 local time.
const NOON = new Date(2026, 0, 10, 12, 0, 0)

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === 'safari-iphone') {
    // On iOS the export goes through the share sheet, which cannot be driven
    // from a test. Capture what would be shared instead.
    await page.addInitScript(() => {
      const w = window as unknown as { __shared?: { name: string; text: string } }
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          const file = data.files![0]!
          w.__shared = { name: file.name, text: await file.text() }
        },
      })
    })
  }
  await page.clock.install({ time: NOON })
  await setUpActivities(page, ['Mathematics', 'Violin'], 'explore')
})

test('manual entry, edit and delete update the daily total immediately', async ({ page }) => {
  const total = page.getByTestId('day-total')

  const dialog = await fillPastSession(page, 'Mathematics', '2026-01-10T09:00', '2026-01-10T10:30', 'Revision')
  await expect(dialog.getByTestId('session-preview')).toContainText('Active 1 h 30 m')
  await dialog.getByRole('button', { name: 'Save session' }).click()
  await expect(dialog).toBeHidden()
  await expect(total).toHaveText('1 h 30 m')
  await expect(page.getByRole('button', { name: /^Edit Mathematics/ })).toContainText('Revision')

  // Correct the end time and the activity.
  await page.getByRole('button', { name: /^Edit Mathematics/ }).click()
  const edit = page.getByRole('dialog', { name: 'Edit session' })
  await edit.getByLabel('End').fill('2026-01-10T10:00')
  await edit.getByLabel('Activity').selectOption({ label: 'Violin' })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(total).toHaveText('1 h 00 m')
  await expect(page.getByRole('button', { name: /^Edit Violin/ })).toBeVisible()

  // Corrections persist across a reload, which also returns to the same section.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible()
  await expect(total).toHaveText('1 h 00 m')

  // Deleting needs a second, explicit confirmation.
  await page.getByRole('button', { name: /^Edit Violin/ }).click()
  await edit.getByRole('button', { name: 'Delete session…' }).click()
  await edit.getByRole('button', { name: 'Keep session' }).click()
  await expect(total).toHaveText('1 h 00 m')
  await edit.getByRole('button', { name: 'Delete session…' }).click()
  await edit.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByText('No saved sessions today')).toBeVisible()
})

test('invalid ranges are blocked and overlaps are flagged', async ({ page }) => {
  const dialog = await fillPastSession(page, 'Mathematics', '2026-01-10T10:00', '2026-01-10T09:00')
  await expect(dialog.getByRole('alert')).toContainText('The end time must be after the start time.')
  await expect(dialog.getByRole('button', { name: 'Save session' })).toBeDisabled()

  // The clock reads 12:00, so 13:00 has not happened yet.
  await dialog.getByLabel('End').fill('2026-01-10T13:00')
  await expect(dialog.getByRole('alert')).toContainText('The end time is in the future.')

  await dialog.getByLabel('End').fill('2026-01-10T11:00')
  await dialog.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('1 h 00 m')

  // A second entry sharing 30 minutes is allowed, but only knowingly.
  const second = await fillPastSession(page, 'Violin', '2026-01-10T10:30', '2026-01-10T11:30')
  await expect(second.getByTestId('overlap-warning')).toContainText('30 m in common')
  await second.getByRole('button', { name: 'Save with overlap' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('2 h 00 m')
  await expect(page.getByTestId('day-overlap-note')).toBeVisible()
  // Overlapping sessions sit side by side on the timeline rather than covering each other.
  const a = await page.getByRole('button', { name: /^Edit Mathematics/ }).boundingBox()
  const b = await page.getByRole('button', { name: /^Edit Violin/ }).boundingBox()
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + 1)

  // Back-to-back sessions do not count as overlapping.
  const third = await fillPastSession(page, 'Violin', '2026-01-10T09:00', '2026-01-10T10:00')
  await expect(third.getByTestId('session-preview')).toBeVisible()
  await expect(third.getByTestId('overlap-warning')).toBeHidden()
})

test('a session crossing midnight is split between the two days', async ({ page }) => {
  const dialog = await fillPastSession(page, 'Violin', '2026-01-09T23:30', '2026-01-10T00:45')
  await expect(dialog.getByTestId('session-preview')).toContainText('Crosses midnight')
  await dialog.getByRole('button', { name: 'Save session' }).click()

  await expect(page.getByTestId('day-total')).toHaveText('45 m')
  await expect(page.getByRole('button', { name: /^Edit Violin/ })).toContainText('this day’s part of 1 h 15 m')

  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByTestId('date-text')).toContainText('Friday')
  await expect(page.getByTestId('day-total')).toHaveText('30 m')

  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByTestId('day-total')).toHaveText('45 m')
})

test('the date control stays inside the page and opens any earlier day', async ({ page }) => {
  const stepper = page.locator('.stepper')
  const box = await stepper.boundingBox()
  const width = page.viewportSize()!.width
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByLabel('Day to show').fill('2026-01-07')
  await expect(page.getByTestId('date-text')).toContainText('Wednesday')
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
})

test('an archived activity can be restored', async ({ page }) => {
  await section(page, 'Settings').click()
  await page.getByRole('button', { name: 'Edit Violin' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Violin' })
  await sheet.getByRole('button', { name: 'Archive this activity…' }).click()
  await sheet.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByTestId('activity-list')).not.toContainText('Violin')

  await section(page, 'Track').click()
  await expect(page.getByRole('button', { name: 'Begin Mathematics' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Begin Violin' })).toHaveCount(0)

  await section(page, 'Settings').click()
  await page.getByText('Archived (1)').click()
  await page.getByRole('button', { name: 'Restore Violin' }).click()
  await expect(page.getByText('Archived (1)')).toBeHidden()
  await expect(page.getByTestId('activity-list')).toContainText('Violin')
})

test('export, then restore over different data after confirmation', async ({ page }, testInfo) => {
  const backupSection = page.getByRole('region', { name: 'Keeping your record' })
  await addPastSession(page, 'Mathematics', '2026-01-10T09:00', '2026-01-10T10:00', 'Original')
  await expect(page.getByTestId('day-total')).toHaveText('1 h 00 m')

  await section(page, 'Settings').click()
  let filename: string
  let text: string
  if (testInfo.project.name === 'safari-iphone') {
    await backupSection.getByRole('button', { name: 'Export backup (JSON)' }).click()
    await backupSection.getByRole('button', { name: 'Save or share file' }).click()
    await expect(backupSection.getByRole('status')).toContainText('Exported 1 session and 2 activities')
    const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared)
    filename = shared.name
    text = shared.text
  } else {
    const downloadPromise = page.waitForEvent('download')
    await backupSection.getByRole('button', { name: 'Export backup (JSON)' }).click()
    const download = await downloadPromise
    filename = download.suggestedFilename()
    text = await readFile(await download.path(), 'utf8')
  }
  expect(filename).toBe('cadence-backup-2026-01-10-12-00.json')
  const backup = JSON.parse(text)
  expect(backup).toMatchObject({ format: 'cadence-backup', schemaVersion: 1, activeSession: null })
  expect(backup.sessions).toHaveLength(1)
  expect(backup.sessions[0]).toMatchObject({ title: 'Original', notes: null, concentration: null, fatigue: null })
  // Ink assignments travel with the backup.
  expect(backup.categories.map((c: { color: string }) => c.color).sort()).toEqual(['lapis', 'oxblood'])

  // Change the data after the backup was taken.
  await section(page, 'Explore').click()
  await addPastSession(page, 'Violin', '2026-01-10T10:00', '2026-01-10T11:30')
  await expect(page.getByTestId('day-total')).toHaveText('2 h 30 m')
  await section(page, 'Settings').click()

  // A file that is not a backup is rejected and changes nothing.
  await page.getByLabel('Restore from a backup file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  })
  await expect(backupSection.getByRole('alert')).toContainText('This is not a Cadence backup file.')

  // The real backup needs an explicit confirmation because data exists.
  await page.getByLabel('Restore from a backup file').setInputFiles({
    name: 'cadence-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(page.getByTestId('restore-preview')).toContainText('1 session')
  const replace = backupSection.getByRole('button', { name: 'Replace all data' })
  await expect(replace).toBeDisabled()
  await backupSection.getByLabel('Replace all data on this device with this backup').check()
  await replace.click()

  await expect(backupSection.getByRole('status')).toContainText('Restored 1 session and 2 activities.')
  await section(page, 'Explore').click()
  await expect(page.getByTestId('day-total')).toHaveText('1 h 00 m')
  await page.reload()
  await expect(page.getByTestId('day-total')).toHaveText('1 h 00 m')
})

test('a backup made before inks existed restores, and its activities are given inks', async ({ page }) => {
  // The shape an earlier version of Cadence exported: every colour null.
  const at = (h: number, m = 0) => new Date(2026, 0, 9, h, m).toISOString()
  const stamp = new Date(2026, 0, 1).toISOString()
  const category = (id: string, name: string, parentId: string | null, createdAt: string) => ({
    id, name, parentId, color: null, archivedAt: null, createdAt, updatedAt: createdAt,
  })
  const old = {
    format: 'cadence-backup',
    schemaVersion: 1,
    exportedAt: at(20),
    categories: [
      category('c-music', 'Music', null, new Date(2026, 0, 2).toISOString()),
      category('c-violin', 'Violin', 'c-music', new Date(2026, 0, 3).toISOString()),
      category('c-reading', 'Reading', null, stamp),
    ],
    sessions: [
      {
        id: 's-1', categoryId: 'c-violin', title: 'Scales', startedAt: at(9), endedAt: at(10),
        pausedIntervals: [{ startedAt: at(9, 20), endedAt: at(9, 30) }],
        notes: null, concentration: 7, fatigue: null, createdAt: at(10), updatedAt: at(10),
      },
    ],
    activeSession: null,
  }

  await section(page, 'Settings').click()
  const backupSection = page.getByRole('region', { name: 'Keeping your record' })
  await page.getByLabel('Restore from a backup file').setInputFiles({
    name: 'old-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  })
  await backupSection.getByLabel('Replace all data on this device with this backup').check()
  await backupSection.getByRole('button', { name: 'Replace all data' }).click()
  await expect(backupSection.getByRole('status')).toContainText('Restored 1 session and 3 activities.')

  // Oldest group first: Reading takes the first ink, Music the second, and Violin follows Music.
  await expect(page.getByRole('button', { name: 'Edit Reading' })).toContainText('Lapis')
  await expect(page.getByRole('button', { name: 'Edit Music' })).toContainText('Oxblood')

  // The session, its pause and its rating came through intact.
  await section(page, 'Explore').click()
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('50 m')
  const block = page.getByRole('button', { name: /^Edit Violin — Music/ })
  await expect(block).toHaveAttribute('title', /Scales · 10 m paused · concentration 7/)
  await expect(block).toHaveClass(/ink-oxblood/)
})
