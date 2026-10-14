import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { Sheet } from '../../components/Sheet'
import { db } from '../../db/db'
import { CategoryOptions } from '../../components/CategoryOptions'
import { archiveCategory, editCategory } from '../../db/repo'
import { MAX_CATEGORY_NAME_LENGTH, placementProblem } from '../../domain/categories'
import { INKS, inkName, isInkId, resolveInk } from '../../domain/inks'
import type { Category } from '../../domain/types'

/** Rename an activity, move it, choose its ink, or archive it. */
export function CategoryDialog({
  category,
  categories,
  onClose,
}: {
  category: Category
  categories: Category[]
  onClose: () => void
}) {
  const hasChildren = categories.some((c) => c.parentId === category.id && c.archivedAt === null)
  const [name, setName] = useState(category.name)
  const [parentId, setParentId] = useState(category.parentId ?? '')
  const parent = parentId === '' ? null : (categories.find((c) => c.id === parentId) ?? null)
  // '' stands for "same as its group", which only an activity inside another may choose.
  const initialInk = isInkId(category.color) ? category.color : category.parentId ? '' : resolveInk(category.id, categories)
  const [ink, setInk] = useState<string>(initialInk)
  const [inkTouched, setInkTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { busy, error, run } = useAction()
  const moving = (parentId || null) !== category.parentId

  const chooseParent = (value: string) => {
    setParentId(value)
    // A move keeps the colour it shows now, unless an ink is chosen deliberately.
    if (inkTouched) return
    setInk(value === (category.parentId ?? '') ? initialInk : isInkId(category.color) ? category.color : resolveInk(category.id, categories))
  }

  const save = () =>
    run(async () => {
      await editCategory(
        db,
        category.id,
        {
          name,
          ...(moving ? { parentId: parentId || null } : {}),
          ...(inkTouched || ink !== (category.color ?? '') ? { color: ink === '' ? null : ink } : {}),
        },
        Date.now(),
      )
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

        <label className="field">
          <span>Inside</span>
          <select className="input" value={parentId} onChange={(e) => chooseParent(e.target.value)}>
            <option value="">Nothing (on its own)</option>
            <CategoryOptions
              categories={categories}
              // Only places it can actually go: not itself, nothing inside it, nothing too deep.
              allow={(c) => placementProblem(category.id, c.id, categories) === null}
            />
          </select>
        </label>
        {moving && (
          <p className="hint">
            Its past sessions{hasChildren ? ' and everything inside it' : ''} move with it, and totals are
            recalculated. Nothing is deleted.
          </p>
        )}

        <fieldset className="field">
          <legend className="label">
            Ink <small>(how it is marked in lists, the timeline and charts)</small>
          </legend>
          <div className="choices">
            {parent && (
              <label className={`choice line ink-${resolveInk(parent.id, categories)}`}>
                <input
                  type="radio"
                  name="ink"
                  value=""
                  checked={ink === ''}
                  onChange={() => {
                    setInk('')
                    setInkTouched(true)
                  }}
                />
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
                  onChange={() => {
                    setInk(option.id)
                    setInkTouched(true)
                  }}
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
