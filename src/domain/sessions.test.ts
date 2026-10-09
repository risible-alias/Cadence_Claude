import { describe, expect, it } from 'vitest'
import {
  activeOverlapBetween,
  applySessionEdit,
  createManualSession,
  draftProblems,
  findActiveOverlaps,
  fitPauses,
  sessionTimes,
  splitByLocalDay,
  type SessionDraft,
} from './sessions'
import { intervalProblems, parseLocalDate, parseLocalInput, shiftLocalDay, toLocalDateValue, toLocalInputValue } from './time'
import type { Category, Session } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.parse('2026-01-12T12:00:00Z')
const iso = (s: string) => new Date(s).toISOString()

const category = (id: string, archived = false): Category => ({
  id,
  name: id,
  parentId: null,
  color: null,
  archivedAt: archived ? '2026-01-02T00:00:00.000Z' : null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})
const categories = [category('maths'), category('violin'), category('old', true)]

const draft = (over: Partial<SessionDraft> = {}): SessionDraft => ({
  categoryId: 'maths',
  title: null,
  startedAt: iso('2026-01-10T09:00:00Z'),
  endedAt: iso('2026-01-10T10:00:00Z'),
  pausedIntervals: [],
  ...over,
})

const span = (id: string, start: string, end: string, pauses: Array<[string, string]> = []) => ({
  id,
  startedAt: iso(start),
  endedAt: iso(end),
  pausedIntervals: pauses.map(([a, b]) => ({ startedAt: iso(a), endedAt: iso(b) })),
})

describe('sessionTimes: elapsed versus active', () => {
  it('are equal when there are no pauses', () => {
    expect(sessionTimes(span('a', '2026-01-10T09:00Z', '2026-01-10T10:00Z'))).toEqual({
      elapsedMs: HOUR,
      pausedMs: 0,
      activeMs: HOUR,
    })
  })

  it('differ by exactly the paused time', () => {
    const s = span('a', '2026-01-10T09:00Z', '2026-01-10T10:00Z', [
      ['2026-01-10T09:10Z', '2026-01-10T09:25Z'],
      ['2026-01-10T09:40Z', '2026-01-10T09:45Z'],
    ])
    expect(sessionTimes(s)).toEqual({ elapsedMs: HOUR, pausedMs: 20 * MIN, activeMs: 40 * MIN })
  })
})

describe('draftProblems', () => {
  const check = (over: Partial<SessionDraft>, keepCategoryId?: string) =>
    draftProblems(draft(over), { categories, nowMs: NOW, keepCategoryId })

  it('accepts a valid past session, including one crossing midnight', () => {
    expect(check({})).toEqual([])
    expect(check({ startedAt: iso('2026-01-10T23:30Z'), endedAt: iso('2026-01-11T00:45Z') })).toEqual([])
  })

  it('rejects an end before or equal to the start', () => {
    expect(check({ endedAt: iso('2026-01-10T08:00Z') })).toEqual(['The end time must be after the start time.'])
    expect(check({ endedAt: iso('2026-01-10T09:00Z') })).toEqual(['The end time must be after the start time.'])
  })

  it('rejects sessions that start or end in the future', () => {
    expect(check({ startedAt: iso('2026-01-12T11:00Z'), endedAt: iso('2026-01-12T13:00Z') })).toEqual([
      'The end time is in the future.',
    ])
    expect(check({ startedAt: iso('2026-01-13T09:00Z'), endedAt: iso('2026-01-13T10:00Z') })).toEqual([
      'The start time is in the future.',
    ])
    expect(check({ startedAt: iso('2026-01-12T11:00Z'), endedAt: iso('2026-01-12T12:00Z') })).toEqual([])
  })

  it('rejects unparseable or implausibly old times', () => {
    expect(check({ startedAt: 'not a time' })).toEqual(['Enter a valid start time.'])
    expect(check({ startedAt: iso('1999-06-01T09:00Z') })).toContain('The start time is too far in the past.')
  })

  it('requires an existing, non-archived category unless the session already uses it', () => {
    expect(check({ categoryId: 'missing' })).toEqual(['Choose a category.'])
    expect(check({ categoryId: 'old' })).toHaveLength(1)
    expect(check({ categoryId: 'old' }, 'old')).toEqual([])
  })
})

describe('fitPauses', () => {
  const pauses = span('a', '2026-01-10T09:00Z', '2026-01-10T10:00Z', [
    ['2026-01-10T09:40Z', '2026-01-10T09:50Z'],
    ['2026-01-10T09:10Z', '2026-01-10T09:20Z'],
  ]).pausedIntervals
  const fit = (start: string, end: string) => fitPauses(pauses, Date.parse(start), Date.parse(end))

  it('keeps pauses inside the span, sorted', () => {
    expect(fit('2026-01-10T09:00Z', '2026-01-10T10:00Z').map((p) => p.startedAt)).toEqual([
      iso('2026-01-10T09:10Z'),
      iso('2026-01-10T09:40Z'),
    ])
  })

  it('trims a pause cut by the new end and drops one left outside', () => {
    expect(fit('2026-01-10T09:15Z', '2026-01-10T09:30Z')).toEqual([
      { startedAt: iso('2026-01-10T09:15Z'), endedAt: iso('2026-01-10T09:20Z') },
    ])
    expect(fit('2026-01-10T09:20Z', '2026-01-10T09:40Z')).toEqual([])
  })

  it('merges overlapping pauses', () => {
    const overlapping = [
      { startedAt: iso('2026-01-10T09:10Z'), endedAt: iso('2026-01-10T09:30Z') },
      { startedAt: iso('2026-01-10T09:20Z'), endedAt: iso('2026-01-10T09:40Z') },
    ]
    expect(fitPauses(overlapping, Date.parse('2026-01-10T09:00Z'), Date.parse('2026-01-10T10:00Z'))).toEqual([
      { startedAt: iso('2026-01-10T09:10Z'), endedAt: iso('2026-01-10T09:40Z') },
    ])
  })
})

describe('createManualSession and applySessionEdit', () => {
  it('creates a session with unanswered reflection fields and a trimmed title', () => {
    const s = createManualSession('id1', draft({ title: '  Scales ' }), NOW)
    expect(s).toMatchObject({ id: 'id1', title: 'Scales', notes: null, concentration: null, fatigue: null })
    expect(sessionTimes(s).activeMs).toBe(HOUR)
    expect(createManualSession('id2', draft({ title: '  ' }), NOW).title).toBeNull()
  })

  const existing: Session = {
    ...createManualSession('s1', draft(), NOW - HOUR),
    pausedIntervals: [{ startedAt: iso('2026-01-10T09:40Z'), endedAt: iso('2026-01-10T09:50Z') }],
    notes: 'felt good',
    concentration: 7,
    fatigue: null,
  }

  it('preserves id, creation time and reflection values, including nulls', () => {
    const edited = applySessionEdit(existing, { ...draft({ categoryId: 'violin' }), pausedIntervals: existing.pausedIntervals }, NOW)
    expect(edited).toMatchObject({
      id: 's1',
      categoryId: 'violin',
      createdAt: existing.createdAt,
      notes: 'felt good',
      concentration: 7,
      fatigue: null,
    })
    expect(edited.updatedAt).toBe(iso('2026-01-12T12:00Z'))
    expect(edited.pausedIntervals).toEqual(existing.pausedIntervals)
  })

  it('keeps the invariants when the end is moved into a pause', () => {
    const edited = applySessionEdit(
      existing,
      { ...draft({ endedAt: iso('2026-01-10T09:45Z') }), pausedIntervals: existing.pausedIntervals },
      NOW,
    )
    expect(intervalProblems(edited.startedAt, edited.endedAt, edited.pausedIntervals)).toEqual([])
    expect(sessionTimes(edited)).toEqual({ elapsedMs: 45 * MIN, pausedMs: 5 * MIN, activeMs: 40 * MIN })
  })

  it('does not mutate the original', () => {
    const snapshot = structuredClone(existing)
    applySessionEdit(existing, draft({ title: 'x' }), NOW)
    expect(existing).toEqual(snapshot)
  })
})

describe('overlap detection', () => {
  const a = span('a', '2026-01-10T09:00Z', '2026-01-10T10:00Z')

  it('measures partial and full overlap', () => {
    expect(activeOverlapBetween(a, span('b', '2026-01-10T09:45Z', '2026-01-10T10:30Z'))).toBe(15 * MIN)
    expect(activeOverlapBetween(a, span('b', '2026-01-10T09:10Z', '2026-01-10T09:20Z'))).toBe(10 * MIN)
    expect(activeOverlapBetween(a, span('b', '2026-01-10T08:00Z', '2026-01-10T11:00Z'))).toBe(HOUR)
  })

  it('treats back-to-back sessions as not overlapping', () => {
    expect(activeOverlapBetween(a, span('b', '2026-01-10T10:00Z', '2026-01-10T11:00Z'))).toBe(0)
    expect(activeOverlapBetween(a, span('b', '2026-01-10T08:00Z', '2026-01-10T09:00Z'))).toBe(0)
  })

  it('ignores time that falls inside the other session’s pause', () => {
    const paused = span('p', '2026-01-10T09:00Z', '2026-01-10T10:00Z', [['2026-01-10T09:20Z', '2026-01-10T09:40Z']])
    expect(activeOverlapBetween(paused, span('b', '2026-01-10T09:20Z', '2026-01-10T09:40Z'))).toBe(0)
    expect(activeOverlapBetween(paused, span('b', '2026-01-10T09:10Z', '2026-01-10T09:50Z'))).toBe(20 * MIN)
  })

  it('detects overlap across midnight', () => {
    const late = span('late', '2026-01-10T23:30Z', '2026-01-11T00:30Z')
    expect(activeOverlapBetween(late, span('b', '2026-01-11T00:00Z', '2026-01-11T01:00Z'))).toBe(30 * MIN)
  })

  it('lists overlapping sessions and skips the session being edited', () => {
    const others = [a, span('b', '2026-01-10T09:30Z', '2026-01-10T09:45Z'), span('c', '2026-01-10T12:00Z', '2026-01-10T13:00Z')]
    const found = findActiveOverlaps({ ...a }, others)
    expect(found.map((o) => [o.session.id, o.overlapMs])).toEqual([['b', 15 * MIN]])
    expect(findActiveOverlaps(span('new', '2026-01-10T14:00Z', '2026-01-10T15:00Z'), others)).toEqual([])
  })
})

describe('splitByLocalDay (Europe/London)', () => {
  it('returns one entry for a same-day session', () => {
    const days = splitByLocalDay(span('a', '2026-01-10T09:00Z', '2026-01-10T10:00Z'))
    expect(days).toEqual([{ dayStartMs: new Date(2026, 0, 10).getTime(), activeMs: HOUR }])
  })

  it('allocates active time to each side of midnight, excluding pauses', () => {
    const s = span('a', '2026-01-10T23:30Z', '2026-01-11T00:45Z', [['2026-01-10T23:50Z', '2026-01-11T00:10Z']])
    expect(splitByLocalDay(s).map((d) => d.activeMs)).toEqual([20 * MIN, 35 * MIN])
  })

  it('does not add an empty day when a session ends exactly at midnight', () => {
    expect(splitByLocalDay(span('a', '2026-01-10T22:00Z', '2026-01-11T00:00Z'))).toHaveLength(1)
  })

  it('sums to the active total across a daylight-saving change', () => {
    const s = span('a', '2026-03-28T20:00Z', '2026-03-30T08:00Z')
    const days = splitByLocalDay(s)
    expect(days.map((d) => d.activeMs)).toEqual([4 * HOUR, 23 * HOUR, 9 * HOUR])
    expect(days.reduce((sum, d) => sum + d.activeMs, 0)).toBe(sessionTimes(s).activeMs)
  })
})

describe('local date and time input helpers (Europe/London)', () => {
  it('round-trips datetime-local values in winter and summer', () => {
    expect(parseLocalInput('2026-01-10T09:05')).toBe(Date.parse('2026-01-10T09:05:00Z'))
    expect(parseLocalInput('2026-07-01T09:05')).toBe(Date.parse('2026-07-01T08:05:00Z'))
    expect(toLocalInputValue(Date.parse('2026-07-01T08:05:42Z'))).toBe('2026-07-01T09:05')
  })

  it('rejects malformed values and impossible dates', () => {
    expect(parseLocalInput('')).toBeNull()
    expect(parseLocalInput('2026-01-10 09:05')).toBeNull()
    expect(parseLocalInput('2026-02-30T09:00')).toBeNull()
    expect(parseLocalDate('2026-13-01')).toBeNull()
  })

  it('rejects a local time skipped by the spring clock change', () => {
    expect(parseLocalInput('2026-03-29T01:30')).toBeNull()
    expect(parseLocalInput('2026-03-29T02:00')).toBe(Date.parse('2026-03-29T01:00:00Z'))
  })

  it('moves between local days across a clock change', () => {
    const mar29 = parseLocalDate('2026-03-29')!
    expect(toLocalDateValue(shiftLocalDay(mar29, 1))).toBe('2026-03-30')
    expect(toLocalDateValue(shiftLocalDay(mar29, -1))).toBe('2026-03-28')
    expect(shiftLocalDay(mar29, 1) - mar29).toBe(23 * HOUR)
  })
})
