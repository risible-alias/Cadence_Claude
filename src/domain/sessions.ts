import { activeIntervals, localDayWindow, shiftLocalDay, toIso, toMs } from './time'
import type { Category, Interval, IsoInstant, Session } from './types'

/** The user-editable part of a saved session. */
export interface SessionDraft {
  categoryId: string
  title: string | null
  startedAt: IsoInstant
  endedAt: IsoInstant
  pausedIntervals: Interval[]
}

type Spans = Pick<Session, 'startedAt' | 'endedAt' | 'pausedIntervals'>

export const MAX_TITLE_LENGTH = 120
const EARLIEST_MS = Date.UTC(2000, 0, 1)

/**
 * Elapsed is the whole span from start to end; active is elapsed minus pauses.
 * They are equal for a session with no pauses (such as a manual entry).
 */
export function sessionTimes(session: Spans): { elapsedMs: number; pausedMs: number; activeMs: number } {
  const start = toMs(session.startedAt)
  const end = toMs(session.endedAt)
  const elapsedMs = Math.max(0, end - start)
  const activeMs = activeIntervals(start, Math.max(start, end), session.pausedIntervals).reduce(
    (sum, [from, to]) => sum + (to - from),
    0,
  )
  return { elapsedMs, pausedMs: elapsedMs - activeMs, activeMs }
}

/**
 * Fits pauses to a (possibly edited) session span: sorted, merged where they
 * overlap, trimmed to `[startMs, endMs]`, and dropped when nothing remains.
 * This keeps the stored invariants true after the user moves the start or end.
 */
export function fitPauses(pauses: readonly Interval[], startMs: number, endMs: number): Interval[] {
  const sorted = pauses
    .map((p): [number, number] => [Math.max(toMs(p.startedAt), startMs), Math.min(toMs(p.endedAt), endMs)])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0])

  const merged: Array<[number, number]> = []
  for (const [from, to] of sorted) {
    const last = merged.at(-1)
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  return merged.map(([from, to]) => ({ startedAt: toIso(from), endedAt: toIso(to) }))
}

/**
 * Problems that must block saving a manual entry or an edit. `keepCategoryId`
 * is the session's existing category, which stays selectable even if archived.
 */
export function draftProblems(
  draft: SessionDraft,
  context: { categories: readonly Category[]; nowMs: number; keepCategoryId?: string },
): string[] {
  const problems: string[] = []

  const category = context.categories.find((c) => c.id === draft.categoryId)
  if (!category) problems.push('Choose a category.')
  else if (category.archivedAt !== null && category.id !== context.keepCategoryId) {
    problems.push('That category is archived. Restore it or choose another.')
  }

  if (draft.title !== null && draft.title.length > MAX_TITLE_LENGTH) {
    problems.push(`Keep the title to ${MAX_TITLE_LENGTH} characters or fewer.`)
  }

  const start = Date.parse(draft.startedAt)
  const end = Date.parse(draft.endedAt)
  if (Number.isNaN(start)) problems.push('Enter a valid start time.')
  if (Number.isNaN(end)) problems.push('Enter a valid end time.')
  if (Number.isNaN(start) || Number.isNaN(end)) return problems

  if (end <= start) problems.push('The end time must be after the start time.')
  if (start < EARLIEST_MS) problems.push('The start time is too far in the past.')
  // A saved session is finished, so it cannot end later than now.
  if (start > context.nowMs) problems.push('The start time is in the future.')
  else if (end > context.nowMs) problems.push('The end time is in the future.')
  return problems
}

const cleanTitle = (title: string | null) => title?.trim() || null

/** A retrospective entry: no pauses unless supplied, and no reflection answers. */
export function createManualSession(id: string, draft: SessionDraft, nowMs: number): Session {
  const now = toIso(nowMs)
  const start = toMs(draft.startedAt)
  const end = toMs(draft.endedAt)
  return {
    id,
    categoryId: draft.categoryId,
    title: cleanTitle(draft.title),
    startedAt: toIso(start),
    endedAt: toIso(end),
    pausedIntervals: fitPauses(draft.pausedIntervals, start, end),
    notes: null,
    concentration: null,
    fatigue: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Applies an edit, leaving the id, creation time and reflection fields untouched. */
export function applySessionEdit(session: Session, draft: SessionDraft, nowMs: number): Session {
  const start = toMs(draft.startedAt)
  const end = toMs(draft.endedAt)
  return {
    ...session,
    categoryId: draft.categoryId,
    title: cleanTitle(draft.title),
    startedAt: toIso(start),
    endedAt: toIso(end),
    pausedIntervals: fitPauses(draft.pausedIntervals, start, end),
    updatedAt: toIso(nowMs),
  }
}

const spansToActive = (s: Spans) => activeIntervals(toMs(s.startedAt), toMs(s.endedAt), s.pausedIntervals)

/** Milliseconds during which both sessions were active (not paused) at once. */
export function activeOverlapBetween(a: Spans, b: Spans): number {
  const bIntervals = spansToActive(b)
  let total = 0
  for (const [aFrom, aTo] of spansToActive(a)) {
    for (const [bFrom, bTo] of bIntervals) {
      total += Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom))
    }
  }
  return total
}

/**
 * Other sessions whose active time coincides with the candidate's. Sessions
 * that merely touch (one ends as the next starts) or that fall inside the
 * other's pause do not overlap. The candidate's own id is ignored.
 */
export function findActiveOverlaps<T extends Spans & { id: string }>(
  candidate: Spans & { id?: string },
  others: readonly T[],
): Array<{ session: T; overlapMs: number }> {
  return others
    .filter((other) => other.id !== candidate.id)
    .map((session) => ({ session, overlapMs: activeOverlapBetween(candidate, session) }))
    .filter((o) => o.overlapMs > 0)
}

/** Active time allocated to each local calendar day the session touches. */
export function splitByLocalDay(session: Spans): Array<{ dayStartMs: number; activeMs: number }> {
  const end = toMs(session.endedAt)
  const intervals = spansToActive(session)
  const days: Array<{ dayStartMs: number; activeMs: number }> = []
  let dayStartMs = localDayWindow(new Date(toMs(session.startedAt))).startMs
  // The cap only guards against a pathological record; real sessions span a few days at most.
  for (let i = 0; i < 400 && (dayStartMs < end || days.length === 0); i++) {
    const dayEndMs = shiftLocalDay(dayStartMs, 1)
    const activeMs = intervals.reduce(
      (sum, [from, to]) => sum + Math.max(0, Math.min(to, dayEndMs) - Math.max(from, dayStartMs)),
      0,
    )
    days.push({ dayStartMs, activeMs })
    dayStartMs = dayEndMs
  }
  return days
}
