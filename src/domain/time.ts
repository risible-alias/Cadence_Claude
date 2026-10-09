import type { ActiveSession, Interval, IsoInstant, Session } from './types'

export function toMs(instant: IsoInstant): number {
  const ms = Date.parse(instant)
  if (Number.isNaN(ms)) throw new Error(`Invalid instant: ${JSON.stringify(instant)}`)
  return ms
}

export function toIso(ms: number): IsoInstant {
  return new Date(ms).toISOString()
}

/**
 * Checks the session invariants: start <= end, and pauses that are well formed,
 * inside the session, ordered and non-overlapping. Returns a list of problems
 * (empty when valid) so callers can show them rather than crash.
 */
export function intervalProblems(
  startedAt: IsoInstant,
  endedAt: IsoInstant,
  pausedIntervals: readonly Interval[],
): string[] {
  const problems: string[] = []
  let start: number
  let end: number
  try {
    start = toMs(startedAt)
    end = toMs(endedAt)
  } catch (e) {
    return [(e as Error).message]
  }
  if (end < start) problems.push('Session ends before it starts')

  let previousEnd = start
  pausedIntervals.forEach((pause, i) => {
    let pauseStart: number
    let pauseEnd: number
    try {
      pauseStart = toMs(pause.startedAt)
      pauseEnd = toMs(pause.endedAt)
    } catch (e) {
      problems.push(`Pause ${i + 1}: ${(e as Error).message}`)
      return
    }
    if (pauseEnd < pauseStart) problems.push(`Pause ${i + 1} ends before it starts`)
    if (pauseStart < start || pauseEnd > end) problems.push(`Pause ${i + 1} is outside the session`)
    if (pauseStart < previousEnd) problems.push(`Pause ${i + 1} overlaps or precedes an earlier interval`)
    previousEnd = Math.max(previousEnd, pauseEnd)
  })
  return problems
}

/**
 * The non-paused stretches of `[startMs, endMs)` as `[from, to)` pairs.
 * Tolerates unordered or overlapping pauses so a bad record can never yield
 * negative or double-counted time.
 */
export function activeIntervals(
  startMs: number,
  endMs: number,
  pausedIntervals: readonly Interval[],
): Array<[number, number]> {
  const pauses = pausedIntervals
    .map((p): [number, number] => [toMs(p.startedAt), toMs(p.endedAt)])
    .sort((a, b) => a[0] - b[0])

  const result: Array<[number, number]> = []
  let cursor = startMs
  for (const [pauseStart, pauseEnd] of pauses) {
    const from = Math.min(pauseStart, endMs)
    if (from > cursor) result.push([cursor, from])
    cursor = Math.max(cursor, Math.min(pauseEnd, endMs))
  }
  if (endMs > cursor) result.push([cursor, endMs])
  return result
}

function sumIntervals(intervals: ReadonlyArray<[number, number]>): number {
  return intervals.reduce((total, [from, to]) => total + (to - from), 0)
}

/** Active (non-paused) milliseconds of a finished session. */
export function sessionActiveMs(session: Pick<Session, 'startedAt' | 'endedAt' | 'pausedIntervals'>): number {
  return sumIntervals(activeIntervals(toMs(session.startedAt), toMs(session.endedAt), session.pausedIntervals))
}

/**
 * Active milliseconds of the in-progress session at `nowMs`. `nowMs` is the
 * provisional end; completed pauses and any open pause are excluded. Derived
 * purely from timestamps, so it is correct after a reload or a sleeping tab.
 */
export function activeElapsedMs(active: ActiveSession, nowMs: number): number {
  const start = toMs(active.startedAt)
  // While paused, time stopped counting at the moment the pause began.
  const end = active.pauseStartedAt === null ? nowMs : Math.min(nowMs, toMs(active.pauseStartedAt))
  return sumIntervals(activeIntervals(start, Math.max(start, end), active.pausedIntervals))
}

/** Active milliseconds of a session that fall inside `[windowStartMs, windowEndMs)`. */
export function activeOverlapMs(
  session: Pick<Session, 'startedAt' | 'endedAt' | 'pausedIntervals'>,
  windowStartMs: number,
  windowEndMs: number,
): number {
  return activeIntervals(toMs(session.startedAt), toMs(session.endedAt), session.pausedIntervals).reduce(
    (total, [from, to]) => total + Math.max(0, Math.min(to, windowEndMs) - Math.max(from, windowStartMs)),
    0,
  )
}

/**
 * The local calendar day containing `date`, as `[startMs, endMs)`. Built from
 * local calendar fields, so a daylight-saving day is 23 or 25 hours long.
 */
export function localDayWindow(date: Date): { startMs: number; endMs: number } {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  return { startMs: new Date(y, m, d).getTime(), endMs: new Date(y, m, d + 1).getTime() }
}

const pad = (n: number) => String(n).padStart(2, '0')

function splitDuration(ms: number): { h: number; m: number; s: number } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  return { h: Math.floor(totalSeconds / 3600), m: Math.floor((totalSeconds % 3600) / 60), s: totalSeconds % 60 }
}

/** `01:05:09` — for the live timer display. */
export function formatClock(ms: number): string {
  const { h, m, s } = splitDuration(ms)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** `1h 05m 09s`, `15m 00s`, `42s` — always with units. */
export function formatDuration(ms: number): string {
  const { h, m, s } = splitDuration(ms)
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`
  if (m > 0) return `${m}m ${pad(s)}s`
  return `${s}s`
}

/** `YYYY-MM-DD` for the local calendar day containing `ms` (the value format of `<input type="date">`). */
export function toLocalDateValue(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `YYYY-MM-DDTHH:mm` in local time (the value format of `<input type="datetime-local">`). */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms)
  return `${toLocalDateValue(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Parses a `datetime-local` value as local time. Returns `null` for malformed
 * input and for local times that do not exist (the hour skipped when clocks go
 * forward), rather than silently shifting them. A time that occurs twice (when
 * clocks go back) resolves to its first occurrence.
 */
export function parseLocalInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map((part) => Number(part ?? 0)) as [
    number, number, number, number, number, number,
  ]
  const ms = new Date(y, mo - 1, d, h, mi, s).getTime()
  if (Number.isNaN(ms) || toLocalInputValue(ms) !== value.slice(0, 16)) return null
  return ms
}

/** Start of the local day named by a `YYYY-MM-DD` value, or `null` if it is not a real date. */
export function parseLocalDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isNaN(ms) || toLocalDateValue(ms) !== value ? null : ms
}

/** Start of the local day `days` calendar days from the one starting at `dayStartMs`. */
export function shiftLocalDay(dayStartMs: number, days: number): number {
  const d = new Date(dayStartMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime()
}

/**
 * The local week containing `date`, Monday 00:00 to the next Monday 00:00, as
 * `[startMs, endMs)`. Built from calendar fields, so a week with a clock
 * change is 167 or 169 hours long.
 */
export function localWeekWindow(date: Date): { startMs: number; endMs: number } {
  const dayStartMs = localDayWindow(date).startMs
  const daysSinceMonday = (new Date(dayStartMs).getDay() + 6) % 7
  const startMs = shiftLocalDay(dayStartMs, -daysSinceMonday)
  return { startMs, endMs: shiftLocalDay(startMs, 7) }
}
