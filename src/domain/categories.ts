import type { Category } from './types'

export const MAX_CATEGORY_NAME_LENGTH = 60

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Validates a name/parent pair for a new or renamed category. Returns an error
 * message for the user, or `null` when acceptable. `selfId` is the category
 * being renamed, if any.
 */
export function categoryProblem(
  input: { name: string; parentId: string | null; selfId?: string },
  categories: readonly Category[],
): string | null {
  const name = normalizeCategoryName(input.name)
  if (name === '') return 'Enter a category name.'
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return `Keep the name to ${MAX_CATEGORY_NAME_LENGTH} characters or fewer.`
  }

  if (input.parentId !== null) {
    const parent = categories.find((c) => c.id === input.parentId)
    if (!parent) return 'The parent category no longer exists.'
    if (parent.archivedAt !== null) return 'The parent category is archived.'
    if (parent.parentId !== null) return 'Categories can be nested two levels deep at most.'
  }

  const duplicate = categories.some(
    (c) =>
      c.id !== input.selfId &&
      c.archivedAt === null &&
      c.parentId === input.parentId &&
      c.name.toLowerCase() === name.toLowerCase(),
  )
  return duplicate ? 'A category with this name already exists here.' : null
}

/** `Academics → Mathematics`, or a placeholder if the category is missing. */
export function categoryPath(categoryId: string, categories: readonly Category[]): string {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return 'Unknown category'
  const parent = category.parentId === null ? undefined : categories.find((c) => c.id === category.parentId)
  return parent ? `${parent.name} → ${category.name}` : category.name
}

export interface CategoryNode {
  category: Category
  children: Category[]
}

/** Non-archived categories as a sorted two-level tree. */
export function categoryTree(categories: readonly Category[]): CategoryNode[] {
  const live = categories.filter((c) => c.archivedAt === null)
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)
  return live
    .filter((c) => c.parentId === null)
    .sort(byName)
    .map((category) => ({
      category,
      children: live.filter((c) => c.parentId === category.id).sort(byName),
    }))
}

/**
 * Works out which categories to un-archive when restoring `id`:
 * - a sub-category brings back its archived parent, so it is never orphaned;
 * - a top-level category brings back the sub-categories archived in the same
 *   action as it (same `archivedAt`), but not ones archived separately.
 * Fails if a restored name would clash with a live sibling.
 */
export function restorePlan(
  id: string,
  categories: readonly Category[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const target = categories.find((c) => c.id === id)
  if (!target) return { ok: false, error: 'That category no longer exists.' }
  if (target.archivedAt === null) return { ok: true, ids: [] }

  const restoring: Category[] = [target]
  if (target.parentId === null) {
    restoring.push(...categories.filter((c) => c.parentId === id && c.archivedAt === target.archivedAt))
  } else {
    const parent = categories.find((c) => c.id === target.parentId)
    if (parent && parent.archivedAt !== null) restoring.push(parent)
  }

  const ids = restoring.map((c) => c.id)
  for (const c of restoring) {
    const clash = categories.some(
      (other) =>
        !ids.includes(other.id) &&
        other.archivedAt === null &&
        other.parentId === c.parentId &&
        other.name.toLowerCase() === c.name.toLowerCase(),
    )
    if (clash) {
      return { ok: false, error: `Another category is already named “${c.name}”. Rename that one first, then restore.` }
    }
  }
  return { ok: true, ids }
}
