import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { CategoryName, Mark } from '../../components/Category'
import { db } from '../../db/db'
import { createCategory, restoreCategory } from '../../db/repo'
import { categoryLabel, categoryTree, MAX_CATEGORY_NAME_LENGTH } from '../../domain/categories'
import { inkName, isInkId, resolveInk } from '../../domain/inks'
import type { Category } from '../../domain/types'
import { CategoryDialog } from './CategoryDialog'

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const tree = categoryTree(categories)
  const archived = categories
    .filter((c) => c.archivedAt !== null)
    .map((c) => ({ id: c.id, label: categoryLabel(c.id, categories) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  // Ignore a parent that has since been archived.
  const parent = tree.some((n) => n.category.id === parentId) ? parentId : ''
  const editing = categories.find((c) => c.id === editingId && c.archivedAt === null)

  const line = (category: Category, inner: boolean) => (
    <li key={category.id}>
      <button
        type="button"
        className={`line${inner ? ' inner' : ''}`}
        aria-label={`Edit ${category.name}`}
        onClick={() => setEditingId(category.id)}
      >
        <Mark id={category.id} categories={categories} />
        <span className="lbl">
          <span className="what">{category.name}</span>
        </span>
        {/* The ink is named as well as shown. A sub-activity only names one it does not inherit. */}
        <span className="go">
          {inner && !isInkId(category.color) ? 'Edit' : inkName(resolveInk(category.id, categories))}
        </span>
      </button>
    </li>
  )

  return (
    <>
      {tree.length === 0 ? (
        <p className="prose">
          No activities yet. Add one for anything you want to keep time for. An activity can stand on its own, or sit
          inside another to form a group, such as Violin inside Music.
        </p>
      ) : (
        <ul className="plain" data-testid="activity-list">
          {tree.flatMap(({ category, children }) => [line(category, false), ...children.map((child) => line(child, true))])}
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
            {tree.map(({ category }) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
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
