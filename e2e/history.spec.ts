import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// Saturday 10 January 2026, 12:00 local time.
const NOON = new Date(2026, 0, 10, 12, 0, 0)

async function addCategory(page: Page, name: string) {
  await page.getByLabel('New category name').fill(name)
  await page.getByRole('button', { name: 'Add category' }).click()
  await expect(page.getByLabel('New category name')).toHaveValue('')
}

async function addPastSession(page: Page, category: string, start: string, end: string, title?: string) {
  await page.getByRole('button', { name: 'Add a past session' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a past session' })
  await dialog.getByLabel('Category').selectOption({ label: category })
  await dialog.getByLabel('Start').fill(start)
  await dialog.getByLabel('End').fill(end)
  if (title) await dialog.getByLabel(/^Title/).fill(title)
  return dialog
}

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
  await page.goto('/')
  await addCategory(page, 'Mathematics')
  await addCategory(page, 'Violin')
})

test('manual entry, edit and delete update the daily total immediately', async ({ page }) => {
  const total = page.getByTestId('day-total')

  const dialog = await addPastSession(page, 'Mathematics', '2026-01-10T09:00', '2026-01-10T10:30', 'Revision')
  await expect(dialog.getByTestId('session-preview')).toContainText('Active 1h 30m 00s')
  await dialog.getByRole('button', { name: 'Save session' }).click()
  await expect(dialog).toBeHidden()
  await expect(total).toHaveText('1h 30m 00s')
  await expect(page.getByRole('region', { name: 'Today' }).getByText('Revision')).toBeVisible()

  // Correct the end time and the category.
  await page.getByRole('button', { name: /^Edit Mathematics/ }).click()
  const edit = page.getByRole('dialog', { name: 'Edit session' })
  await edit.getByLabel('End').fill('2026-01-10T10:00')
  await edit.getByLabel('Category').selectOption({ label: 'Violin' })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(total).toHaveText('1h 00m 00s')
  await expect(page.getByRole('button', { name: /^Edit Violin/ })).toBeVisible()

  // Corrections persist across a reload.
  await page.reload()
  await expect(total).toHaveText('1h 00m 00s')

  // Deleting needs a second, explicit confirmation.
  await page.getByRole('button', { name: /^Edit Violin/ }).click()
  await edit.getByRole('button', { name: 'Delete session…' }).click()
  await edit.getByRole('button', { name: 'Keep session' }).click()
  await expect(total).toHaveText('1h 00m 00s')
  await edit.getByRole('button', { name: 'Delete session…' }).click()
  await edit.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page.getByText('No saved sessions today')).toBeVisible()
})

test('invalid ranges are blocked and overlaps are flagged', async ({ page }) => {
  const dialog = await addPastSession(page, 'Mathematics', '2026-01-10T10:00', '2026-01-10T09:00')
  await expect(dialog.getByRole('alert')).toContainText('The end time must be after the start time.')
  await expect(dialog.getByRole('button', { name: 'Save session' })).toBeDisabled()

  // The clock reads 12:00, so 13:00 has not happened yet.
  await dialog.getByLabel('End').fill('2026-01-10T13:00')
  await expect(dialog.getByRole('alert')).toContainText('The end time is in the future.')

  await dialog.getByLabel('End').fill('2026-01-10T11:00')
  await dialog.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('1h 00m 00s')

  // A second entry sharing 30 minutes is allowed, but only knowingly.
  const second = await addPastSession(page, 'Violin', '2026-01-10T10:30', '2026-01-10T11:30')
  await expect(second.getByTestId('overlap-warning')).toContainText('30m 00s in common')
  await second.getByRole('button', { name: 'Save with overlap' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('2h 00m 00s')
  await expect(page.getByTestId('day-overlap-note')).toBeVisible()

  // Back-to-back sessions do not count as overlapping.
  const third = await addPastSession(page, 'Violin', '2026-01-10T09:00', '2026-01-10T10:00')
  await expect(third.getByTestId('session-preview')).toBeVisible()
  await expect(third.getByTestId('overlap-warning')).toBeHidden()
})

test('a session crossing midnight is split between the two days', async ({ page }) => {
  const dialog = await addPastSession(page, 'Violin', '2026-01-09T23:30', '2026-01-10T00:45')
  await expect(dialog.getByTestId('session-preview')).toContainText('Crosses midnight')
  await dialog.getByRole('button', { name: 'Save session' }).click()

  await expect(page.getByTestId('day-total')).toHaveText('45m 00s')
  await expect(page.getByText('this day, of 1h 15m 00s')).toBeVisible()

  await page.getByRole('button', { name: '← Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.getByTestId('day-total')).toHaveText('30m 00s')

  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByTestId('day-total')).toHaveText('45m 00s')
})

test('an archived category can be restored', async ({ page }) => {
  await page.getByRole('button', { name: 'Archive Violin' }).click()
  await page.getByRole('group', { name: 'Archive Violin' }).getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByLabel('Category', { exact: true })).not.toContainText('Violin')

  await page.getByText('Archived (1)').click()
  await page.getByRole('button', { name: 'Restore Violin' }).click()
  await expect(page.getByText('Archived (1)')).toBeHidden()
  await expect(page.getByLabel('Category', { exact: true })).toContainText('Violin')
})

test('export, then restore over different data after confirmation', async ({ page }, testInfo) => {
  const backupSection = page.getByRole('region', { name: 'Backup' })
  const saved = await addPastSession(page, 'Mathematics', '2026-01-10T09:00', '2026-01-10T10:00', 'Original')
  await saved.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('1h 00m 00s')

  let filename: string
  let text: string
  if (testInfo.project.name === 'safari-iphone') {
    await backupSection.getByRole('button', { name: 'Export backup (JSON)' }).click()
    await backupSection.getByRole('button', { name: 'Save or share file' }).click()
    await expect(backupSection.getByRole('status')).toContainText('Exported 1 session and 2 categories')
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

  // Change the data after the backup was taken.
  const extra = await addPastSession(page, 'Violin', '2026-01-10T10:00', '2026-01-10T11:30')
  await extra.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('2h 30m 00s')

  // A file that is not a backup is rejected and changes nothing.
  await page.getByLabel('Restore from a backup file').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  })
  await expect(backupSection.getByRole('alert')).toContainText('This is not a Cadence backup file.')
  await expect(page.getByTestId('day-total')).toHaveText('2h 30m 00s')

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

  await expect(backupSection.getByRole('status')).toContainText('Restored 1 session and 2 categories.')
  await expect(page.getByTestId('day-total')).toHaveText('1h 00m 00s')
  await page.reload()
  await expect(page.getByTestId('day-total')).toHaveText('1h 00m 00s')
})
