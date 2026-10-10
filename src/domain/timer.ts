import { toIso, toMs } from './time'
import type { ActiveSession, Interval, Session } from './types'

export type TimerTransitionCode = 'already-paused' | 'not-paused'

export class TimerTransitionError extends Error {
  readonly code: TimerTransitionCode
  constructor(code: TimerTransitionCode, message: string) {
    super(message)
    this.name = 'TimerTransitionError'
    this.code = code
  }
}

/** The latest instant already recorded on the session. */
function lastRecordedMs(active: ActiveSession): number {
  if (active.pauseStartedAt !== null) return toMs(active.pauseStartedAt)
  const lastPause = active.pausedIntervals.at(-1)
  return lastPause ? toMs(lastPause.endedAt) : toMs(active.startedAt)
}

/**
 * Transitions never record an instant earlier than one already stored. If the
 * wall clock moved backwards, the transition is pinned to the last known
 * instant so intervals stay ordered; the user can correct the session later.
 */
function clampNow(active: ActiveSession, nowMs: number): number {
  return Math.max(nowMs, lastRecordedMs(active))
}

export function startSession(input: {
  id: string
  categoryId: string
  title?: string | null
  nowMs: number
}): ActiveSession {
  const title = input.title?.trim() || null
  const now = toIso(input.nowMs)
  return {
    id: input.id,
    categoryId: input.categoryId,
    title,
    startedAt: now,
    pausedIntervals: [],
    state: 'running',
    pauseStartedAt: null,
    updatedAt: now,
  }
}

export function pauseSession(active: ActiveSession, nowMs: number): ActiveSession {
  if (active.state === 'paused') {
    throw new TimerTransitionError('already-paused', 'The session is already paused.')
  }
  const now = toIso(clampNow(active, nowMs))
  return { ...active, state: 'paused', pauseStartedAt: now, updatedAt: now }
}

export function resumeSession(active: ActiveSession, nowMs: number): ActiveSession {
  if (active.state !== 'paused' || active.pauseStartedAt === null) {
    throw new TimerTransitionError('not-paused', 'The session is not paused.')
  }
  const now = toIso(clampNow(active, nowMs))
  const pause: Interval = { startedAt: active.pauseStartedAt, endedAt: now }
  return {
    ...active,
    state: 'running',
    pauseStartedAt: null,
    pausedIntervals: [...active.pausedIntervals, pause],
    updatedAt: now,
  }
}

/** Sets or clears the title of the session in progress. Allowed in either state. */
export function retitleSession(active: ActiveSession, title: string | null, nowMs: number): ActiveSession {
  return { ...active, title: title?.trim() || null, updatedAt: toIso(clampNow(active, nowMs)) }
}

/**
 * Converts the active session into a saved one. Works from either state; an
 * open pause is closed at the finish instant, so it stays excluded from active
 * time. Reflection fields are left unanswered (`null`).
 */
export function finishSession(active: ActiveSession, nowMs: number): Session {
  const now = toIso(clampNow(active, nowMs))
  const pausedIntervals =
    active.pauseStartedAt === null
      ? active.pausedIntervals
      : [...active.pausedIntervals, { startedAt: active.pauseStartedAt, endedAt: now }]
  return {
    id: active.id,
    categoryId: active.categoryId,
    title: active.title,
    startedAt: active.startedAt,
    endedAt: now,
    pausedIntervals,
    notes: null,
    concentration: null,
    fatigue: null,
    createdAt: now,
    updatedAt: now,
  }
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/**
 * Runtime check for a record read back from storage. Returns a description of
 * the first problem, or `null` when the record is a usable `ActiveSession`.
 */
export function activeSessionProblem(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'not an object'
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.categoryId !== 'string') return 'missing id or category'
  if (v.title !== null && typeof v.title !== 'string') return 'invalid title'
  if (!isInstant(v.startedAt) || !isInstant(v.updatedAt)) return 'invalid timestamps'
  if (!Array.isArray(v.pausedIntervals)) return 'invalid pause list'
  for (const p of v.pausedIntervals as unknown[]) {
    if (typeof p !== 'object' || p === null) return 'invalid pause interval'
    const pause = p as Record<string, unknown>
    if (!isInstant(pause.startedAt) || !isInstant(pause.endedAt)) return 'invalid pause interval'
  }
  if (v.state === 'running') return v.pauseStartedAt === null ? null : 'running session has an open pause'
  if (v.state === 'paused') return isInstant(v.pauseStartedAt) ? null : 'paused session has no pause start'
  return 'invalid state'
}
