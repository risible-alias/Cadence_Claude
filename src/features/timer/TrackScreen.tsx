import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { clockTime, clockTimeIn, countOf, dayAndMonth, shortDay, weekdayName } from '../../app/format'
import { useAction, useNow, useTodayStartMs } from '../../app/hooks'
import { CategoryName, inkClass, Mark } from '../../components/Category'
import { db } from '../../db/db'
import {
  cancelActiveSession,
  finishActiveSession,
  pauseActiveSession,
  recentSessions,
  resumeActiveSession,
  sessionsOverlapping,
  setActiveTitle,
  startActiveSession,
} from '../../db/repo'
import { categoryLabel, categoryParts } from '../../domain/categories'
import { recentCategoryIds, windowActiveMs } from '../../domain/history'
import { MAX_TITLE_LENGTH, sessionTimes } from '../../domain/sessions'
import {
  activeElapsedMs,
  activeOverlapMs,
  formatDuration,
  formatMinutes,
  formatTimer,
  sessionActiveMs,
  shiftLocalDay,
  toMs,
} from '../../domain/time'
import { finishSession } from '../../domain/timer'
import type { ActiveSession, Category, Session } from '../../domain/types'
import { SessionDialog } from '../history/SessionDialog'
import { ReflectionPrompt } from '../reflections/ReflectionPrompt'

const RECENT_ROWS = 4

interface Props {
  categories: Category[]
  active: ActiveSession | null
  /** Set when the stored active session could not be read. */
  activeError: string | null
}

export function TrackScreen({ categories, active, activeError }: Props) {
  const todayStartMs = useTodayStartMs()
  const todayEndMs = shiftLocalDay(todayStartMs, 1)
  const recent = useLiveQuery(() => recentSessions(db), [])
  const today = useLiveQuery(() => sessionsOverlapping(db, todayStartMs, todayEndMs), [todayStartMs, todayEndMs])
  // The session just finished, while its optional reflection is still on offer.
  const [finished, setFinished] = useState<{ id: string | null; note: string } | null>(null)
  const [editing, setEditing] = useState<Session | null>(null)

  return (
    <>
      <header className="mast">
        <h1>
          {weekdayName(todayStartMs)}, <em>{dayAndMonth(todayStartMs)}</em>
        </h1>
      </header>

      {activeError ? (
        <p role="alert" className="alert">
          {activeError} Nothing has been deleted; the record is still stored on this device.
        </p>
      ) : active ? (
        <RunningSession
          key={active.id}
          active={active}
          categories={categories}
          onFinished={(session) =>
            setFinished({
              id: session.id,
              note: `Saved ${formatMinutes(sessionActiveMs(session))} of ${categoryLabel(session.categoryId, categories)}.`,
            })
          }
          onDiscarded={() => setFinished({ id: null, note: 'Session discarded.' })}
        />
      ) : (
        <section className="begin" aria-label="Start a session">
          {finished && (
            <>
              <p role="status" className="saved">
                {finished.note}
              </p>
              {finished.id && (
                <ReflectionPrompt
                  key={finished.id}
                  sessionId={finished.id}
                  onDone={(note) => setFinished(note ? { id: null, note } : null)}
                />
              )}
            </>
          )}
          <BeginList
            categories={categories}
            recent={recent ?? []}
            todayStartMs={todayStartMs}
            onStarted={() => setFinished(null)}
          />
        </section>
      )}

      <TodaySummary
        categories={categories}
        active={activeError ? null : active}
        sessions={today}
        dayStartMs={todayStartMs}
        dayEndMs={todayEndMs}
        onEdit={setEditing}
      />

      {editing && (
        <SessionDialog
          key={editing.id}
          mode={{ kind: 'edit', session: editing }}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function RunningSession({
  active,
  categories,
  onFinished,
  onDiscarded,
}: {
  active: ActiveSession
  categories: Category[]
  onFinished: (session: Session) => void
  onDiscarded: () => void
}) {
  const now = useNow()
  const [options, setOptions] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [title, setTitle] = useState(active.title ?? '')
  const { busy, error, run } = useAction()

  const paused = active.state === 'paused'
  const { name, parent } = categoryParts(active.categoryId, categories)
  const activeMs = activeElapsedMs(active, now)
  // The session as it would be saved this instant: gives elapsed, paused and the pause spans.
  const soFar = finishSession(active, now)
  const times = sessionTimes(soFar)
  const startMs = toMs(active.startedAt)
  const span = Math.max(1, toMs(soFar.endedAt) - startMs)
  const titleChanged = (title.trim() || null) !== active.title

  return (
    <section
      className={`now ${inkClass(active.categoryId, categories)}${paused ? ' is-paused' : ''}`}
      aria-label="Current session"
    >
      <p className="state">
        <span className="pip" aria-hidden="true" />
        <span data-testid="timer-status">{paused ? 'Paused' : 'In progress'}</span>
      </p>
      <h2>{name}</h2>
      {(parent || active.title) && <p className="sub">{[parent, active.title].filter(Boolean).join(' · ')}</p>}

      {/* Not announced every second; the label carries the units. */}
      <p
        className={`figure${activeMs >= 3_600_000 ? ' long' : ''}`}
        role="timer"
        aria-label={`Active time ${formatDuration(activeMs)}`}
      >
        {formatTimer(activeMs)}
      </p>
      <div className="trace" aria-hidden="true">
        {soFar.pausedIntervals.map((p) => (
          <i
            key={p.startedAt}
            style={{
              left: `${((toMs(p.startedAt) - startMs) / span) * 100}%`,
              width: `${((toMs(p.endedAt) - toMs(p.startedAt)) / span) * 100}%`,
            }}
          />
        ))}
      </div>
      <p className="meta">
        Begun <time dateTime={active.startedAt}>{clockTime(startMs)}</time> · {formatMinutes(times.elapsedMs)} elapsed
        {times.pausedMs >= 1000 && ` · ${formatMinutes(times.pausedMs)} paused`}
      </p>

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      <div className="acts pair">
        {paused ? (
          <button
            type="button"
            className="plate full"
            disabled={busy}
            onClick={() => void run(async () => void (await resumeActiveSession(db, Date.now())))}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            className="plate full"
            disabled={busy}
            onClick={() => void run(async () => void (await pauseActiveSession(db, Date.now())))}
          >
            Pause
          </button>
        )}
        <button
          type="button"
          className="plate"
          disabled={busy}
          onClick={() => void run(async () => onFinished(await finishActiveSession(db, Date.now())))}
        >
          Finish
        </button>
      </div>

      <p className="aside-act">
        <button
          type="button"
          className="textbtn"
          aria-expanded={options}
          onClick={() => {
            setOptions(!options)
            setConfirming(false)
          }}
        >
          {options ? 'Close options' : 'Other options'}
        </button>
      </p>

      {options && (
        <div className="options">
          <form
            className="titleform"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => void (await setActiveTitle(db, title, Date.now())))
            }}
          >
            <label className="field">
              <span>
                Title <small>(optional)</small>
              </span>
              <input
                className="input"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                autoComplete="off"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button type="submit" className="plate slim" disabled={busy || !titleChanged}>
              Save title
            </button>
          </form>

          {confirming ? (
            <div className="confirm" role="group" aria-labelledby="discard-question">
              <p id="discard-question">
                Discard this session? Its {formatMinutes(activeMs)} will not be saved, and this cannot be undone.
              </p>
              <div className="pair">
                <button
                  type="button"
                  className="plate"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await cancelActiveSession(db)
                      onDiscarded()
                    })
                  }
                >
                  Discard session
                </button>
                <button type="button" className="plate full" autoFocus disabled={busy} onClick={() => setConfirming(false)}>
                  Keep session
                </button>
              </div>
            </div>
          ) : (
            <p className="aside-act">
              <button type="button" className="textbtn" onClick={() => setConfirming(true)}>
                Discard this session…
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function BeginList({
  categories,
  recent,
  todayStartMs,
  onStarted,
}: {
  categories: Category[]
  recent: Session[]
  todayStartMs: number
  onStarted: () => void
}) {
  const [others, setOthers] = useState(false)
  const { busy, error, run } = useAction()
  const ids = recentCategoryIds(recent, categories)
  // `recent` is newest first, so the first session found for a category is its latest.
  const lastUse = (id: string) => recent.find((s) => s.categoryId === id)

  const when = (endMs: number) => {
    if (endMs >= todayStartMs) return 'today'
    if (endMs >= shiftLocalDay(todayStartMs, -1)) return 'yesterday'
    return endMs >= shiftLocalDay(todayStartMs, -6) ? weekdayName(endMs) : shortDay(endMs)
  }

  const row = (id: string, small: boolean) => {
    const { name, parent } = categoryParts(id, categories)
    const last = lastUse(id)
    const context = [parent, last ? `last ${when(toMs(last.endedAt))}, ${formatMinutes(sessionActiveMs(last))}` : 'not yet used']
    return (
      <li key={id}>
        <button
          type="button"
          className={`row ${inkClass(id, categories)}${small ? ' small' : ''}`}
          aria-label={`Begin ${categoryLabel(id, categories)}`}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await startActiveSession(db, { categoryId: id }, Date.now())
              onStarted()
            })
          }
        >
          <span className="edge" aria-hidden="true" />
          <span className="rt">
            <span className="nm">{name}</span>
            <span className="ctx">{context.filter(Boolean).join(' · ')}</span>
          </span>
          {!small && (
            <span className="cue" aria-hidden="true">
              Begin →
            </span>
          )}
        </button>
      </li>
    )
  }

  if (ids.length === 0) {
    return (
      <>
        <p className="kicker">Begin</p>
        <div className="empty">
          <p>No activities yet. Name the things you want to keep time for, such as a subject or an instrument.</p>
          <a className="plate full" href="#settings">
            Add your first activity
          </a>
        </div>
      </>
    )
  }

  const rest = ids.slice(RECENT_ROWS)
  return (
    <>
      <p className="kicker">Begin</p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <ul className="rows">{ids.slice(0, RECENT_ROWS).map((id) => row(id, false))}</ul>
      {rest.length > 0 && (
        <>
          <button type="button" className="disclose" aria-expanded={others} onClick={() => setOthers(!others)}>
            <span>Other activities</span>
            <span className="n">{rest.length}</span>
            <span className="caret" aria-hidden="true">
              {others ? '–' : '+'}
            </span>
          </button>
          {others && <ul className="rows">{rest.map((id) => row(id, true))}</ul>}
        </>
      )}
    </>
  )
}

function TodaySummary({
  categories,
  active,
  sessions,
  dayStartMs,
  dayEndMs,
  onEdit,
}: {
  categories: Category[]
  active: ActiveSession | null
  sessions: Session[] | undefined
  dayStartMs: number
  dayEndMs: number
  onEdit: (session: Session) => void
}) {
  const now = useNow(active ? 1000 : 30_000)
  const list = sessions ?? []
  const totalMs = windowActiveMs(list, dayStartMs, dayEndMs)
  const liveStartMs = active ? toMs(active.startedAt) : 0

  // The day as one line, midnight to midnight, each session in its category's ink.
  const W = 320
  const x = (ms: number) => ((Math.min(dayEndMs, Math.max(dayStartMs, ms)) - dayStartMs) / (dayEndMs - dayStartMs)) * W

  return (
    <section className="today" aria-label="Today">
      <p className="kicker">Today so far</p>
      {sessions === undefined ? (
        <p className="quiet">Loading…</p>
      ) : list.length === 0 && !active ? (
        <p className="lede quiet">Nothing recorded yet today.</p>
      ) : (
        <>
          <p className="lede">
            <strong data-testid="today-total">{formatMinutes(totalMs)}</strong> in {countOf(list.length, 'session')}
            {active ? ', and one under way.' : '.'}
          </p>
          <svg className="ribbon" viewBox={`0 0 ${W} 30`} role="img" aria-label="When today's sessions took place">
            <line className="base" x1="0" y1="8" x2={W} y2="8" />
            {list.map((s) => (
              <rect
                key={s.id}
                className={`seg ${inkClass(s.categoryId, categories)}`}
                x={x(toMs(s.startedAt)) + 0.75}
                y="4"
                width={Math.max(1.5, x(toMs(s.endedAt)) - x(toMs(s.startedAt)) - 1.5)}
                height="8"
                rx="1"
              />
            ))}
            {active && (
              <rect
                className={`seg live ${inkClass(active.categoryId, categories)}`}
                x={x(liveStartMs) + 0.75}
                y="4.75"
                width={Math.max(2.5, x(now) - x(liveStartMs) - 1.5)}
                height="6.5"
                rx="1"
              />
            )}
            {[0, 6, 12, 18, 24].map((h) => (
              <text key={h} x={(h / 24) * W} y="27" textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}>
                {String(h).padStart(2, '0')}
              </text>
            ))}
          </svg>
          <ol className="entries">
            {list.map((s) => {
              const startMs = toMs(s.startedAt)
              const label = categoryLabel(s.categoryId, categories)
              const notes = [s.title, startMs < dayStartMs && 'continued from yesterday', toMs(s.endedAt) > dayEndMs && 'runs past midnight']
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="entry"
                    aria-label={`Edit ${label}, ${clockTimeIn(startMs, dayStartMs, dayEndMs)}`}
                    onClick={() => onEdit(s)}
                  >
                    <time dateTime={s.startedAt}>{clockTime(Math.max(startMs, dayStartMs))}</time>
                    <Mark id={s.categoryId} categories={categories} />
                    <span className="body">
                      <CategoryName id={s.categoryId} categories={categories} />
                      {notes.some(Boolean) && <span className="note">{notes.filter(Boolean).join(' · ')}</span>}
                    </span>
                    <span className="len">{formatMinutes(activeOverlapMs(s, dayStartMs, dayEndMs))}</span>
                  </button>
                </li>
              )
            })}
            {active && (
              <li>
                <div className="entry live" data-testid="today-in-progress">
                  <time dateTime={active.startedAt}>{clockTime(Math.max(liveStartMs, dayStartMs))}</time>
                  <Mark id={active.categoryId} categories={categories} open />
                  <span className="body">
                    <CategoryName id={active.categoryId} categories={categories} />
                    <span className="note">{active.state === 'paused' ? 'paused' : 'in progress'}, not yet counted</span>
                  </span>
                  <span className="len">now</span>
                </div>
              </li>
            )}
          </ol>
          <p className="after">
            <a className="textbtn" href="#explore">
              The day in full
            </a>
          </p>
        </>
      )}
    </section>
  )
}
