import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { countOf, datedDay, dayAndMonth, weekdayName } from '../../app/format'
import { useTodayStartMs } from '../../app/hooks'
import { CategoryName, inkClass, Mark } from '../../components/Category'
import { db } from '../../db/db'
import { sessionsOverlapping } from '../../db/repo'
import { categoryLabel, categoryParts, categoryTree } from '../../domain/categories'
import {
  categoryFilterIds,
  categoryTotals,
  daySummaries,
  filterByCategory,
  groupTotals,
  hourCeiling,
  stackByDay,
  windowActiveMs,
} from '../../domain/history'
import { findActiveOverlaps } from '../../domain/sessions'
import { formatMinutes, localWeekWindow, parseLocalDate, shiftLocalDay, toLocalDateValue, toMs } from '../../domain/time'
import type { ActiveSession, Category, Session } from '../../domain/types'
import { DayTimeline } from './DayTimeline'
import { SessionDialog, type SessionDialogMode } from './SessionDialog'
import { WeekChart } from './WeekChart'

const MIN = 60_000
type View = 'day' | 'week'

export function ExploreScreen({ categories, active }: { categories: Category[]; active: ActiveSession | null }) {
  const todayStartMs = useTodayStartMs()
  const [view, setView] = useState<View>('day')
  // `null` follows today, so the view rolls over at midnight unless a past day was chosen.
  const [chosenDayMs, setChosenDayMs] = useState<number | null>(null)
  const [filterValue, setFilterValue] = useState('')
  const [dialog, setDialog] = useState<SessionDialogMode | null>(null)

  const dayStartMs = chosenDayMs ?? todayStartMs
  const { startMs, endMs } =
    view === 'day' ? { startMs: dayStartMs, endMs: shiftLocalDay(dayStartMs, 1) } : localWeekWindow(new Date(dayStartMs))
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
  const overlapping = new Set(sessions.filter((s) => findActiveOverlaps(s, sessions).length > 0).map((s) => s.id))
  const totalMs = windowActiveMs(sessions, startMs, endMs)
  const filterNote = filterId ? ` in ${categoryLabel(filterId, categories)}` : ''

  // The timer in progress belongs in the day it is running through.
  const shownActive =
    active && (filterIds === null || filterIds.has(active.categoryId)) && toMs(active.startedAt) < endMs && isCurrent
      ? active
      : null

  const addSession = () => {
    // Today: the hour up to now. Another day: a morning hour to adjust.
    const day = view === 'day' ? dayStartMs : isCurrent ? todayStartMs : startMs
    const end = day === todayStartMs ? Math.floor(Date.now() / MIN) * MIN : new Date(day).setHours(10)
    setDialog({ kind: 'new', startMs: end - 60 * MIN, endMs: end })
  }

  const dateText =
    view === 'day'
      ? `${isCurrent ? 'Today' : weekdayName(startMs)}, ${dayAndMonth(startMs)}`
      : `${datedDay(startMs)} – ${datedDay(endMs - 1)}`

  return (
    <div className="explore">
      <header className="mast">
        <h1>Explore</h1>
      </header>

      <div className="views" role="group" aria-label="View">
        <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>
          Day
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>
          Week
        </button>
      </div>

      <div className="stepper">
        <button type="button" aria-label={`Previous ${unit}`} onClick={() => goTo(shiftLocalDay(dayStartMs, -step))}>
          ←
        </button>
        <label className="datepick">
          <span data-testid="date-text">{dateText}</span>
          <input
            type="date"
            aria-label={view === 'day' ? 'Day to show' : 'Show the week containing'}
            value={toLocalDateValue(dayStartMs)}
            max={toLocalDateValue(todayStartMs)}
            onChange={(e) => {
              const day = parseLocalDate(e.target.value)
              if (day !== null) goTo(day)
            }}
          />
        </label>
        <button
          type="button"
          aria-label={`Next ${unit}`}
          disabled={isCurrent}
          onClick={() => goTo(shiftLocalDay(dayStartMs, step))}
        >
          →
        </button>
      </div>

      <div className="tools">
        <label className="filter">
          <span>Showing</span>
          <select aria-label="Show" value={filterId ?? ''} onChange={(e) => setFilterValue(e.target.value)}>
            <option value="">all activities</option>
            {tree.flatMap(({ category, children }) => [
              <option key={category.id} value={category.id}>
                {category.name}
                {children.length > 0 ? ' (whole group)' : ''}
              </option>,
              ...children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name} — {category.name}
                </option>
              )),
            ])}
            {archived.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c.id, categories)} (archived)
              </option>
            ))}
          </select>
        </label>
        {!isCurrent && (
          <button type="button" className="textbtn" onClick={() => setChosenDayMs(null)}>
            {view === 'day' ? 'Today' : 'This week'}
          </button>
        )}
      </div>

      {allSessions === undefined ? (
        <p className="quiet">Loading…</p>
      ) : view === 'day' ? (
        <>
          {sessions.length === 0 ? (
            <p className="lede quiet">
              {isCurrent ? `No saved sessions today${filterNote}.` : `No saved sessions on this day${filterNote}.`}
            </p>
          ) : (
            <p className="lede">
              <strong data-testid="day-total">{formatMinutes(totalMs)}</strong> in {countOf(sessions.length, 'session')}
              {filterNote}.
            </p>
          )}
          {overlapping.size > 0 && (
            <p className="hint" data-testid="day-overlap-note">
              Some sessions overlap, so the total counts that time more than once.
            </p>
          )}
          <DayTimeline
            sessions={sessions}
            dayStartMs={startMs}
            dayEndMs={endMs}
            categories={categories}
            active={shownActive}
            overlapping={overlapping}
            onEdit={(session) => setDialog({ kind: 'edit', session })}
          />
        </>
      ) : (
        <WeekBody
          sessions={sessions}
          startMs={startMs}
          endMs={endMs}
          todayStartMs={todayStartMs}
          categories={categories}
          totalMs={totalMs}
          filterNote={filterNote}
          isCurrent={isCurrent}
          onOpenDay={(day) => {
            setView('day')
            goTo(day)
          }}
        />
      )}

      <button type="button" className="plate wide" onClick={addSession}>
        Add a past session
      </button>

      {dialog && (
        <SessionDialog
          key={dialog.kind === 'edit' ? dialog.session.id : 'new'}
          mode={dialog}
          categories={categories}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function WeekBody({
  sessions,
  startMs,
  endMs,
  todayStartMs,
  categories,
  totalMs,
  filterNote,
  isCurrent,
  onOpenDay,
}: {
  sessions: Session[]
  startMs: number
  endMs: number
  todayStartMs: number
  categories: Category[]
  totalMs: number
  filterNote: string
  isCurrent: boolean
  onOpenDay: (dayStartMs: number) => void
}) {
  if (sessions.length === 0) {
    return <p className="lede quiet">No saved sessions {isCurrent ? 'this week' : 'in this week'}{filterNote}.</p>
  }

  // Everything below is calculated in src/domain; this only arranges it.
  const groups = groupTotals(sessions, startMs, endMs, categories)
  const activities = categoryTotals(sessions, startMs, endMs)
  const order = groups.map((g) => g.groupId)
  const stacked = stackByDay(sessions, startMs, 7, order, categories)
  const days = daySummaries(sessions, startMs, 7)
  const topHours = hourCeiling(Math.max(...stacked.map((d) => d.totalMs)))
  const groupInfo = new Map(
    order.map((id) => [id, { name: categoryParts(id, categories).name, inkClass: inkClass(id, categories) }]),
  )

  return (
    <>
      <p className="lede">
        <strong data-testid="week-total">{formatMinutes(totalMs)}</strong> {isCurrent ? 'so far this week' : 'in this week'},
        across {countOf(sessions.length, 'session')}
        {filterNote}.
      </p>

      <figure className="plot">
        <WeekChart days={stacked} topHours={topHours} todayStartMs={todayStartMs} groups={groupInfo} />
        <figcaption>Each bar is a day, built from its groups. The list below names them.</figcaption>
      </figure>

      <ul className="shares" data-testid="week-groups">
        {groups.map((g) => (
          <li key={g.groupId} className={inkClass(g.groupId, categories)}>
            <span className="name">
              <Mark id={g.groupId} categories={categories} />
              <span className="what">{categoryParts(g.groupId, categories).name}</span>
            </span>
            <span className="len">
              {formatMinutes(g.activeMs)}
              <span className="pct">{Math.round((g.activeMs / totalMs) * 100)}%</span>
            </span>
            <span className="track">
              <span className="fill" style={{ width: `${(g.activeMs / groups[0]!.activeMs) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>

      <p className="kicker subhead">By activity</p>
      <ul className="shares" data-testid="week-breakdown">
        {activities.map((a) => (
          <li key={a.categoryId} className={inkClass(a.categoryId, categories)}>
            <span className="name">
              <Mark id={a.categoryId} categories={categories} />
              <CategoryName id={a.categoryId} categories={categories} />
            </span>
            <span className="len">{formatMinutes(a.activeMs)}</span>
            <span className="track">
              <span className="fill" style={{ width: `${(a.activeMs / activities[0]!.activeMs) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>

      <p className="kicker subhead">Day by day</p>
      <ul className="plain" data-testid="week-days">
        {days
          .filter((d) => d.dayStartMs <= todayStartMs)
          .map((d) => (
            <li key={d.dayStartMs}>
              <button type="button" className="line" onClick={() => onOpenDay(d.dayStartMs)}>
                <span className="lbl">
                  <span className="what">{weekdayName(d.dayStartMs)}</span>
                  <span className="of"> {dayAndMonth(d.dayStartMs)}</span>
                </span>
                <span className="go">
                  {d.entries.length === 0 ? 'nothing' : `${formatMinutes(d.activeMs)} · ${countOf(d.entries.length, 'session')}`}
                </span>
              </button>
            </li>
          ))}
      </ul>
    </>
  )
}
