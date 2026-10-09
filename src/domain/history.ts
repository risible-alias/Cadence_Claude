import { activeOverlapMs, shiftLocalDay, toMs } from './time'
import type { Category, Session } from './types'

type Spans = Pick<Session, 'startedAt' | 'endedAt' | 'pausedIntervals'>

/**
 * The category ids matched by a filter: the chosen category plus, for a
 * top-level category, its sub-categories (archived ones included, so history
 * is never hidden). `null` means no filter.
 */
export function categoryFilterIds(filterId: string | null, categories: readonly Category[]): Set<string> | null {
  if (filterId === null) return null
  return new Set([filterId, ...categories.filter((c) => c.parentId === filterId).map((c) => c.id)])
}

export function filterByCategory<T extends { categoryId: string }>(items: readonly T[], ids: Set<string> | null): T[] {
  return ids === null ? [...items] : items.filter((item) => ids.has(item.categoryId))
}

/** Active time of all sessions that falls inside `[startMs, endMs)`. */
export function windowActiveMs(sessions: readonly Spans[], startMs: number, endMs: number): number {
  return sessions.reduce((sum, s) => sum + activeOverlapMs(s, startMs, endMs), 0)
}

const touches = (s: Spans, startMs: number, endMs: number) => toMs(s.startedAt) < endMs && toMs(s.endedAt) > startMs

export interface DaySummary<T> {
  dayStartMs: number
  dayEndMs: number
  activeMs: number
  /** Sessions touching the day, oldest first, each with its share of this day. */
  entries: Array<{ session: T; dayMs: number }>
}

/**
 * One summary per local day from `firstDayStartMs`. A session crossing
 * midnight appears under both days with only that day's share, so the day
 * totals add up to the total for the whole range.
 */
export function daySummaries<T extends Spans>(
  sessions: readonly T[],
  firstDayStartMs: number,
  dayCount: number,
): DaySummary<T>[] {
  const ordered = [...sessions].sort((a, b) => toMs(a.startedAt) - toMs(b.startedAt))
  const days: DaySummary<T>[] = []
  let dayStartMs = firstDayStartMs
  for (let i = 0; i < dayCount; i++) {
    const dayEndMs = shiftLocalDay(dayStartMs, 1)
    const entries = ordered
      .filter((s) => touches(s, dayStartMs, dayEndMs))
      .map((session) => ({ session, dayMs: activeOverlapMs(session, dayStartMs, dayEndMs) }))
    days.push({ dayStartMs, dayEndMs, activeMs: entries.reduce((sum, e) => sum + e.dayMs, 0), entries })
    dayStartMs = dayEndMs
  }
  return days
}

/** Active time per category inside the window, largest first; categories with none are omitted. */
export function categoryTotals(
  sessions: ReadonlyArray<Spans & { categoryId: string }>,
  startMs: number,
  endMs: number,
): Array<{ categoryId: string; activeMs: number }> {
  const totals = new Map<string, number>()
  for (const s of sessions) {
    const ms = activeOverlapMs(s, startMs, endMs)
    if (ms > 0) totals.set(s.categoryId, (totals.get(s.categoryId) ?? 0) + ms)
  }
  return [...totals].map(([categoryId, activeMs]) => ({ categoryId, activeMs })).sort((a, b) => b.activeMs - a.activeMs)
}
