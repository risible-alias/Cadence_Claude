import { describe, expect, it } from 'vitest'
import { activeElapsedMs, intervalProblems, sessionActiveMs } from './time'
import {
  activeSessionProblem,
  finishSession,
  pauseSession,
  resumeSession,
  startSession,
  TimerTransitionError,
} from './timer'

const MIN = 60_000
const T0 = Date.parse('2026-01-10T09:00:00Z')
const start = () => startSession({ id: 's1', categoryId: 'c1', nowMs: T0 })

describe('startSession', () => {
  it('creates a running session with no pauses', () => {
    expect(start()).toEqual({
      id: 's1',
      categoryId: 'c1',
      title: null,
      startedAt: '2026-01-10T09:00:00.000Z',
      pausedIntervals: [],
      state: 'running',
      pauseStartedAt: null,
      updatedAt: '2026-01-10T09:00:00.000Z',
    })
  })

  it('trims the title and treats blank as absent', () => {
    expect(startSession({ id: 's', categoryId: 'c', title: '  Problem set 3 ', nowMs: T0 }).title).toBe('Problem set 3')
    expect(startSession({ id: 's', categoryId: 'c', title: '   ', nowMs: T0 }).title).toBeNull()
  })
})

describe('pause and resume', () => {
  it('pause opens a pause without touching completed intervals', () => {
    const paused = pauseSession(start(), T0 + 10 * MIN)
    expect(paused.state).toBe('paused')
    expect(paused.pauseStartedAt).toBe('2026-01-10T09:10:00.000Z')
    expect(paused.pausedIntervals).toEqual([])
  })

  it('resume closes the open pause into a completed interval', () => {
    const resumed = resumeSession(pauseSession(start(), T0 + 10 * MIN), T0 + 15 * MIN)
    expect(resumed.state).toBe('running')
    expect(resumed.pauseStartedAt).toBeNull()
    expect(resumed.pausedIntervals).toEqual([
      { startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:15:00.000Z' },
    ])
    expect(activeElapsedMs(resumed, T0 + 20 * MIN)).toBe(15 * MIN)
  })

  it('rejects a repeated pause and leaves the pause start unchanged', () => {
    const paused = pauseSession(start(), T0 + 10 * MIN)
    expect(() => pauseSession(paused, T0 + 12 * MIN)).toThrow(TimerTransitionError)
    expect(paused.pauseStartedAt).toBe('2026-01-10T09:10:00.000Z')
  })

  it('rejects resume when running, including a repeated resume', () => {
    expect(() => resumeSession(start(), T0 + MIN)).toThrow(TimerTransitionError)
    const resumed = resumeSession(pauseSession(start(), T0 + MIN), T0 + 2 * MIN)
    expect(() => resumeSession(resumed, T0 + 3 * MIN)).toThrow(/not paused/)
  })

  it('does not mutate its input', () => {
    const active = start()
    const snapshot = structuredClone(active)
    resumeSession(pauseSession(active, T0 + MIN), T0 + 2 * MIN)
    expect(active).toEqual(snapshot)
  })

  it('accumulates several pauses in order', () => {
    let s = start()
    s = resumeSession(pauseSession(s, T0 + 5 * MIN), T0 + 6 * MIN)
    s = resumeSession(pauseSession(s, T0 + 20 * MIN), T0 + 30 * MIN)
    expect(s.pausedIntervals).toHaveLength(2)
    expect(activeElapsedMs(s, T0 + 40 * MIN)).toBe(29 * MIN)
  })
})

describe('finishSession', () => {
  it('saves a running session with unanswered reflection fields', () => {
    const session = finishSession(start(), T0 + 25 * MIN)
    expect(session).toMatchObject({
      id: 's1',
      categoryId: 'c1',
      startedAt: '2026-01-10T09:00:00.000Z',
      endedAt: '2026-01-10T09:25:00.000Z',
      pausedIntervals: [],
      notes: null,
      concentration: null,
      fatigue: null,
    })
    expect(sessionActiveMs(session)).toBe(25 * MIN)
  })

  it('closes an open pause at the finish instant so it stays excluded', () => {
    const paused = pauseSession(start(), T0 + 10 * MIN)
    const session = finishSession(paused, T0 + 60 * MIN)
    expect(session.endedAt).toBe('2026-01-10T10:00:00.000Z')
    expect(session.pausedIntervals).toEqual([
      { startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T10:00:00.000Z' },
    ])
    expect(sessionActiveMs(session)).toBe(10 * MIN)
  })

  it('produces a record that satisfies the interval invariants', () => {
    let s = start()
    s = resumeSession(pauseSession(s, T0 + 5 * MIN), T0 + 6 * MIN)
    s = pauseSession(s, T0 + 9 * MIN)
    const session = finishSession(s, T0 + 12 * MIN)
    expect(intervalProblems(session.startedAt, session.endedAt, session.pausedIntervals)).toEqual([])
    expect(sessionActiveMs(session)).toBe(8 * MIN)
  })
})

describe('clock moving backwards', () => {
  it('pins transitions to the last recorded instant instead of inverting intervals', () => {
    const paused = pauseSession(start(), T0 + 10 * MIN)
    const resumed = resumeSession(paused, T0 + 2 * MIN)
    expect(resumed.pausedIntervals[0]).toEqual({
      startedAt: '2026-01-10T09:10:00.000Z',
      endedAt: '2026-01-10T09:10:00.000Z',
    })
    const session = finishSession(resumed, T0 - 60 * MIN)
    expect(intervalProblems(session.startedAt, session.endedAt, session.pausedIntervals)).toEqual([])
    expect(sessionActiveMs(session)).toBe(10 * MIN)
  })
})

describe('activeSessionProblem', () => {
  it('accepts sessions produced by the state machine', () => {
    expect(activeSessionProblem(start())).toBeNull()
    expect(activeSessionProblem(pauseSession(start(), T0 + MIN))).toBeNull()
  })

  it('rejects malformed stored records', () => {
    expect(activeSessionProblem(null)).not.toBeNull()
    expect(activeSessionProblem({ ...start(), state: 'stopped' })).toBe('invalid state')
    expect(activeSessionProblem({ ...start(), state: 'paused' })).toBe('paused session has no pause start')
    expect(activeSessionProblem({ ...start(), startedAt: 'yesterday' })).toBe('invalid timestamps')
    expect(activeSessionProblem({ ...start(), pausedIntervals: [{ startedAt: 'x' }] })).toBe('invalid pause interval')
  })
})
