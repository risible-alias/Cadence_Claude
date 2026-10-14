import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { CategoryName, Mark } from '../../components/Category'
import { CategoryOptions } from '../../components/CategoryOptions'
import { db } from '../../db/db'
import { createCategory, restoreCategory } from '../../db/repo'
import { categoryLabel, categoryOutline, depthOf, MAX_CATEGORY_DEPTH, MAX_CATEGORY_NAME_LENGTH } from '../../domain/categories'
import { inkName, isInkId, resolveInk } from '../../domain/inks'
import type { Category } from '../../domain/types'
import { CategoryDialog } from './CategoryDialog'

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const outline = categoryOutline(categories)
  const archived = categories
    .filter((c) => c.archivedAt !== null)
    .map((c) => ({ id: c.id, label: categoryLabel(c.id, categories) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  // Ignore a parent that has since been archived.
  const parent = outline.some((e) => e.category.id === parentId) ? parentId : ''
  const editing = categories.find((c) => c.id === editingId && c.archivedAt === null)

  const line = (category: Category, depth: number) => (
    <li key={category.id}>
      <button
        type="button"
        className="line"
        style={{ paddingLeft: `${depth * 1.4}rem` }}
        aria-label={`Edit ${category.name}`}
        onClick={() => setEditingId(category.id)}
      >
        <Mark id={category.id} categories={categories} />
        <span className="lbl">
          <span className="what">{category.name}</span>
        </span>
        {/* The ink is named as well as shown; an activity that follows its group says Edit instead. */}
        <span className="go">{isInkId(category.color) ? inkName(resolveInk(category.id, categories)) : 'Edit'}</span>
      </button>
    </li>
  )

  return (
    <>
      {outline.length === 0 ? (
        <p className="prose">
          No activities yet. Add one for anything you want to keep time for. An activity can stand on its own, or sit
          inside another to form a group, such as Violin inside Music. Activities can be moved later.
        </p>
      ) : (
        <ul className="plain" data-testid="activity-list">
          {outline.map(({ category, depth }) => line(category, depth))}
        </ul>
      )}

      <form
        className="addform"
        aria-label="Add activity"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await createCategory(db, { name, parentId: parent === '' ? null : parent }, Date.now())
            setName('')
          })
        }}
      >
        <label className="field">
          <span>New activity name</span>
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
          <select className="input" value={parent} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nothing (on its own)</option>
            <CategoryOptions categories={categories} allow={(c) => depthOf(c.id, categories) < MAX_CATEGORY_DEPTH} />
          </select>
        </label>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <button type="submit" className="plate" disabled={busy || name.trim() === ''}>
          Add activity
        </button>
      </form>

      {archived.length > 0 && (
        <details className="fold">
          <summary>Archived ({archived.length})</summary>
          <p className="hint">Archived activities keep their sessions. Restoring a sub-activity also restores its group.</p>
          <ul className="plain">
            {archived.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  className="line"
                  aria-label={`Restore ${label}`}
                  disabled={busy}
                  onClick={() => void run(() => restoreCategory(db, id, Date.now()))}
                >
                  <Mark id={id} categories={categories} open />
                  <CategoryName id={id} categories={categories} />
                  <span className="go">Restore</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <CategoryDialog key={editing.id} category={editing} categories={categories} onClose={() => setEditingId(null)} />
      )}
    </>
  )
}
