import { describe, expect, it } from 'vitest'
import {
  categoryFilterIds,
  categoryTotals,
  daySummaries,
  filterByCategory,
  inkGroupTotals,
  outlineTotals,
  hourCeiling,
  layoutTimeline,
  recentCategoryIds,
  stackByDay,
  windowActiveMs,
} from './history'
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

describe('grouping by top-level category', () => {
  const week = localWeekWindow(new Date(2026, 0, 7))
  // Two groups deliberately share an ink: they must still be reported apart.
  const categories = [
    { ...cat('academics'), color: 'lapis' },
    cat('maths', 'academics'),
    cat('physics', 'academics'),
    { ...cat('violin'), color: 'lapis' },
  ]
  const sessions = [
    s('a', 'maths', '2026-01-06T09:00Z', '2026-01-06T10:00Z'),
    s('b', 'physics', '2026-01-06T11:00Z', '2026-01-06T11:30Z'),
    s('c', 'violin', '2026-01-06T14:00Z', '2026-01-06T14:45Z'),
    s('d', 'violin', '2026-01-07T23:30Z', '2026-01-08T00:30Z'),
  ]

  it('rolls sub-categories up to their group and keeps same-ink groups separate', () => {
    expect(inkGroupTotals(sessions, week.startMs, week.endMs, categories)).toEqual([
      { groupId: 'violin', activeMs: 105 * MIN },
      { groupId: 'academics', activeMs: 90 * MIN },
    ])
  })

  it('stacks each day in one fixed group order, splitting at midnight', () => {
    const days = stackByDay(sessions, week.startMs, 7, ['academics', 'violin'], categories)
    expect(days[1]).toMatchObject({
      totalMs: 135 * MIN,
      segments: [
        { groupId: 'academics', activeMs: 90 * MIN },
        { groupId: 'violin', activeMs: 45 * MIN },
      ],
    })
    expect(days[2]?.segments).toEqual([{ groupId: 'violin', activeMs: 30 * MIN }])
    expect(days[3]?.segments).toEqual([{ groupId: 'violin', activeMs: 30 * MIN }])
    expect(days[0]).toMatchObject({ totalMs: 0, segments: [] })
    expect(days.reduce((sum, d) => sum + d.totalMs, 0)).toBe(windowActiveMs(sessions, week.startMs, week.endMs))
  })

  it('rounds a chart top up to whole hours, never below one', () => {
    expect(hourCeiling(0)).toBe(1)
    expect(hourCeiling(59 * MIN)).toBe(1)
    expect(hourCeiling(61 * MIN)).toBe(2)
    expect(hourCeiling(4 * HOUR)).toBe(4)
  })
})

describe('recentCategoryIds', () => {
  const categories = [cat('violin'), cat('maths'), cat('admin'), cat('zither'), cat('old', null, true)]
  const used = [
    { categoryId: 'maths', endedAt: '2026-01-06T10:00:00.000Z' },
    { categoryId: 'violin', endedAt: '2026-01-07T10:00:00.000Z' },
    { categoryId: 'maths', endedAt: '2026-01-05T10:00:00.000Z' },
    { categoryId: 'old', endedAt: '2026-01-08T10:00:00.000Z' },
    { categoryId: 'deleted', endedAt: '2026-01-08T11:00:00.000Z' },
  ]

  it('orders by latest use, then unused ones by name, leaving out archived and unknown', () => {
    expect(recentCategoryIds(used, categories)).toEqual(['violin', 'maths', 'admin', 'zither'])
  })

  it('falls back to names when nothing has been recorded', () => {
    expect(recentCategoryIds([], categories)).toEqual(['admin', 'maths', 'violin', 'zither'])
  })
})

describe('layoutTimeline', () => {
  const day = { start: new Date(2026, 0, 10).getTime(), end: new Date(2026, 0, 11).getTime() }
  const at = (h: number, m = 0) => new Date(2026, 0, 10, h, m).getTime()
  const item = (id: string, startMs: number, endMs: number) => ({ id, startMs, endMs })
  const lay = (items: Array<{ id: string; startMs: number; endMs: number }>) => layoutTimeline(items, day.start, day.end, 20)

  it('returns an empty scale for an empty day', () => {
    expect(lay([])).toEqual({ firstMs: day.start, lastMs: day.start, blocks: [] })
  })

  it('draws whole hours around the recorded time and places blocks to scale', () => {
    const { firstMs, lastMs, blocks } = lay([item('a', at(9, 5), at(10, 35)), item('b', at(13, 40), at(14, 50))])
    expect(firstMs).toBe(at(9))
    expect(lastMs).toBe(at(15))
    expect(blocks.map((b) => [b.item.id, b.top, b.height, b.lane, b.lanes])).toEqual([
      ['a', 5, 90, 0, 1],
      ['b', 280, 70, 0, 1],
    ])
  })

  it('clips sessions that cross midnight to the day shown', () => {
    const fromYesterday = item('y', day.start - 40 * MIN, at(0, 25))
    const intoTomorrow = item('t', at(23, 30), day.end + 45 * MIN)
    const { firstMs, lastMs, blocks } = lay([intoTomorrow, fromYesterday])
    expect(firstMs).toBe(day.start)
    expect(lastMs).toBe(day.end)
    expect(blocks.map((b) => [b.item.id, b.top, b.height])).toEqual([
      ['y', 0, 25],
      ['t', 23 * 60 + 30, 30],
    ])
    expect(lay([item('before', day.start - 2 * HOUR, day.start - HOUR)]).blocks).toEqual([])
    expect(lay([item('edge', day.start - HOUR, day.start)]).blocks).toEqual([])
  })

  it('gives very short sessions a readable height', () => {
    expect(lay([item('a', at(9), at(9, 4))]).blocks[0]).toMatchObject({ top: 0, height: 20 })
  })

  it('puts overlapping sessions side by side', () => {
    const { blocks } = lay([item('a', at(9), at(10)), item('b', at(9, 30), at(10, 30)), item('c', at(11), at(12))])
    expect(blocks.map((b) => [b.item.id, b.lane, b.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ])
  })

  it('also separates back-to-back short sessions whose labels would collide', () => {
    const { blocks } = lay([item('a', at(9), at(9, 5)), item('b', at(9, 5), at(9, 10)), item('c', at(9, 25), at(9, 50))])
    expect(blocks.map((b) => [b.item.id, b.lane, b.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      // Starts exactly where the padded block above ends, so it has the row to itself.
      ['c', 0, 1],
    ])
  })

  it('reuses a lane once it is free', () => {
    const { blocks } = lay([item('long', at(9), at(12)), item('x', at(9, 30), at(10)), item('y', at(10, 30), at(11))])
    expect(blocks.map((b) => [b.item.id, b.lane, b.lanes])).toEqual([
      ['long', 0, 2],
      ['x', 1, 2],
      ['y', 1, 2],
    ])
  })
})

describe('reorganising categories applies to history retrospectively', () => {
  const week = localWeekWindow(new Date(2026, 0, 7))
  const ink = (c: Category, color: string | null) => ({ ...c, color })
  // Before: Science (lapis) ─ Physics, and Music (brass) ─ Violin, both at the top.
  const before = [
    ink(cat('science'), 'lapis'),
    cat('physics', 'science'),
    ink(cat('music'), 'brass'),
    cat('violin', 'music'),
    ink(cat('reading'), 'plum'),
  ]
  // After: a new Learning (forest) holds both; nothing else changes.
  const after = [
    ink(cat('learning'), 'forest'),
    ...before.map((c) => (c.id === 'science' || c.id === 'music' ? { ...c, parentId: 'learning' } : c)),
  ]
  const sessions = [
    s('p', 'physics', '2026-01-06T09:00Z', '2026-01-06T10:00Z'),
    s('sci', 'science', '2026-01-06T11:00Z', '2026-01-06T11:30Z'),
    s('v', 'violin', '2026-01-07T23:30Z', '2026-01-08T00:30Z'),
    s('r', 'reading', '2026-01-08T20:00Z', '2026-01-08T20:45Z'),
  ]
  const total = (ids: Set<string> | null) =>
    windowActiveMs(filterByCategory(sessions, ids), week.startMs, week.endMs)

  it('a filter on the new parent includes everything moved under it, at any depth', () => {
    expect(total(categoryFilterIds('learning', before))).toBe(0)
    expect(total(categoryFilterIds('learning', after))).toBe(150 * MIN)
    expect(total(categoryFilterIds('science', after))).toBe(90 * MIN)
    expect(total(null)).toBe(195 * MIN)
  })

  it('outline totals regroup history under the new parent without changing any session', () => {
    expect(outlineTotals(sessions, week.startMs, week.endMs, after).map((r) => [r.categoryId, r.depth, r.ownMs, r.totalMs])).toEqual([
      ['learning', 0, 0, 150 * MIN],
      ['music', 1, 0, 60 * MIN],
      ['violin', 2, 60 * MIN, 60 * MIN],
      ['science', 1, 30 * MIN, 90 * MIN],
      ['physics', 2, 60 * MIN, 60 * MIN],
      ['reading', 0, 45 * MIN, 45 * MIN],
    ])
    expect(sessions.map((x) => x.categoryId)).toEqual(['physics', 'science', 'violin', 'reading'])
  })

  it('stacks by ink owner, so moved groups that keep their inks keep their own segments', () => {
    const order = ['science', 'music', 'reading']
    expect(inkGroupTotals(sessions, week.startMs, week.endMs, after)).toEqual(inkGroupTotals(sessions, week.startMs, week.endMs, before))
    expect(stackByDay(sessions, week.startMs, 7, order, after)).toEqual(stackByDay(sessions, week.startMs, 7, order, before))
  })

  it('merges into the parent’s segment once the moved groups follow its ink', () => {
    const following = after.map((c) => (c.id === 'science' || c.id === 'music' ? { ...c, color: null } : c))
    expect(inkGroupTotals(sessions, week.startMs, week.endMs, following)).toEqual([
      { groupId: 'learning', activeMs: 150 * MIN },
      { groupId: 'reading', activeMs: 45 * MIN },
    ])
  })

  it('includes archived categories so their history stays visible', () => {
    const archivedPhysics = after.map((c) => (c.id === 'physics' ? { ...c, archivedAt: '2026-01-09T00:00:00.000Z' } : c))
    expect(outlineTotals(sessions, week.startMs, week.endMs, archivedPhysics).find((r) => r.categoryId === 'physics')?.totalMs).toBe(60 * MIN)
    expect(total(categoryFilterIds('science', archivedPhysics))).toBe(90 * MIN)
  })
})
