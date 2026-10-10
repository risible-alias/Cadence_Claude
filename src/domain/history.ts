import { topLevelId } from './categories'
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

/**
 * Active time per top-level group inside the window, largest first. Groups
 * are identified by category id, so two groups that share an ink stay separate.
 */
export function groupTotals(
  sessions: ReadonlyArray<Spans & { categoryId: string }>,
  startMs: number,
  endMs: number,
  categories: readonly Category[],
): Array<{ groupId: string; activeMs: number }> {
  return categoryTotals(
    sessions.map((s) => ({ ...s, categoryId: topLevelId(s.categoryId, categories) })),
    startMs,
    endMs,
  ).map(({ categoryId, activeMs }) => ({ groupId: categoryId, activeMs }))
}

/**
 * For a stacked chart: each day's active time split by top-level group. Every
 * day lists its segments in the same `groupOrder`, so a group sits at the same
 * place in every bar.
 */
export function stackByDay(
  sessions: ReadonlyArray<Spans & { categoryId: string }>,
  firstDayStartMs: number,
  dayCount: number,
  groupOrder: readonly string[],
  categories: readonly Category[],
): Array<{ dayStartMs: number; totalMs: number; segments: Array<{ groupId: string; activeMs: number }> }> {
  const days = []
  let dayStartMs = firstDayStartMs
  for (let i = 0; i < dayCount; i++) {
    const dayEndMs = shiftLocalDay(dayStartMs, 1)
    const totals = groupTotals(sessions, dayStartMs, dayEndMs, categories)
    const segments = groupOrder.flatMap((groupId) => {
      const found = totals.find((t) => t.groupId === groupId)
      return found ? [found] : []
    })
    days.push({ dayStartMs, totalMs: segments.reduce((sum, s) => sum + s.activeMs, 0), segments })
    dayStartMs = dayEndMs
  }
  return days
}

/** The smallest whole number of hours, at least one, that covers `ms`. Used as a chart's top. */
export function hourCeiling(ms: number): number {
  return Math.max(1, Math.ceil(ms / 3_600_000))
}

/**
 * Category ids in order of most recent use, followed by the never-used ones by
 * name. Archived and unknown categories are left out. `sessions` may be in any
 * order and need only cover recent history.
 */
export function recentCategoryIds(
  sessions: ReadonlyArray<{ categoryId: string; endedAt: string }>,
  categories: readonly Category[],
): string[] {
  const live = categories.filter((c) => c.archivedAt === null)
  const lastUse = new Map<string, string>()
  for (const s of sessions) {
    const previous = lastUse.get(s.categoryId)
    if (previous === undefined || s.endedAt > previous) lastUse.set(s.categoryId, s.endedAt)
  }
  return live
    .slice()
    .sort((a, b) => {
      const ua = lastUse.get(a.id)
      const ub = lastUse.get(b.id)
      if (ua !== undefined && ub !== undefined) return ub.localeCompare(ua)
      if (ua !== undefined) return -1
      if (ub !== undefined) return 1
      return a.name.localeCompare(b.name)
    })
    .map((c) => c.id)
}

export interface TimelineBlock<T> {
  item: T
  /** Offsets from the start of the scale, in minutes. */
  top: number
  height: number
  /** Side-by-side position when blocks would otherwise cover each other. */
  lane: number
  lanes: number
}

/**
 * Lays sessions out on a to-scale day: the hours to draw and where each block
 * sits. Blocks are clipped to the day. One too short to hold a label is given
 * `minMinutes` of height, and anything that would then cover a neighbour
 * (including genuinely overlapping sessions) is moved into a parallel lane.
 */
export function layoutTimeline<T extends { startMs: number; endMs: number }>(
  items: readonly T[],
  dayStartMs: number,
  dayEndMs: number,
  minMinutes: number,
): { firstMs: number; lastMs: number; blocks: Array<TimelineBlock<T>> } {
  const HOUR = 3_600_000
  const clipped = items
    .map((item) => ({ item, s: Math.max(item.startMs, dayStartMs), e: Math.min(item.endMs, dayEndMs) }))
    // Keep anything with time inside the day, plus a zero-length session that falls within it.
    .filter((c) => c.e > c.s || (c.item.startMs === c.item.endMs && c.item.startMs >= dayStartMs && c.item.startMs < dayEndMs))
    .sort((a, b) => a.s - b.s)
  if (clipped.length === 0) return { firstMs: dayStartMs, lastMs: dayStartMs, blocks: [] }

  // Whole hours around the recorded time, measured from the day's start so a
  // clock change inside the day cannot shift the scale.
  const firstMs = dayStartMs + Math.floor((clipped[0]!.s - dayStartMs) / HOUR) * HOUR
  const latest = Math.max(...clipped.map((c) => c.e))
  const lastMs = Math.min(dayEndMs, dayStartMs + Math.ceil((latest - dayStartMs) / HOUR) * HOUR)

  const placed = clipped.map((c) => {
    const top = (c.s - firstMs) / 60_000
    return { item: c.item, top, height: Math.max(minMinutes, (c.e - c.s) / 60_000), lane: 0, lanes: 1 }
  })

  // Greedy lanes within each run of blocks that touch one another.
  let cluster: typeof placed = []
  let clusterEnd = -Infinity
  const finish = () => {
    const lanes = Math.max(0, ...cluster.map((b) => b.lane)) + 1
    for (const b of cluster) b.lanes = lanes
    cluster = []
  }
  for (const block of placed) {
    if (block.top >= clusterEnd) finish()
    const laneEnds: number[] = []
    for (const other of cluster) laneEnds[other.lane] = Math.max(laneEnds[other.lane] ?? -Infinity, other.top + other.height)
    let lane = laneEnds.findIndex((end) => end <= block.top)
    if (lane === -1) lane = laneEnds.length
    block.lane = lane
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.top + block.height)
  }
  finish()
  return { firstMs, lastMs, blocks: placed }
}
