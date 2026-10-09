import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTodayStartMs } from '../../app/hooks'
import { Button } from '../../components/Button'
import { cardClass, inputClass, labelClass, mutedClass, selectClass } from '../../components/fields'
import { db } from '../../db/db'
import { sessionsOverlapping } from '../../db/repo'
import { categoryPath, categoryTree } from '../../domain/categories'
import { categoryFilterIds, categoryTotals, daySummaries, filterByCategory, windowActiveMs } from '../../domain/history'
import { findActiveOverlaps } from '../../domain/sessions'
import {
  formatDuration,
  localWeekWindow,
  parseLocalDate,
  shiftLocalDay,
  toLocalDateValue,
  toMs,
} from '../../domain/time'
import type { ActiveSession, Category, Session } from '../../domain/types'
import { SessionDialog, type SessionDialogMode } from './SessionDialog'
import { InProgressRow, SessionRow } from './SessionRow'

const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' })

const MIN = 60_000
type View = 'day' | 'week'

export function HistoryPanel({ categories, active }: { categories: Category[]; active: ActiveSession | null }) {
  const todayStartMs = useTodayStartMs()
  const [view, setView] = useState<View>('day')
  // `null` follows today, so the view rolls over at midnight unless a past day was chosen.
  const [chosenDayMs, setChosenDayMs] = useState<number | null>(null)
  const [filterValue, setFilterValue] = useState('')
  const [dialog, setDialog] = useState<SessionDialogMode | null>(null)

  const dayStartMs = chosenDayMs ?? todayStartMs
  const { startMs, endMs } =
    view === 'day'
      ? { startMs: dayStartMs, endMs: shiftLocalDay(dayStartMs, 1) }
      : localWeekWindow(new Date(dayStartMs))
  const isCurrent = todayStartMs >= startMs && todayStartMs < endMs
  const goTo = (dayMs: number) => setChosenDayMs(dayMs >= todayStartMs ? null : dayMs)
  const step = view === 'day' ? 1 : 7
  const unit = view === 'day' ? 'day' : 'week'

  // A filter pointing at a category that no longer exists (after a restore) is ignored.
  const filterId = categories.some((c) => c.id === filterValue) ? filterValue : null
  const filterIds = categoryFilterIds(filterId, categories)
  const tree = categoryTree(categories)
  const archived = categories.filter((c) => c.archivedAt !== null)

  const allSessions = useLiveQuery(() => sessionsOverlapping(db, startMs, endMs), [startMs, endMs])
  const sessions = filterByCategory(allSessions ?? [], filterIds)
  const overlapping = new Set(
    sessions.filter((s) => findActiveOverlaps(s, sessions).length > 0).map((s) => s.id),
  )
  const totalMs = windowActiveMs(sessions, startMs, endMs)

  // The timer in progress belongs in any shown day it has been running through.
  const shownActive = active && (filterIds === null || filterIds.has(active.categoryId)) ? active : null
  const activeTouches = (from: number, to: number) =>
    shownActive !== null && toMs(shownActive.startedAt) < to && Date.now() >= from

  const addSession = () => {
    // Today: the hour up to now. Another day: a morning hour to adjust.
    const day = view === 'day' ? dayStartMs : isCurrent ? todayStartMs : startMs
    const end = day === todayStartMs ? Math.floor(Date.now() / MIN) * MIN : new Date(day).setHours(10)
    setDialog({ kind: 'new', startMs: end - 60 * MIN, endMs: end })
  }

  const heading = isCurrent ? (view === 'day' ? 'Today' : 'This week') : 'History'
  const rangeText =
    view === 'day' ? fullDate.format(startMs) : `${shortDate.format(startMs)} – ${shortDate.format(endMs - 1)}`
  const filterNote = filterId ? ` in ${categoryPath(filterId, categories)}` : ''
  const count = `${sessions.length} saved ${sessions.length === 1 ? 'session' : 'sessions'}`

  const row = (session: Session, dayMs: number, from: number, to: number) => (
    <SessionRow
      key={session.id}
      session={session}
      dayMs={dayMs}
      dayStartMs={from}
      dayEndMs={to}
      overlaps={overlapping.has(session.id)}
      categories={categories}
      onEdit={() => setDialog({ kind: 'edit', session })}
    />
  )
  const inProgress = (from: number, to: number) =>
    shownActive && activeTouches(from, to) ? (
      <InProgressRow active={shownActive} dayStartMs={from} dayEndMs={to} categories={categories} />
    ) : null

  return (
    <section className={cardClass} aria-labelledby="history-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id="history-heading" className="text-lg font-semibold">
          {heading}
        </h2>
        <p className={mutedClass}>{rangeText}</p>
      </div>

      <div role="group" aria-label="View" className="mb-2 grid grid-cols-2 gap-2">
        {(['day', 'week'] as const).map((v) => (
          <Button
            key={v}
            variant={view === v ? 'primary' : 'secondary'}
            aria-pressed={view === v}
            className="text-sm"
            onClick={() => setView(v)}
          >
            {v === 'day' ? 'Day' : 'Week'}
          </Button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
        <Button className="order-1 px-3 text-sm" onClick={() => goTo(shiftLocalDay(dayStartMs, -step))}>
          ← Previous {unit}
        </Button>
        <input
          type="date"
          aria-label={view === 'day' ? 'Day to show' : 'Show the week containing'}
          className={`${inputClass} order-3 col-span-2 sm:order-2 sm:col-span-1`}
          value={toLocalDateValue(dayStartMs)}
          max={toLocalDateValue(todayStartMs)}
          onChange={(e) => {
            const day = parseLocalDate(e.target.value)
            if (day !== null) goTo(day)
          }}
        />
        <Button
          className="order-2 px-3 text-sm sm:order-3"
          disabled={isCurrent}
          onClick={() => goTo(shiftLocalDay(dayStartMs, step))}
        >
          Next {unit} →
        </Button>
        {!isCurrent && (
          <Button className="order-4 col-span-2 px-3 text-sm sm:col-span-1" onClick={() => setChosenDayMs(null)}>
            {view === 'day' ? 'Today' : 'This week'}
          </Button>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="history-filter" className={labelClass}>
          Show
        </label>
        <select
          id="history-filter"
          className={selectClass}
          value={filterId ?? ''}
          onChange={(e) => setFilterValue(e.target.value)}
        >
          <option value="">All categories</option>
          {tree.flatMap(({ category, children }) => [
            <option key={category.id} value={category.id}>
              {category.name}
              {children.length > 0 ? ' (with sub-categories)' : ''}
            </option>,
            ...children.map((child) => (
              <option key={child.id} value={child.id}>
                {category.name} → {child.name}
              </option>
            )),
          ])}
          {archived.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryPath(c.id, categories)} (archived)
            </option>
          ))}
        </select>
      </div>

      {allSessions === undefined ? (
        <p className={mutedClass}>Loading…</p>
      ) : (
        <>
          {sessions.length === 0 ? (
            <p className={mutedClass}>
              {view === 'week'
                ? `No saved sessions this week${filterNote}.`
                : isCurrent
                  ? `No saved sessions today${filterNote}.${filterId ? '' : ' Finished sessions appear here.'}`
                  : `No saved sessions on this day${filterNote}.`}
            </p>
          ) : (
            <p className="text-base">
              Total active time{filterNote}:{' '}
              <strong className="font-semibold tabular-nums" data-testid={`${view}-total`}>
                {formatDuration(totalMs)}
              </strong>{' '}
              <span className={mutedClass}>across {count}</span>
            </p>
          )}
          {overlapping.size > 0 && (
            <p className={`mt-1 ${mutedClass}`} data-testid="day-overlap-note">
              Some sessions overlap, so the total counts that time more than once.
            </p>
          )}

          {view === 'day' ? (
            <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {daySummaries(sessions, startMs, 1)[0]?.entries.map((e) => row(e.session, e.dayMs, startMs, endMs))}
              {inProgress(startMs, endMs)}
            </ul>
          ) : (
            <WeekBody
              sessions={sessions}
              startMs={startMs}
              endMs={endMs}
              todayStartMs={todayStartMs}
              categories={categories}
              showBreakdown={filterId === null || filterIds!.size > 1}
              renderRow={row}
              renderInProgress={inProgress}
              onOpenDay={(day) => {
                setView('day')
                goTo(day)
              }}
            />
          )}
        </>
      )}

      <Button className="mt-4 w-full" onClick={addSession}>
        Add a past session
      </Button>

      {dialog && (
        <SessionDialog
          key={dialog.kind === 'edit' ? dialog.session.id : 'new'}
          mode={dialog}
          categories={categories}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}

function WeekBody({
  sessions,
  startMs,
  endMs,
  todayStartMs,
  categories,
  showBreakdown,
  renderRow,
  renderInProgress,
  onOpenDay,
}: {
  sessions: Session[]
  startMs: number
  endMs: number
  todayStartMs: number
  categories: Category[]
  showBreakdown: boolean
  renderRow: (session: Session, dayMs: number, from: number, to: number) => React.ReactNode
  renderInProgress: (from: number, to: number) => React.ReactNode
  onOpenDay: (dayStartMs: number) => void
}) {
  const breakdown = categoryTotals(sessions, startMs, endMs)
  // Days after today have nothing to show yet.
  const days = daySummaries(sessions, startMs, 7).filter((d) => d.dayStartMs <= todayStartMs)

  return (
    <>
      {showBreakdown && breakdown.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">By category</h3>
          <ul data-testid="week-breakdown">
            {breakdown.map(({ categoryId, activeMs }) => (
              <li key={categoryId} className="flex justify-between gap-3 py-1 text-base">
                <span className="min-w-0 break-words">{categoryPath(categoryId, categories)}</span>
                <span className="shrink-0 tabular-nums">{formatDuration(activeMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid gap-3">
        {days.map((day) => {
          const inProgress = renderInProgress(day.dayStartMs, day.dayEndMs)
          return (
            <section
              key={day.dayStartMs}
              aria-label={weekday.format(day.dayStartMs)}
              className="border-t border-slate-200 pt-2 dark:border-slate-800"
            >
              <div className="flex items-center justify-between gap-3">
                <Button className="px-3 text-sm" onClick={() => onOpenDay(day.dayStartMs)}>
                  {weekday.format(day.dayStartMs)}
                  {day.dayStartMs === todayStartMs ? ' (today)' : ''}
                </Button>
                <p className="text-base font-medium tabular-nums">
                  {day.entries.length > 0 ? formatDuration(day.activeMs) : <span className={mutedClass}>No sessions</span>}
                </p>
              </div>
              {(day.entries.length > 0 || inProgress) && (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {day.entries.map((e) => renderRow(e.session, e.dayMs, day.dayStartMs, day.dayEndMs))}
                  {inProgress}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
