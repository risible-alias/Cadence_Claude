import { expect, test } from '@playwright/test'
import { addActivity, addPastSession, begin, MIN, section, setUpActivities } from './helpers'

// Saturday 10 January 2026, 12:00 local time. Its week runs Mon 5 – Sun 11 January.
const NOON = new Date(2026, 0, 10, 12, 0, 0)

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOON })
})

test('a session can be finished with no reflection, or with any single field', async ({ page }) => {
  await setUpActivities(page, ['Mathematics', 'Violin'])
  const start = page.getByRole('region', { name: 'Start a session' })

  // Finish and ignore the reflection entirely: nothing to dismiss, nothing recorded.
  await begin(page, 'Mathematics')
  await page.clock.fastForward(10 * MIN)
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('today-total')).toHaveText('10 m')

  // Starting the next session needs no interaction with the reflection offer.
  await begin(page, 'Violin')
  await page.clock.fastForward(20 * MIN)
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('today-total')).toHaveText('30 m')

  // This time answer just one field; no rating is preselected.
  await start.getByRole('button', { name: 'Add a reflection (optional)' }).click()
  const fatigue = start.getByRole('group', { name: /Mental fatigue/ })
  const concentration = start.getByRole('group', { name: /Concentration/ })
  await expect(fatigue.getByRole('radio', { name: 'Not answered' })).toBeChecked()
  await expect(concentration.getByRole('radio', { name: 'Not answered' })).toBeChecked()
  await expect(start.getByRole('button', { name: 'Save reflection' })).toBeDisabled()
  await fatigue.getByRole('radio', { name: '4', exact: true }).check()
  await start.getByRole('button', { name: 'Save reflection' }).click()
  await expect(start.getByRole('status')).toHaveText('Reflection saved.')

  // In Explore the first session shows no ratings; the second shows only the one given.
  await section(page, 'Explore').click()
  const maths = page.getByRole('button', { name: /^Edit Mathematics/ })
  const violin = page.getByRole('button', { name: /^Edit Violin/ })
  await expect(maths).not.toHaveAttribute('title', /concentration|fatigue/)
  await expect(violin).toHaveAttribute('title', /fatigue 4/)
  await expect(violin).not.toHaveAttribute('title', /concentration/)

  // Later, from the edit sheet: add concentration and notes, and withdraw the fatigue answer.
  await violin.click()
  const dialog = page.getByRole('dialog', { name: 'Edit session' })
  await expect(dialog.getByRole('group', { name: /Mental fatigue/ }).getByRole('radio', { name: '4', exact: true })).toBeChecked()
  await dialog.getByRole('group', { name: /Concentration/ }).getByRole('radio', { name: '7', exact: true }).check()
  await dialog.getByRole('group', { name: /Mental fatigue/ }).getByRole('radio', { name: 'Not answered' }).check()
  await dialog.getByLabel('Notes').fill('Intonation better after warm-up.')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(violin).toHaveAttribute('title', /concentration 7 · Intonation better after warm-up\./)
  await expect(violin).not.toHaveAttribute('title', /fatigue/)

  // Reflections persist and never alter recorded time.
  await page.reload()
  await expect(violin).toHaveAttribute('title', /concentration 7/)
  await expect(page.getByTestId('day-total')).toHaveText('30 m')
})

test('the running session is shown apart from completed ones and is not in the total', async ({ page }) => {
  await setUpActivities(page, ['Mathematics', 'Violin'], 'explore')
  await addPastSession(page, 'Violin', '2026-01-10T09:00', '2026-01-10T10:00')
  await section(page, 'Track').click()
  await expect(page.getByTestId('today-total')).toHaveText('1 h 00 m')

  await begin(page, 'Mathematics')
  await page.clock.fastForward(15 * MIN)
  const row = page.getByTestId('today-in-progress')
  await expect(row).toContainText('Mathematics')
  await expect(row).toContainText('in progress, not yet counted')
  await expect(page.getByTestId('today-total')).toHaveText('1 h 00 m')
  await expect(page.getByText('in two sessions').or(page.getByText('in one session, and one under way.'))).toBeVisible()
  await expect(page).toHaveTitle(/▶ Mathematics · Cadence/)

  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(row).toContainText('paused, not yet counted')
  await expect(page).toHaveTitle(/⏸ Mathematics · Cadence/)

  // The timeline marks it the same way: dashed, labelled, and not editable.
  await section(page, 'Explore').click()
  const block = page.getByTestId('in-progress-row')
  await expect(block).toContainText('Mathematics')
  await expect(block).toContainText('paused')
  await expect(block.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Edit Mathematics/ })).toHaveCount(0)
  await expect(page.getByTestId('day-total')).toHaveText('1 h 00 m')

  await section(page, 'Track').click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('today-in-progress')).toHaveCount(0)
  await expect(page.getByTestId('today-total')).toHaveText('1 h 15 m')
  await expect(page).toHaveTitle('Cadence')
})

test('week view totals, breakdown, filter, and editing from a day', async ({ page }) => {
  await setUpActivities(page, ['Mathematics', 'Violin'], 'explore')
  await addPastSession(page, 'Mathematics', '2026-01-05T09:00', '2026-01-05T11:00') // Monday
  await addPastSession(page, 'Violin', '2026-01-07T23:30', '2026-01-08T00:30') // Wednesday into Thursday
  await addPastSession(page, 'Violin', '2026-01-10T08:00', '2026-01-10T08:30') // today
  await addPastSession(page, 'Mathematics', '2026-01-04T22:00', '2026-01-05T01:00') // Sunday into this week's Monday

  // The day view shows only today.
  await expect(page.getByTestId('day-total')).toHaveText('30 m')

  await page.getByRole('button', { name: 'Week', exact: true }).click()
  const days = page.getByTestId('week-days').getByRole('listitem')
  const groups = page.getByTestId('week-groups').getByRole('listitem')
  // 1 h (the part of the Sunday session after midnight) + 2 h + 1 h + 30 m.
  await expect(page.getByTestId('week-total')).toHaveText('4 h 30 m')
  await expect(groups.filter({ hasText: 'Mathematics' })).toContainText('3 h 00 m')
  await expect(groups.filter({ hasText: 'Mathematics' })).toContainText('67%')
  await expect(groups.filter({ hasText: 'Violin' })).toContainText('1 h 30 m')
  await expect(page.getByRole('img', { name: /Active time for each day of the week/ })).toBeVisible()

  // The midnight-crossing session gives each day its share.
  await expect(days.filter({ hasText: 'Wednesday' })).toContainText('30 m · one session')
  await expect(days.filter({ hasText: 'Thursday' })).toContainText('30 m · one session')
  await expect(days.filter({ hasText: 'Friday' })).toContainText('nothing')
  // Sunday the 11th has not happened yet.
  await expect(days.filter({ hasText: 'Sunday' })).toHaveCount(0)

  // Filter to one activity: totals follow, in both views.
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Violin' })
  await expect(page.getByTestId('week-total')).toHaveText('1 h 30 m')
  await expect(days.filter({ hasText: 'Monday' })).toContainText('nothing')
  await page.getByRole('button', { name: 'Day', exact: true }).click()
  await expect(page.getByTestId('day-total')).toHaveText('30 m')
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Mathematics' })
  await expect(page.getByText('No saved sessions today in Mathematics.')).toBeVisible()
  await page.getByLabel('Show', { exact: true }).selectOption({ label: 'all activities' })

  // A day in the week list opens that day, where sessions can be edited.
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await days.filter({ hasText: 'Monday' }).getByRole('button').click()
  await expect(page.getByTestId('date-text')).toContainText('Monday')
  await expect(page.getByTestId('day-total')).toHaveText('3 h 00 m')
  await page.getByRole('button', { name: /^Edit Mathematics, 9/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit session' })
  await dialog.getByLabel('End').fill('2026-01-05T10:00')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByTestId('day-total')).toHaveText('2 h 00 m')
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(page.getByTestId('week-total')).toHaveText('3 h 30 m')

  // The previous week holds only the part of the Sunday session before midnight.
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page.getByTestId('week-total')).toHaveText('2 h 00 m')
  await page.getByRole('button', { name: 'This week' }).click()
  await expect(page.getByTestId('week-total')).toHaveText('3 h 30 m')
})

test('inks: defaults, inheritance, manual choice, and independence from one another', async ({ page }) => {
  await page.goto('/#settings')
  await addActivity(page, 'Music')
  await addActivity(page, 'Violin', 'Music')
  await addActivity(page, 'Reading')
  const row = (name: string) => page.getByRole('button', { name: `Edit ${name}`, exact: true })

  // Each new group takes the next unused ink, named in words beside its mark.
  await expect(row('Music')).toContainText('Lapis')
  await expect(row('Reading')).toContainText('Oxblood')
  await expect(row('Music').locator('.mark')).toHaveClass(/ink-lapis/)
  // A sub-activity follows its group.
  await expect(row('Violin').locator('.mark')).toHaveClass(/ink-lapis/)

  // Change the group's ink: its sub-activity follows, the other group is untouched.
  await row('Music').click()
  let sheet = page.getByRole('dialog', { name: 'Edit Music' })
  await expect(sheet.getByRole('radio', { name: 'Lapis' })).toBeChecked()
  await sheet.getByRole('radio', { name: 'Forest' }).check()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(row('Music')).toContainText('Forest')
  await expect(row('Violin').locator('.mark')).toHaveClass(/ink-forest/)
  await expect(row('Reading')).toContainText('Oxblood')

  // A sub-activity can be given its own ink, and can go back to following its group.
  await row('Violin').click()
  sheet = page.getByRole('dialog', { name: 'Edit Violin' })
  await expect(sheet.getByRole('radio', { name: 'Same as Music (Forest)' })).toBeChecked()
  await sheet.getByRole('radio', { name: 'Brass' }).check()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(row('Violin')).toContainText('Brass')
  await expect(row('Music')).toContainText('Forest')

  // Adding more groups never repaints existing ones, and inks are reused once all are taken.
  for (const name of ['Admin', 'Languages', 'Exercise', 'Writing']) await addActivity(page, name)
  await expect(row('Music')).toContainText('Forest')
  await expect(row('Reading')).toContainText('Oxblood')
  await expect(row('Violin')).toContainText('Brass')
  await expect(page.getByTestId('activity-list').getByRole('listitem')).toHaveCount(7)

  // Assignments persist, and reach the other screens.
  await page.reload()
  await expect(row('Violin')).toContainText('Brass')
  await section(page, 'Track').click()
  await page.getByRole('button', { name: /Other activities/ }).click()
  await expect(page.getByRole('button', { name: 'Begin Violin — Music' })).toHaveClass(/ink-brass/)
  await expect(page.getByRole('button', { name: 'Begin Reading' })).toHaveClass(/ink-oxblood/)

  // Two groups sharing an ink are still reported separately.
  await section(page, 'Settings').click()
  await row('Reading').click()
  sheet = page.getByRole('dialog', { name: 'Edit Reading' })
  await sheet.getByRole('radio', { name: 'Forest' }).check()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await section(page, 'Explore').click()
  await addPastSession(page, 'Music', '2026-01-10T09:00', '2026-01-10T10:00')
  await addPastSession(page, 'Reading', '2026-01-10T10:00', '2026-01-10T10:30')
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  const groups = page.getByTestId('week-groups').getByRole('listitem')
  await expect(groups).toHaveCount(2)
  await expect(groups.filter({ hasText: 'Music' })).toContainText('1 h 00 m')
  await expect(groups.filter({ hasText: 'Reading' })).toContainText('30 m')
})

test('navigation: sections, address, and never covering the last control', async ({ page }) => {
  await setUpActivities(page, ['Mathematics'])
  const nav = page.getByRole('navigation', { name: 'Sections' })
  const wide = page.viewportSize()!.width >= 768

  await expect(section(page, 'Track')).toHaveAttribute('aria-current', 'page')
  await section(page, 'Explore').click()
  await expect(page).toHaveURL(/#explore$/)
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible()
  await expect(section(page, 'Explore')).toHaveAttribute('aria-current', 'page')

  // The section survives a reload, and Back returns to the previous one.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible()
  await page.goBack()
  await expect(section(page, 'Track')).toHaveAttribute('aria-current', 'page')

  for (const name of ['Track', 'Explore', 'Settings'] as const) {
    await section(page, name).click()
    await expect(section(page, name)).toHaveAttribute('aria-current', 'page')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} fits the width`).toBe(true)

    const navBox = async () => (await nav.boundingBox())!
    if (wide) {
      // iPad and desktop: the pane sits at the head of the page, above the heading, and stays
      // in view while the page scrolls beneath it.
      await page.evaluate(() => window.scrollTo(0, 0))
      const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
      expect((await navBox()).y).toBeLessThan(40)
      expect(heading.y).toBeGreaterThanOrEqual((await navBox()).y + (await navBox()).height)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      expect((await navBox()).y).toBeLessThan(40)
    } else {
      // Phone: it floats above the foot. Scrolled to the very end, the last control clears it.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const box = await navBox()
      const lastBox = (await page.locator('main button, main a, main input').last().boundingBox())!
      expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 80)
      expect(lastBox.y + lastBox.height, `${name}: last control is above the navigation`).toBeLessThanOrEqual(box.y)
    }
    // Each target is comfortably tappable.
    const linkBox = (await section(page, name).boundingBox())!
    expect(linkBox.height).toBeGreaterThanOrEqual(44)
  }
})

test('the navigation honours reduced motion and steps aside for a sheet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setUpActivities(page, ['Mathematics'], 'explore')
  const thumb = page.locator('.nav .thumb')
  expect(await thumb.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')

  await page.getByRole('button', { name: 'Add a past session' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeHidden()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
})
