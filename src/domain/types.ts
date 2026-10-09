/** An ISO-8601 instant as produced by `Date.prototype.toISOString()` (UTC, `Z` suffix). */
export type IsoInstant = string

export interface Interval {
  startedAt: IsoInstant
  endedAt: IsoInstant
}

export interface Category {
  id: string
  name: string
  /** `null` for a top-level category. The UI limits nesting to two levels. */
  parentId: string | null
  color: string | null
  archivedAt: IsoInstant | null
  createdAt: IsoInstant
  updatedAt: IsoInstant
}

/** A finished, saved session. Reflection fields stay `null` until the user supplies them. */
export interface Session {
  id: string
  categoryId: string
  title: string | null
  startedAt: IsoInstant
  endedAt: IsoInstant
  pausedIntervals: Interval[]
  notes: string | null
  concentration: number | null
  fatigue: number | null
  createdAt: IsoInstant
  updatedAt: IsoInstant
}

/** The single in-progress session. It becomes a `Session` on finish. */
export interface ActiveSession {
  id: string
  categoryId: string
  title: string | null
  startedAt: IsoInstant
  /** Completed pauses only; an open pause is represented by `pauseStartedAt`. */
  pausedIntervals: Interval[]
  state: 'running' | 'paused'
  pauseStartedAt: IsoInstant | null
  updatedAt: IsoInstant
}
