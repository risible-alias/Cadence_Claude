import { useState } from 'react'
import { useAction } from '../../app/hooks'
import { Button } from '../../components/Button'
import { cardClass, errorClass, inputClass, labelClass, mutedClass, selectClass } from '../../components/fields'
import { db } from '../../db/db'
import { archiveCategory, createCategory, renameCategory, restoreCategory } from '../../db/repo'
import { categoryPath, categoryTree, MAX_CATEGORY_NAME_LENGTH } from '../../domain/categories'
import type { Category } from '../../domain/types'

type RowMode = { kind: 'rename'; id: string; name: string } | { kind: 'archive'; id: string } | null

export function CategoryManager({
  categories,
  onCreated,
}: {
  categories: Category[]
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [mode, setMode] = useState<RowMode>(null)
  const { busy, error, run } = useAction()
  const tree = categoryTree(categories)
  const archived = categories
    .filter((c) => c.archivedAt !== null)
    .map((c) => ({ id: c.id, path: categoryPath(c.id, categories) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  // Ignore a parent that has since been archived.
  const parent = tree.some((n) => n.category.id === parentId) ? parentId : ''

  const row = (category: Category, hasChildren: boolean) => {
    if (mode?.kind === 'rename' && mode.id === category.id) {
      return (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await renameCategory(db, category.id, mode.name, Date.now())
              setMode(null)
            })
          }}
        >
          <input
            aria-label={`New name for ${category.name}`}
            className={`${inputClass} min-w-0 flex-1 basis-40`}
            value={mode.name}
            onChange={(e) => setMode({ ...mode, name: e.target.value })}
            maxLength={MAX_CATEGORY_NAME_LENGTH}
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          <Button onClick={() => setMode(null)}>Cancel</Button>
        </form>
      )
    }
    if (mode?.kind === 'archive' && mode.id === category.id) {
      return (
        <div role="group" aria-label={`Archive ${category.name}`} className="grid gap-2">
          <p className="text-base">
            Archive “{category.name}”{hasChildren ? ' and its sub-categories' : ''}? Saved sessions are kept.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void run(async () => {
                await archiveCategory(db, category.id, Date.now())
                setMode(null)
              })}
            >
              Archive
            </Button>
            <Button autoFocus onClick={() => setMode(null)}>
              Keep
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-base">{category.name}</span>
        <span className="flex shrink-0 gap-1">
          <Button
            className="px-3 text-sm"
            aria-label={`Rename ${category.name}`}
            onClick={() => setMode({ kind: 'rename', id: category.id, name: category.name })}
          >
            Rename
          </Button>
          <Button
            className="px-3 text-sm"
            aria-label={`Archive ${category.name}`}
            onClick={() => setMode({ kind: 'archive', id: category.id })}
          >
            Archive
          </Button>
        </span>
      </div>
    )
  }

  return (
    <section className={cardClass} aria-labelledby="categories-heading">
      <h2 id="categories-heading" className="mb-3 text-lg font-semibold">
        Categories
      </h2>

      {tree.length === 0 ? (
        <p className={`mb-4 ${mutedClass}`}>
          No categories yet. Add one for anything you want to track, such as a subject or an instrument.
        </p>
      ) : (
        <ul className="mb-4 grid gap-2">
          {tree.map(({ category, children }) => (
            <li key={category.id} className="grid gap-2">
              {row(category, children.length > 0)}
              {children.length > 0 && (
                <ul className="ml-3 grid gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
                  {children.map((child) => (
                    <li key={child.id}>{row(child, false)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3"
        aria-label="Add category"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const created = await createCategory(db, { name, parentId: parent === '' ? null : parent }, Date.now())
            setName('')
            onCreated(created.id)
          })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="category-name" className={labelClass}>
              New category name
            </label>
            <input
              id="category-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="category-parent" className={labelClass}>
              Inside
            </label>
            <select
              id="category-parent"
              className={selectClass}
              value={parent}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None (top level)</option>
              {tree.map(({ category }) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || name.trim() === ''}>
          Add category
        </Button>
      </form>

      {archived.length > 0 && (
        <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
          <summary className="min-h-11 cursor-pointer content-center text-base font-medium">
            Archived ({archived.length})
          </summary>
          <p className={`mb-2 ${mutedClass}`}>
            Archived categories keep their sessions. Restoring a sub-category also restores its parent.
          </p>
          <ul className="grid gap-2">
            {archived.map(({ id, path }) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-base">{path}</span>
                <Button
                  className="shrink-0 px-3 text-sm"
                  aria-label={`Restore ${path}`}
                  disabled={busy}
                  onClick={() => void run(() => restoreCategory(db, id, Date.now()))}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
