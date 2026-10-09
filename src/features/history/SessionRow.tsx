import { useNow } from '../../app/hooks'
import { Button } from '../../components/Button'
import { mutedClass } from '../../components/fields'
import { inProgressClass, StatusBadge } from '../../components/StatusBadge'
import { categoryPath } from '../../domain/categories'
import { sessionTimes } from '../../domain/sessions'
import { activeOverlapMs, formatDuration, toMs } from '../../domain/time'
import { finishSession } from '../../domain/timer'
import type { ActiveSession, Category, Session } from '../../domain/types'

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayAndTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

/** Times inside the day being shown are given without the weekday. */
function timeFormatter(dayStartMs: number, dayEndMs: number) {
  return (ms: number) => (ms >= dayStartMs && ms < dayEndMs ? timeOfDay : dayAndTime).format(ms)
}

/** A completed, saved session within one local day. */
export function SessionRow({
  session,
  dayMs,
  dayStartMs,
  dayEndMs,
  overlaps,
  categories,
  onEdit,
}: {
  session: Session
  /** The session's active time that falls inside this day. */
  dayMs: number
  dayStartMs: number
  dayEndMs: number
  overlaps: boolean
  categories: Category[]
  onEdit: () => void
}) {
  const formatTime = timeFormatter(dayStartMs, dayEndMs)
  const times = sessionTimes(session)
  const path = categoryPath(session.categoryId, categories)
  const range = `${formatTime(toMs(session.startedAt))} – ${formatTime(toMs(session.endedAt))}`
  const ratings = [
    session.concentration !== null && `Concentration ${session.concentration}/10`,
    session.fatigue !== null && `Fatigue ${session.fatigue}/10`,
  ].filter(Boolean)

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="break-words text-base font-medium">{path}</p>
        {session.title && <p className={`break-words ${mutedClass}`}>{session.title}</p>}
        <p className={mutedClass}>
          <time dateTime={session.startedAt}>{formatTime(toMs(session.startedAt))}</time>
          {' – '}
          <time dateTime={session.endedAt}>{formatTime(toMs(session.endedAt))}</time>
        </p>
        {times.pausedMs > 0 && (
          <p className={mutedClass}>
            {formatDuration(times.elapsedMs)} elapsed, {formatDuration(times.pausedMs)} paused
          </p>
        )}
        {ratings.length > 0 && <p className={mutedClass}>{ratings.join(' · ')}</p>}
        {session.notes && <p className={`line-clamp-2 break-words italic ${mutedClass}`}>{session.notes}</p>}
        {overlaps && <p className={mutedClass}>Overlaps another session</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="text-base font-medium tabular-nums">
          {formatDuration(dayMs)} <span className="sr-only">active</span>
        </p>
        {dayMs !== times.activeMs && <p className={mutedClass}>this day, of {formatDuration(times.activeMs)}</p>}
        <Button className="px-3 text-sm" aria-label={`Edit ${path}, ${range}`} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </li>
  )
}

/**
 * The timer in progress, shown in the day it is running through. Styled apart
 * from completed rows (accent border, tint, status badge) and not editable or
 * counted in totals until it is finished.
 */
export function InProgressRow({
  active,
  dayStartMs,
  dayEndMs,
  categories,
}: {
  active: ActiveSession
  dayStartMs: number
  dayEndMs: number
  categories: Category[]
}) {
  const now = useNow()
  const formatTime = timeFormatter(dayStartMs, dayEndMs)
  // What the session would be if finished now; gives this day's share so far.
  const dayMs = activeOverlapMs(finishSession(active, now), dayStartMs, dayEndMs)

  return (
    <li
      data-testid="in-progress-row"
      className={`my-2 flex items-start justify-between gap-3 rounded-lg border-l-4 px-3 py-3 ${inProgressClass[active.state]}`}
    >
      <div className="min-w-0">
        <p className="break-words text-base font-medium">{categoryPath(active.categoryId, categories)}</p>
        {active.title && <p className={`break-words ${mutedClass}`}>{active.title}</p>}
        <p className={mutedClass}>
          Started <time dateTime={active.startedAt}>{formatTime(toMs(active.startedAt))}</time> · in progress, not
          in the total yet
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge state={active.state} />
        <p className="text-base font-medium tabular-nums">
          {formatDuration(dayMs)} <span className="sr-only">active so far</span>
        </p>
      </div>
    </li>
  )
}
