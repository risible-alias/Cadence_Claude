import { categoryLabel, categoryOutline } from '../domain/categories'
import type { Category } from '../domain/types'

/**
 * `<option>`s for every live category, in outline order (each followed by
 * those inside it), labelled with the specific name first and its immediate
 * parent after: "Violin — Music". `allow` can leave some out.
 */
export function CategoryOptions({
  categories,
  allow = () => true,
  wholeGroup = false,
}: {
  categories: readonly Category[]
  allow?: (category: Category) => boolean
  /** Mark categories with others inside as covering the whole group (for filters). */
  wholeGroup?: boolean
}) {
  return (
    <>
      {categoryOutline(categories)
        .filter(({ category }) => allow(category))
        .map(({ category, hasChildren }) => (
          <option key={category.id} value={category.id}>
            {categoryLabel(category.id, categories)}
            {wholeGroup && hasChildren ? ' (whole group)' : ''}
          </option>
        ))}
    </>
  )
}
