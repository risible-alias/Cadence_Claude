import { categoryParts } from '../domain/categories'
import { resolveInk } from '../domain/inks'
import type { Category } from '../domain/types'

/** The class that sets `--c` and `--c-tint` to a category's ink. */
export function inkClass(categoryId: string, categories: readonly Category[]): string {
  return `ink-${resolveInk(categoryId, categories)}`
}

/** A small square of the category's ink. Always beside a name, never in place of one. */
export function Mark({ id, categories, open = false }: { id: string; categories: readonly Category[]; open?: boolean }) {
  return <i className={`mark ${inkClass(id, categories)}${open ? ' open' : ''}`} aria-hidden="true" />
}

/** "Violin — Music": the specific name carries the weight, its group follows quietly. */
export function CategoryName({ id, categories }: { id: string; categories: readonly Category[] }) {
  const { name, parent } = categoryParts(id, categories)
  return (
    <span className="lbl">
      <span className="what">{name}</span>
      {parent && <span className="of"> — {parent}</span>}
    </span>
  )
}
