import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useAction } from '../../app/hooks'
import { Button } from '../../components/Button'
import { errorClass, inputClass, labelClass, selectClass } from '../../components/fields'
import { db } from '../../db/db'
import { addManualSession, deleteSession, getActiveSession, sessionsOverlapping, updateSession } from '../../db/repo'
import { categoryPath, categoryTree } from '../../domain/categories'
import {
  draftProblems,
  findActiveOverlaps,
  fitPauses,
  MAX_TITLE_LENGTH,
  sessionTimes,
  splitByLocalDay,
  type SessionDraft,
} from '../../domain/sessions'
import { formatDuration, parseLocalInput, toIso, toLocalInputValue, toMs } from '../../domain/time'
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

  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    // Safari before 15.4 has no modal dialogs; show it in the page flow instead.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])

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
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="session-dialog-heading"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 shadow-xl backdrop:bg-slate-900/50 sm:p-6 dark:bg-slate-900 dark:text-slate-100"
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2 id="session-dialog-heading" className="text-lg font-semibold">
          {editing ? 'Edit session' : 'Add a past session'}
        </h2>

        <div>
          <label htmlFor="edit-category" className={labelClass}>
            Category
          </label>
          <select
            id="edit-category"
            className={selectClass}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {!editing && <option value="">Choose a category…</option>}
            {keptArchived && <option value={keptArchived}>{categoryPath(keptArchived, categories)} (archived)</option>}
            {tree.flatMap(({ category, children }) => [
              <option key={category.id} value={category.id}>
                {category.name}
              </option>,
              ...children.map((child) => (
                <option key={child.id} value={child.id}>
                  {category.name} → {child.name}
                </option>
              )),
            ])}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-start" className={labelClass}>
              Start
            </label>
            <input
              id="edit-start"
              type="datetime-local"
              className={inputClass}
              value={startValue}
              onChange={(e) => setStartValue(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="edit-end" className={labelClass}>
              End
            </label>
            <input
              id="edit-end"
              type="datetime-local"
              className={inputClass}
              value={endValue}
              onChange={(e) => setEndValue(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="edit-title" className={labelClass}>
            Title <span className="font-normal">(optional)</span>
          </label>
          <input
            id="edit-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
          />
        </div>

        {editing && originalPausedMs > 0 && (
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="size-5"
              checked={dropPauses}
              onChange={(e) => setDropPauses(e.target.checked)}
            />
            Remove recorded pauses ({formatDuration(originalPausedMs)}) and count the whole span as active
          </label>
        )}

        <details
          className="rounded-lg border border-slate-200 px-3 dark:border-slate-700"
          open={editing !== null && isAnswered(reflectionFormOf(editing)) ? true : undefined}
        >
          <summary className="min-h-11 cursor-pointer content-center text-base font-medium">
            Reflection (optional){isAnswered(reflection) ? '' : ' · not answered'}
          </summary>
          <div className="pb-3">
            <ReflectionFields idPrefix="edit" value={reflection} onChange={setReflection} />
          </div>
        </details>

        {times && (
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800" data-testid="session-preview">
            <p>
              <strong className="font-semibold">Active {formatDuration(times.activeMs)}</strong>
              {times.pausedMs > 0
                ? ` = ${formatDuration(times.elapsedMs)} elapsed − ${formatDuration(times.pausedMs)} paused`
                : ' (no pauses, so the same as elapsed)'}
            </p>
            {pausesTrimmed && <p>Pauses outside the new times are trimmed to fit.</p>}
            {days.length > 1 && (
              <p>
                Crosses midnight:{' '}
                {days.map((d) => `${formatDuration(d.activeMs)} on ${dayLabel.format(d.dayStartMs)}`).join(', ')}.
              </p>
            )}
            {times.elapsedMs > DAY_MS && <p>This is longer than 24 hours. Check the dates.</p>}
          </div>
        )}

        {shownProblems.length > 0 && (
          <ul role="alert" className={errorClass}>
            {shownProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        {problems.length === 0 && overlaps.length > 0 && (
          <div
            role="status"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
            data-testid="overlap-warning"
          >
            <p className="font-semibold">This overlaps time already recorded:</p>
            <ul className="list-disc pl-5">
              {overlaps.map(({ session, overlapMs }) => (
                <li key={session.id}>
                  {categoryPath(session.categoryId, categories)},{' '}
                  {session.id === inProgressId
                    ? `in progress since ${dateTime.format(toMs(session.startedAt))}`
                    : `${dateTime.format(toMs(session.startedAt))} – ${dateTime.format(toMs(session.endedAt))}`}{' '}
                  ({formatDuration(overlapMs)} in common)
                </li>
              ))}
            </ul>
            <p>You can still save; daily totals will then count the shared time twice.</p>
          </div>
        )}

        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" variant="primary" disabled={busy || problems.length > 0}>
            {overlaps.length > 0 && problems.length === 0 ? 'Save with overlap' : editing ? 'Save changes' : 'Save session'}
          </Button>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>

        {editing &&
          (confirmingDelete ? (
            <div role="group" aria-labelledby="delete-question" className="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <p id="delete-question" className="text-base">
                Delete this session permanently? This cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await deleteSession(db, editing.id)
                    onClose()
                  })}
                >
                  Delete permanently
                </Button>
                <Button autoFocus disabled={busy} onClick={() => setConfirmingDelete(false)}>
                  Keep session
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
              Delete session…
            </Button>
          ))}
      </form>
    </dialog>
  )
}
