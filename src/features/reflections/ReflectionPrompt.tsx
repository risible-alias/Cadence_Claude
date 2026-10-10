import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { db } from '../../db/db'
import { updateReflection } from '../../db/repo'
import { emptyReflectionForm, isAnswered, ReflectionFields, toReflection } from './ReflectionFields'

/**
 * Offered after a session has already been saved. It starts closed, so
 * ignoring it costs nothing and there is nothing to dismiss.
 */
export function ReflectionPrompt({ sessionId, onDone }: { sessionId: string; onDone: (notice: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyReflectionForm)
  const { busy, error, run } = useAction()

  if (!open) {
    return (
      <button type="button" className="textbtn" onClick={() => setOpen(true)}>
        Add a reflection (optional)
      </button>
    )
  }

  return (
    <form
      className="reflect"
      aria-label="Reflection on the saved session"
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => {
          await updateReflection(db, sessionId, toReflection(form), Date.now())
          onDone('Reflection saved.')
        })
      }}
    >
      <p className="hint">
        The session is already saved. Answer any, all or none of these; you can change them later.
      </p>
      <ReflectionFields idPrefix="after-finish" value={form} onChange={setForm} />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="pair">
        <button type="submit" className="plate full" disabled={busy || !isAnswered(form)}>
          Save reflection
        </button>
        <button type="button" className="plate" disabled={busy} onClick={() => onDone(null)}>
          Skip
        </button>
      </div>
    </form>
  )
}
