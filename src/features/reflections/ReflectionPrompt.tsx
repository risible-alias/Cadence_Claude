import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { Button } from '../../components/Button'
import { errorClass, mutedClass } from '../../components/fields'
import { db } from '../../db/db'
import { updateReflection } from '../../db/repo'
import { emptyReflectionForm, isAnswered, ReflectionFields, toReflection } from './ReflectionFields'

/**
 * Offered after a session has already been saved. It starts collapsed, so
 * ignoring it costs nothing and nothing has to be dismissed.
 */
export function ReflectionPrompt({ sessionId, onDone }: { sessionId: string; onDone: (notice: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyReflectionForm)
  const { busy, error, run } = useAction()

  if (!open) {
    return (
      <Button className="mt-2 w-full" onClick={() => setOpen(true)}>
        Add a reflection (optional)
      </Button>
    )
  }

  return (
    <form
      aria-label="Reflection on the saved session"
      className="mt-3 grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault()
        void run(async () => {
          await updateReflection(db, sessionId, toReflection(form), Date.now())
          onDone('Reflection saved.')
        })
      }}
    >
      <p className={mutedClass}>
        The session is already saved. Answer any, all or none of these; you can change them later from Edit.
      </p>
      <ReflectionFields idPrefix="after-finish" value={form} onChange={setForm} />
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" variant="primary" disabled={busy || !isAnswered(form)}>
          Save reflection
        </Button>
        <Button disabled={busy} onClick={() => onDone(null)}>
          Skip
        </Button>
      </div>
    </form>
  )
}
