import { describe, expect, it } from 'vitest'
import { categoryFilterIds, categoryTotals, daySummaries, filterByCategory, windowActiveMs } from './history'
import { localWeekWindow, toLocalDateValue } from './time'
import type { Category } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const iso = (s: string) => new Date(s).toISOString()

const s = (id: string, categoryId: string, start: string, end: string, pauses: Array<[string, string]> = []) => ({
  id,
  categoryId,
  startedAt: iso(start),
  endedAt: iso(end),
  pausedIntervals: pauses.map(([a, b]) => ({ startedAt: iso(a), endedAt: iso(b) })),
})

const cat = (id: string, parentId: string | null = null, archived = false): Category => ({
  id,
  name: id,
  parentId,
  color: null,
  archivedAt: archived ? '2026-01-02T00:00:00.000Z' : null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('localWeekWindow (Europe/London)', () => {
  it('runs Monday to Monday for any day of the week', () => {
    // 5 January 2026 is a Monday.
    for (const day of [5, 7, 10, 11]) {
      const week = localWeekWindow(new Date(2026, 0, day, 15, 30))
      expect(toLocalDateValue(week.startMs)).toBe('2026-01-05')
      expect(toLocalDateValue(week.endMs)).toBe('2026-01-12')
    }
    expect(toLocalDateValue(localWeekWindow(new Date(2026, 0, 12)).startMs)).toBe('2026-01-12')
  })

  it('spans a year boundary', () => {
    const week = localWeekWindow(new Date(2026, 0, 1))
    expect(toLocalDateValue(week.startMs)).toBe('2025-12-29')
    expect(toLocalDateValue(week.endMs)).toBe('2026-01-05')
  })

  it('is 167 or 169 hours long when the clocks change', () => {
    const spring = localWeekWindow(new Date(2026, 2, 29))
    const autumn = localWeekWindow(new Date(2026, 9, 25))
    const plain = localWeekWindow(new Date(2026, 0, 7))
    expect(spring.endMs - spring.startMs).toBe(167 * HOUR)
    expect(autumn.endMs - autumn.startMs).toBe(169 * HOUR)
    expect(plain.endMs - plain.startMs).toBe(168 * HOUR)
  })
})

describe('daySummaries and windowActiveMs', () => {
  const week = localWeekWindow(new Date(2026, 0, 7))
  const sessions = [
    s('tue', 'maths', '2026-01-06T09:00Z', '2026-01-06T10:00Z', [['2026-01-06T09:10Z', '2026-01-06T09:25Z']]),
    s('late', 'violin', '2026-01-07T23:30Z', '2026-01-08T00:45Z'),
    // Starts on Sunday, ends in the following week.
    s('edge', 'maths', '2026-01-11T23:00Z', '2026-01-12T01:00Z'),
    // Starts in the previous week, ends on Monday.
    s('before', 'violin', '2026-01-04T23:40Z', '2026-01-05T00:20Z'),
  ]
  const days = daySummaries(sessions, week.startMs, 7)

  it('gives each day only its share of a session crossing midnight', () => {
    expect(days.map((d) => d.activeMs)).toEqual([20 * MIN, 45 * MIN, 30 * MIN, 45 * MIN, 0, 0, 60 * MIN])
    expect(days[2]?.entries.map((e) => [e.session.id, e.dayMs])).toEqual([['late', 30 * MIN]])
    expect(days[3]?.entries.map((e) => [e.session.id, e.dayMs])).toEqual([['late', 45 * MIN]])
  })

  it('counts only the part of a session inside the week', () => {
    expect(windowActiveMs(sessions, week.startMs, week.endMs)).toBe(200 * MIN)
  })

  it('has day totals that add up to the week total', () => {
    expect(days.reduce((sum, d) => sum + d.activeMs, 0)).toBe(windowActiveMs(sessions, week.startMs, week.endMs))
  })

  it('adds up across a daylight-saving week too', () => {
    const dst = localWeekWindow(new Date(2026, 2, 29))
    const long = [s('long', 'maths', '2026-03-28T20:00Z', '2026-03-30T08:00Z')]
    const dstDays = daySummaries(long, dst.startMs, 7)
    expect(dstDays.slice(5).map((d) => d.activeMs)).toEqual([4 * HOUR, 23 * HOUR])
    expect(windowActiveMs(long, dst.startMs, dst.endMs)).toBe(27 * HOUR)
  })

  it('lists entries oldest first regardless of input order', () => {
    const sameDay = [
      s('b', 'maths', '2026-01-06T14:00Z', '2026-01-06T15:00Z'),
      s('a', 'maths', '2026-01-06T08:00Z', '2026-01-06T09:00Z'),
    ]
    expect(daySummaries(sameDay, week.startMs, 7)[1]?.entries.map((e) => e.session.id)).toEqual(['a', 'b'])
  })

  it('breaks the week down by category, largest first, excluding paused time', () => {
    expect(categoryTotals(sessions, week.startMs, week.endMs)).toEqual([
      { categoryId: 'maths', activeMs: 105 * MIN },
      { categoryId: 'violin', activeMs: 95 * MIN },
    ])
    expect(categoryTotals([], week.startMs, week.endMs)).toEqual([])
  })
})

describe('category filtering', () => {
  const categories = [cat('academics'), cat('maths', 'academics'), cat('physics', 'academics', true), cat('violin')]
  const items = ['academics', 'maths', 'physics', 'violin'].map((categoryId) => ({ categoryId }))

  it('does not filter when no category is chosen', () => {
    expect(categoryFilterIds(null, categories)).toBeNull()
    expect(filterByCategory(items, null)).toHaveLength(4)
  })

  it('a top-level category includes its sub-categories, archived ones too', () => {
    const ids = categoryFilterIds('academics', categories)
    expect(filterByCategory(items, ids).map((i) => i.categoryId)).toEqual(['academics', 'maths', 'physics'])
  })

  it('a sub-category matches only itself', () => {
    expect(filterByCategory(items, categoryFilterIds('maths', categories)).map((i) => i.categoryId)).toEqual(['maths'])
  })
})
