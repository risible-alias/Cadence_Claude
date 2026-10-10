import { describe, expect, it } from 'vitest'
import {
  activeElapsedMs,
  activeOverlapMs,
  formatClock,
  formatDuration,
  formatMinutes,
  formatTimer,
  intervalProblems,
  localDayWindow,
  sessionActiveMs,
} from './time'
import type { ActiveSession } from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const at = (iso: string) => Date.parse(iso)

const running: ActiveSession = {
  id: 's1',
  categoryId: 'c1',
  title: null,
  startedAt: '2026-01-10T09:00:00.000Z',
  pausedIntervals: [],
  state: 'running',
  pauseStartedAt: null,
  updatedAt: '2026-01-10T09:00:00.000Z',
}

describe('activeElapsedMs', () => {
  it('is the time since start when never paused', () => {
    expect(activeElapsedMs(running, at('2026-01-10T09:25:00Z'))).toBe(25 * MIN)
  })

  it('excludes completed pauses', () => {
    const active: ActiveSession = {
      ...running,
      pausedIntervals: [
        { startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:15:00.000Z' },
        { startedAt: '2026-01-10T09:30:00.000Z', endedAt: '2026-01-10T09:40:00.000Z' },
      ],
    }
    expect(activeElapsedMs(active, at('2026-01-10T10:00:00Z'))).toBe(45 * MIN)
  })

  it('stops increasing while a pause is open', () => {
    const paused: ActiveSession = { ...running, state: 'paused', pauseStartedAt: '2026-01-10T09:20:00.000Z' }
    expect(activeElapsedMs(paused, at('2026-01-10T09:20:00Z'))).toBe(20 * MIN)
    expect(activeElapsedMs(paused, at('2026-01-10T13:00:00Z'))).toBe(20 * MIN)
  })

  it('combines completed pauses with an open pause', () => {
    const paused: ActiveSession = {
      ...running,
      pausedIntervals: [{ startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:15:00.000Z' }],
      state: 'paused',
      pauseStartedAt: '2026-01-10T09:30:00.000Z',
    }
    expect(activeElapsedMs(paused, at('2026-01-10T11:00:00Z'))).toBe(25 * MIN)
  })

  it('never goes negative if the clock reads earlier than the start', () => {
    expect(activeElapsedMs(running, at('2026-01-10T08:00:00Z'))).toBe(0)
  })
})

describe('sessionActiveMs', () => {
  it('subtracts pauses from the span', () => {
    expect(
      sessionActiveMs({
        startedAt: '2026-01-10T09:00:00.000Z',
        endedAt: '2026-01-10T10:00:00.000Z',
        pausedIntervals: [{ startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:25:00.000Z' }],
      }),
    ).toBe(45 * MIN)
  })

  it('does not double-count overlapping pauses in a malformed record', () => {
    expect(
      sessionActiveMs({
        startedAt: '2026-01-10T09:00:00.000Z',
        endedAt: '2026-01-10T10:00:00.000Z',
        pausedIntervals: [
          { startedAt: '2026-01-10T09:20:00.000Z', endedAt: '2026-01-10T09:40:00.000Z' },
          { startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:30:00.000Z' },
        ],
      }),
    ).toBe(30 * MIN)
  })
})

describe('intervalProblems', () => {
  const start = '2026-01-10T09:00:00.000Z'
  const end = '2026-01-10T10:00:00.000Z'

  it('accepts ordered pauses inside the session', () => {
    expect(
      intervalProblems(start, end, [
        { startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:20:00.000Z' },
        { startedAt: '2026-01-10T09:20:00.000Z', endedAt: '2026-01-10T09:30:00.000Z' },
      ]),
    ).toEqual([])
  })

  it('reports an end before the start', () => {
    expect(intervalProblems(end, start, [])).toHaveLength(1)
  })

  it('reports overlapping pauses', () => {
    expect(
      intervalProblems(start, end, [
        { startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:30:00.000Z' },
        { startedAt: '2026-01-10T09:20:00.000Z', endedAt: '2026-01-10T09:40:00.000Z' },
      ]),
    ).toEqual(['Pause 2 overlaps or precedes an earlier interval'])
  })

  it('reports pauses outside the session and unparseable instants', () => {
    expect(
      intervalProblems(start, end, [{ startedAt: '2026-01-10T09:50:00.000Z', endedAt: '2026-01-10T10:10:00.000Z' }]),
    ).toEqual(['Pause 1 is outside the session'])
    expect(intervalProblems('nonsense', end, [])).toHaveLength(1)
  })
})

describe('local-day aggregation (Europe/London)', () => {
  it('runs in the timezone the tests assume', () => {
    expect(new Date(2026, 6, 1, 12).toISOString()).toBe('2026-07-01T11:00:00.000Z')
  })

  it('splits a session crossing midnight between the two days', () => {
    // 23:30 to 00:45 local (GMT in January), paused 23:50-00:10.
    const session = {
      startedAt: '2026-01-10T23:30:00.000Z',
      endedAt: '2026-01-11T00:45:00.000Z',
      pausedIntervals: [{ startedAt: '2026-01-10T23:50:00.000Z', endedAt: '2026-01-11T00:10:00.000Z' }],
    }
    const day1 = localDayWindow(new Date(2026, 0, 10, 12))
    const day2 = localDayWindow(new Date(2026, 0, 11, 12))
    expect(activeOverlapMs(session, day1.startMs, day1.endMs)).toBe(20 * MIN)
    expect(activeOverlapMs(session, day2.startMs, day2.endMs)).toBe(35 * MIN)
    expect(sessionActiveMs(session)).toBe(55 * MIN)
  })

  it('contributes nothing to a day it does not touch', () => {
    const session = { startedAt: '2026-01-10T09:00:00.000Z', endedAt: '2026-01-10T10:00:00.000Z', pausedIntervals: [] }
    const nextDay = localDayWindow(new Date(2026, 0, 11))
    expect(activeOverlapMs(session, nextDay.startMs, nextDay.endMs)).toBe(0)
  })

  it('uses local midnight, not UTC midnight, in summer time', () => {
    // 00:30 BST on 1 July is 23:30 UTC on 30 June; it belongs to 1 July locally.
    const session = { startedAt: '2026-06-30T23:30:00.000Z', endedAt: '2026-07-01T00:00:00.000Z', pausedIntervals: [] }
    const july1 = localDayWindow(new Date(2026, 6, 1, 12))
    expect(activeOverlapMs(session, july1.startMs, july1.endMs)).toBe(30 * MIN)
  })

  it('builds 23- and 25-hour days at daylight-saving transitions', () => {
    const spring = localDayWindow(new Date(2026, 2, 29, 12))
    const autumn = localDayWindow(new Date(2026, 9, 25, 12))
    expect(spring.endMs - spring.startMs).toBe(23 * HOUR)
    expect(autumn.endMs - autumn.startMs).toBe(25 * HOUR)

    const allWeekend = { startedAt: '2026-03-28T00:00:00.000Z', endedAt: '2026-03-31T00:00:00.000Z', pausedIntervals: [] }
    expect(activeOverlapMs(allWeekend, spring.startMs, spring.endMs)).toBe(23 * HOUR)
  })
})

describe('formatting', () => {
  it('formats the live clock', () => {
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(3909_999)).toBe('01:05:09')
    expect(formatClock(-5)).toBe('00:00:00')
  })

  it('formats reading durations to the minute, with seconds only under a minute', () => {
    expect(formatMinutes(42_000)).toBe('42 s')
    expect(formatMinutes(15 * MIN)).toBe('15 m')
    expect(formatMinutes(15 * MIN + 59_000)).toBe('15 m')
    expect(formatMinutes(3909_000)).toBe('1 h 05 m')
    expect(formatMinutes(-1)).toBe('0 s')
  })

  it('formats the timer face without leading hours', () => {
    expect(formatTimer(0)).toBe('00:00')
    expect(formatTimer(32 * MIN + 12_000)).toBe('32:12')
    expect(formatTimer(3909_999)).toBe('1:05:09')
  })

  it('formats durations with units', () => {
    expect(formatDuration(42_000)).toBe('42s')
    expect(formatDuration(15 * MIN)).toBe('15m 00s')
    expect(formatDuration(3909_000)).toBe('1h 05m 09s')
  })
})
