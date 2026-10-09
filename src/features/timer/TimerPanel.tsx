import { useState } from 'react'
import { useAction, useNow } from '../../app/hooks'
import { Button } from '../../components/Button'
import { cardClass, errorClass, inputClass, labelClass, mutedClass, selectClass } from '../../components/fields'
import { inProgressClass, StatusBadge } from '../../components/StatusBadge'
import { db } from '../../db/db'
import {
  cancelActiveSession,
  finishActiveSession,
  pauseActiveSession,
  resumeActiveSession,
  startActiveSession,
} from '../../db/repo'
import { categoryPath, categoryTree } from '../../domain/categories'
import { activeElapsedMs, formatClock, formatDuration, sessionActiveMs, toMs } from '../../domain/time'
import type { ActiveSession, Category } from '../../domain/types'
import { ReflectionPrompt } from '../reflections/ReflectionPrompt'

interface Props {
  categories: Category[]
  active: ActiveSession | null
  selectedCategoryId: string
  onSelectCategory: (id: string) => void
}

export function TimerPanel({ categories, active, selectedCategoryId, onSelectCategory }: Props) {
  const [notice, setNotice] = useState<string | null>(null)
  // The session just finished, while its optional reflection is still on offer.
  const [finishedId, setFinishedId] = useState<string | null>(null)
  const clear = () => {
    setNotice(null)
    setFinishedId(null)
  }

  return (
    <section
      className={`${cardClass} ${active ? `border-2 ${inProgressClass[active.state]}` : ''}`}
      aria-labelledby="timer-heading"
    >
      <h2 id="timer-heading" className="mb-3 text-lg font-semibold">
        Current session
      </h2>
      {active ? (
        <ActiveView
          key={active.id}
          active={active}
          categories={categories}
          onFinished={(id, message) => {
            setFinishedId(id)
            setNotice(message)
          }}
          onDiscarded={clear}
        />
      ) : (
        <StartForm
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={onSelectCategory}
          onStarted={clear}
        />
      )}
      <p role="status" className={`${mutedClass} ${notice ? 'mt-3' : ''}`}>
        {notice}
      </p>
      {!active && finishedId && (
        <ReflectionPrompt
          key={finishedId}
          sessionId={finishedId}
          onDone={(message) => {
            setFinishedId(null)
            if (message) setNotice(message)
          }}
        />
      )}
    </section>
  )
}

function StartForm({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onStarted,
}: Omit<Props, 'active'> & { onStarted: () => void }) {
  const [title, setTitle] = useState('')
  const { busy, error, run } = useAction()
  const tree = categoryTree(categories)
  // Ignore a selection that has since been archived.
  const selected = categories.some((c) => c.id === selectedCategoryId && c.archivedAt === null)
    ? selectedCategoryId
    : ''

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => {
          await startActiveSession(db, { categoryId: selected, title }, Date.now())
          setTitle('')
          onStarted()
        })
      }}
    >
      <div>
        <label htmlFor="session-category" className={labelClass}>
          Category
        </label>
        <select
          id="session-category"
          className={selectClass}
          value={selected}
          onChange={(e) => onSelectCategory(e.target.value)}
          disabled={tree.length === 0}
        >
          <option value="">{tree.length === 0 ? 'No categories yet' : 'Choose a category…'}</option>
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
        {tree.length === 0 && <p className={`mt-1 ${mutedClass}`}>Add a category below to start tracking.</p>}
      </div>
      <div>
        <label htmlFor="session-title" className={labelClass}>
          Title <span className="font-normal">(optional)</span>
        </label>
        <input
          id="session-title"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoComplete="off"
        />
      </div>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || selected === ''} className="min-h-12 text-lg">
        Start
      </Button>
    </form>
  )
}

const timeOfDay = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function ActiveView({
  active,
  categories,
  onFinished,
  onDiscarded,
}: {
  active: ActiveSession
  categories: Category[]
  onFinished: (sessionId: string, notice: string) => void
  onDiscarded: () => void
}) {
  const now = useNow()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const { busy, error, run } = useAction()
  const paused = active.state === 'paused'
  const elapsed = activeElapsedMs(active, now)
  const path = categoryPath(active.categoryId, categories)

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-base font-medium">{path}</p>
        {active.title && <p className={mutedClass}>{active.title}</p>}
      </div>

      <div>
        {/* role="timer" is not announced every second; the label carries the units. */}
        <p
          role="timer"
          aria-label={`Active time ${formatDuration(elapsed)}`}
          className="font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl"
        >
          {formatClock(elapsed)}
        </p>
        <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 ${mutedClass}`}>
          <StatusBadge state={active.state} testId="timer-status" />
          <span>
            active time (h:m:s), pauses excluded · started{' '}
            <time dateTime={active.startedAt}>{timeOfDay.format(toMs(active.startedAt))}</time>
          </span>
        </p>
      </div>

      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}

      {confirmingCancel ? (
        <div role="group" aria-labelledby="cancel-question" className="grid gap-2">
          <p id="cancel-question" className="text-base">
            Discard this session? Its {formatDuration(elapsed)} will not be saved.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void run(async () => {
                await cancelActiveSession(db)
                onDiscarded()
              })}
            >
              Discard session
            </Button>
            <Button autoFocus disabled={busy} onClick={() => setConfirmingCancel(false)}>
              Keep session
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {paused ? (
            <Button variant="primary" disabled={busy} onClick={() => void run(async () => void (await resumeActiveSession(db, Date.now())))}>
              Resume
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void run(async () => void (await pauseActiveSession(db, Date.now())))}>
              Pause
            </Button>
          )}
          <Button
            variant={paused ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={() => void run(async () => {
              const session = await finishActiveSession(db, Date.now())
              onFinished(session.id, `Saved ${formatDuration(sessionActiveMs(session))} of ${path}.`)
            })}
          >
            Finish
          </Button>
          <Button variant="danger" disabled={busy} className="col-span-2" onClick={() => setConfirmingCancel(true)}>
            Cancel session
          </Button>
        </div>
      )}
    </div>
  )
}
