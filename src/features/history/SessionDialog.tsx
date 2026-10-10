import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { Sheet } from '../../components/Sheet'
import { db } from '../../db/db'
import { addManualSession, deleteSession, getActiveSession, sessionsOverlapping, updateSession } from '../../db/repo'
import { categoryLabel, categoryTree } from '../../domain/categories'
import {
  draftProblems,
  findActiveOverlaps,
  fitPauses,
  MAX_TITLE_LENGTH,
  sessionTimes,
  splitByLocalDay,
  type SessionDraft,
} from '../../domain/sessions'
import { formatMinutes, parseLocalInput, toIso, toLocalInputValue, toMs } from '../../domain/time'
import { finishSession } from '../../domain/timer'
import type { Category, Session } from '../../domain/types'
import {
  emptyReflectionForm,
  isAnswered,
  ReflectionFields,
  reflectionFormOf,
  toReflection,
} from '../reflections/ReflectionFields'

export type SessionDialogMode =
  | { kind: 'new'; startMs: number; endMs: number }
  | { kind: 'edit'; session: Session }

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const DAY_MS = 86_400_000

export function SessionDialog({
  mode,
  categories,
  onClose,
}: {
  mode: SessionDialogMode
  categories: Category[]
  onClose: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.session : null
  const initialStartMs = editing ? toMs(editing.startedAt) : mode.kind === 'new' ? mode.startMs : 0
  const initialEndMs = editing ? toMs(editing.endedAt) : mode.kind === 'new' ? mode.endMs : 0
  const initialStart = toLocalInputValue(initialStartMs)
  const initialEnd = toLocalInputValue(initialEndMs)

  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [startValue, setStartValue] = useState(initialStart)
  const [endValue, setEndValue] = useState(initialEnd)
  const [dropPauses, setDropPauses] = useState(false)
  const [reflection, setReflection] = useState(editing ? reflectionFormOf(editing) : emptyReflectionForm)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { busy, error, run } = useAction()

  // The inputs work in whole minutes. A field the user has not touched keeps
  // the stored instant exactly, so editing only the category never shifts times.
  const startMs = startValue === initialStart ? initialStartMs : parseLocalInput(startValue)
  const endMs = endValue === initialEnd ? initialEndMs : parseLocalInput(endValue)

  const draft: SessionDraft | null =
    startMs === null || endMs === null
      ? null
      : {
          categoryId,
          title: title.trim() || null,
          startedAt: toIso(startMs),
          endedAt: toIso(endMs),
          pausedIntervals: editing && !dropPauses ? editing.pausedIntervals : [],
        }

  const timeProblems: string[] = []
  if (startMs === null) timeProblems.push('Enter a start time that exists on that date.')
  if (endMs === null) timeProblems.push('Enter an end time that exists on that date.')
  const problems = draft
    ? draftProblems(draft, { categories, nowMs: Date.now(), keepCategoryId: editing?.categoryId })
    : timeProblems
  // Don't nag about the category before the user has had a chance to pick one.
  const shownProblems = problems.filter((p) => categoryId !== '' || p !== 'Choose a category.')

  const validSpan = draft !== null && startMs !== null && endMs !== null && endMs > startMs
  const fitted = validSpan
    ? { startedAt: draft.startedAt, endedAt: draft.endedAt, pausedIntervals: fitPauses(draft.pausedIntervals, startMs, endMs) }
    : null
  const times = fitted ? sessionTimes(fitted) : null
  const days = fitted ? splitByLocalDay(fitted) : []
  const originalPausedMs = editing ? sessionTimes(editing).pausedMs : 0
  const pausesTrimmed = editing !== null && !dropPauses && times !== null && times.pausedMs < originalPausedMs

  const others = useLiveQuery(async () => {
    if (!validSpan) return { saved: [], inProgress: null }
    const saved = await sessionsOverlapping(db, startMs, endMs)
    const active = await getActiveSession(db).catch(() => null)
    // Treat the timer in progress as a session ending now.
    return { saved, inProgress: active ? finishSession(active, Date.now()) : null }
  }, [validSpan, startMs, endMs])
  const inProgressId = others?.inProgress?.id
  const overlaps = fitted
    ? findActiveOverlaps(
        { ...fitted, id: editing?.id },
        [...(others?.saved ?? []), ...(others?.inProgress ? [others.inProgress] : [])],
      )
    : []

  const tree = categoryTree(categories)
  const keptArchived =
    editing && categories.find((c) => c.id === editing.categoryId && c.archivedAt !== null) ? editing.categoryId : null

  const save = () =>
    run(async () => {
      if (!draft) return
      if (editing) await updateSession(db, editing.id, draft, Date.now(), toReflection(reflection))
      else await addManualSession(db, draft, Date.now(), toReflection(reflection))
      onClose()
    })

  return (
    <Sheet title={editing ? 'Edit session' : 'Add a past session'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span>Activity</span>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {!editing && <option value="">Choose an activity…</option>}
            {keptArchived && <option value={keptArchived}>{categoryLabel(keptArchived, categories)} (archived)</option>}
            {tree.flatMap(({ category, children }) => [
              <option key={category.id} value={category.id}>
                {category.name}
              </option>,
              ...children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name} — {category.name}
                </option>
              )),
            ])}
          </select>
        </label>

        <div className="twoup">
          <label className="field">
            <span>Start</span>
            <input
              type="datetime-local"
              className="input"
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>End</span>
            <input
              type="datetime-local"
              className="input"
              value={endValue}
              onChange={(e) => setEndValue(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="field">
          <span>
            Title <small>(optional)</small>
          </span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
          />
        </label>

        {editing && originalPausedMs > 0 && (
          <label className="check">
            <input type="checkbox" checked={dropPauses} onChange={(e) => setDropPauses(e.target.checked)} />
            <span>Remove recorded pauses ({formatMinutes(originalPausedMs)}) and count the whole span as active</span>
          </label>
        )}

        {times && (
          <div className="preview" data-testid="session-preview">
            <p>
              <strong>Active {formatMinutes(times.activeMs)}</strong>
              {times.pausedMs > 0
                ? `, from ${formatMinutes(times.elapsedMs)} elapsed less ${formatMinutes(times.pausedMs)} paused`
                : ' (no pauses, so the same as elapsed)'}
            </p>
            {pausesTrimmed && <p>Pauses outside the new times are trimmed to fit.</p>}
            {days.length > 1 && (
              <p>
                Crosses midnight:{' '}
                {days.map((d) => `${formatMinutes(d.activeMs)} on ${dayLabel.format(d.dayStartMs)}`).join(', ')}.
              </p>
            )}
            {times.elapsedMs > DAY_MS && <p>This is longer than 24 hours. Check the dates.</p>}
          </div>
        )}

        {shownProblems.length > 0 && (
          <div role="alert" className="alert">
            <ul>
              {shownProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {problems.length === 0 && overlaps.length > 0 && (
          <div role="status" className="alert" data-testid="overlap-warning">
            <p>
              <strong>This overlaps time already recorded:</strong>
            </p>
            <ul>
              {overlaps.map(({ session, overlapMs }) => (
                <li key={session.id}>
                  {categoryLabel(session.categoryId, categories)},{' '}
                  {session.id === inProgressId
                    ? `in progress since ${dateTime.format(toMs(session.startedAt))}`
                    : `${dateTime.format(toMs(session.startedAt))} – ${dateTime.format(toMs(session.endedAt))}`}{' '}
                  ({formatMinutes(overlapMs)} in common)
                </li>
              ))}
            </ul>
            <p>You can still save; daily totals will then count the shared time twice.</p>
          </div>
        )}

        <details className="fold" open={editing !== null && isAnswered(reflectionFormOf(editing)) ? true : undefined}>
          <summary>Reflection (optional){isAnswered(reflection) ? '' : ' · not answered'}</summary>
          <ReflectionFields idPrefix="edit" value={reflection} onChange={setReflection} />
        </details>

        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}

        <div className="pair">
          <button type="submit" className="plate full" disabled={busy || problems.length > 0}>
            {overlaps.length > 0 && problems.length === 0 ? 'Save with overlap' : editing ? 'Save changes' : 'Save session'}
          </button>
          <button type="button" className="plate" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>

        {editing &&
          (confirmingDelete ? (
            <div className="confirm" role="group" aria-labelledby="delete-question">
              <p id="delete-question">Delete this session permanently? This cannot be undone.</p>
              <div className="pair">
                <button
                  type="button"
                  className="plate"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await deleteSession(db, editing.id)
                      onClose()
                    })
                  }
                >
                  Delete permanently
                </button>
                <button type="button" className="plate full" autoFocus disabled={busy} onClick={() => setConfirmingDelete(false)}>
                  Keep session
                </button>
              </div>
            </div>
          ) : (
            <p className="aside-act">
              <button type="button" className="textbtn" disabled={busy} onClick={() => setConfirmingDelete(true)}>
                Delete session…
              </button>
            </p>
          ))}
      </form>
    </Sheet>
  )
}
