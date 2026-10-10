import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { Sheet } from '../../components/Sheet'
import { db } from '../../db/db'
import { archiveCategory, renameCategory, setCategoryInk } from '../../db/repo'
import { MAX_CATEGORY_NAME_LENGTH } from '../../domain/categories'
import { INKS, inkName, isInkId, resolveInk } from '../../domain/inks'
import type { Category } from '../../domain/types'

/** Rename an activity, choose its ink, or archive it. */
export function CategoryDialog({
  category,
  categories,
  onClose,
}: {
  category: Category
  categories: Category[]
  onClose: () => void
}) {
  const parent = category.parentId === null ? null : (categories.find((c) => c.id === category.parentId) ?? null)
  const hasChildren = categories.some((c) => c.parentId === category.id && c.archivedAt === null)
  const [name, setName] = useState(category.name)
  // '' stands for "same as the group", which only a sub-category may choose.
  const [ink, setInk] = useState<string>(isInkId(category.color) ? category.color : parent ? '' : resolveInk(category.id, categories))
  const [confirming, setConfirming] = useState(false)
  const { busy, error, run } = useAction()

  const save = () =>
    run(async () => {
      const now = Date.now()
      if (name.trim() !== category.name) await renameCategory(db, category.id, name, now)
      const color = ink === '' ? null : ink
      if (color !== category.color) await setCategoryInk(db, category.id, color, now)
      onClose()
    })

  return (
    <Sheet title={`Edit ${category.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="field">
          <legend className="label">
            Ink <small>(how it is marked in lists, the timeline and charts)</small>
          </legend>
          <div className="choices">
            {parent && (
              <label className={`choice line ink-${resolveInk(parent.id, categories)}`}>
                <input type="radio" name="ink" value="" checked={ink === ''} onChange={() => setInk('')} />
                <span>
                  <i className="mark" aria-hidden="true" />
                  Same as {parent.name} ({inkName(resolveInk(parent.id, categories))})
                </span>
              </label>
            )}
            {INKS.map((option) => (
              <label key={option.id} className={`choice line ink-${option.id}`}>
                <input
                  type="radio"
                  name="ink"
                  value={option.id}
                  checked={ink === option.id}
                  onChange={() => setInk(option.id)}
                />
                <span>
                  <i className="mark" aria-hidden="true" />
                  {option.name}
                </span>
              </label>
            ))}
          </div>
          <p className="hint">
            Inks can be shared. Activities with the same ink are still counted separately.
            {hasChildren && ' Its sub-activities follow this ink unless they have their own.'}
          </p>
        </fieldset>

        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}

        <div className="pair">
          <button type="submit" className="plate full" disabled={busy || name.trim() === ''}>
            Save changes
          </button>
          <button type="button" className="plate" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>

        {confirming ? (
          <div className="confirm" role="group" aria-labelledby="archive-question">
            <p id="archive-question">
              Archive “{category.name}”{hasChildren ? ' and its sub-activities' : ''}? Saved sessions are kept, and it can
              be restored later.
            </p>
            <div className="pair">
              <button
                type="button"
                className="plate"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await archiveCategory(db, category.id, Date.now())
                    onClose()
                  })
                }
              >
                Archive
              </button>
              <button type="button" className="plate full" autoFocus disabled={busy} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <p className="aside-act">
            <button type="button" className="textbtn" disabled={busy} onClick={() => setConfirming(true)}>
              Archive this activity…
            </button>
          </p>
        )}
      </form>
    </Sheet>
  )
}
