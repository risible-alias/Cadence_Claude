import type { Category } from './types'

export const MAX_CATEGORY_NAME_LENGTH = 60
/** How deep activities may nest, counting a top-level one as level 1. */
export const MAX_CATEGORY_DEPTH = 5
/** Every walk up or down the tree stops here, so damaged data with a cycle cannot hang the app. */
const WALK_LIMIT = 64

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Parent, grandparent and so on, nearest first. Stops at a missing parent or a cycle. */
export function ancestorIds(categoryId: string, categories: readonly Category[]): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const out: string[] = []
  let current = byId.get(categoryId)?.parentId ?? null
  while (current !== null && current !== categoryId && !out.includes(current) && out.length < WALK_LIMIT) {
    const parent = byId.get(current)
    if (!parent) break
    out.push(current)
    current = parent.parentId
  }
  return out
}

/** Every category inside this one, at any depth, archived ones included. */
export function descendantIds(categoryId: string, categories: readonly Category[]): string[] {
  const found = new Set<string>()
  let level = [categoryId]
  for (let i = 0; i < WALK_LIMIT && level.length > 0; i++) {
    const next: string[] = []
    for (const c of categories) {
      if (c.parentId !== null && level.includes(c.parentId) && c.id !== categoryId && !found.has(c.id)) {
        found.add(c.id)
        next.push(c.id)
      }
    }
    level = next
  }
  return [...found]
}

/** 1 for a top-level category, 2 for one inside it, and so on. */
export function depthOf(categoryId: string, categories: readonly Category[]): number {
  return ancestorIds(categoryId, categories).length + 1
}

/** Levels a category occupies including everything inside it: 1 when it has nothing inside. */
function heightOf(categoryId: string, categories: readonly Category[]): number {
  const base = depthOf(categoryId, categories)
  return descendantIds(categoryId, categories).reduce((max, id) => Math.max(max, depthOf(id, categories) - base + 1), 1)
}

/** The top-level category a category belongs to (itself, if it has no parent). */
export function topLevelId(categoryId: string, categories: readonly Category[]): string {
  return ancestorIds(categoryId, categories).at(-1) ?? categoryId
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
    if (input.selfId === undefined && depthOf(parent.id, categories) >= MAX_CATEGORY_DEPTH) {
      return `Activities can be nested ${MAX_CATEGORY_DEPTH} levels deep at most.`
    }
  }

  return nameClash(name, input.parentId, input.selfId, categories)
}

function nameClash(name: string, parentId: string | null, selfId: string | undefined, categories: readonly Category[]) {
  const duplicate = categories.some(
    (c) =>
      c.id !== selfId &&
      c.archivedAt === null &&
      c.parentId === parentId &&
      c.name.toLowerCase() === normalizeCategoryName(name).toLowerCase(),
  )
  return duplicate ? 'A category with this name already exists here.' : null
}

/**
 * Whether the tree allows moving a category under `parentId` (or to the top
 * level, with `null`): never into itself or anything inside it, never under a
 * missing or archived parent, never deeper than the limit. Names are not
 * considered; see `moveProblem`.
 */
export function placementProblem(categoryId: string, parentId: string | null, categories: readonly Category[]): string | null {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return 'That category no longer exists.'
  if (parentId === category.parentId || parentId === null) return null
  if (parentId === categoryId) return 'An activity cannot be inside itself.'
  const parent = categories.find((c) => c.id === parentId)
  if (!parent) return 'The chosen parent no longer exists.'
  if (parent.archivedAt !== null) return 'The chosen parent is archived.'
  if (descendantIds(categoryId, categories).includes(parentId)) {
    return `${category.name} cannot go inside ${parent.name}, which is inside it.`
  }
  if (depthOf(parentId, categories) + heightOf(categoryId, categories) > MAX_CATEGORY_DEPTH) {
    return `That would nest activities more than ${MAX_CATEGORY_DEPTH} levels deep.`
  }
  return null
}

/**
 * Whether a category may be moved under `parentId` (or to the top level, with
 * `null`), keeping `name`. Moving to where it already is is always allowed.
 * Refuses anything that would make a category its own ancestor.
 */
export function moveProblem(
  categoryId: string,
  parentId: string | null,
  categories: readonly Category[],
  name?: string,
): string | null {
  const placement = placementProblem(categoryId, parentId, categories)
  if (placement) return placement
  const category = categories.find((c) => c.id === categoryId)!
  if (parentId === category.parentId) return null
  return nameClash(name ?? category.name, parentId, categoryId, categories)
}

/** A category's own name and, for a sub-category, its parent's. */
export function categoryParts(categoryId: string, categories: readonly Category[]): { name: string; parent: string | null } {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { name: 'Unknown activity', parent: null }
  const parent = category.parentId === null ? undefined : categories.find((c) => c.id === category.parentId)
  return { name: category.name, parent: parent?.name ?? null }
}

/** `Mathematics — Academics`: the specific name first, then its immediate parent. */
export function categoryLabel(categoryId: string, categories: readonly Category[]): string {
  const { name, parent } = categoryParts(categoryId, categories)
  return parent ? `${name} — ${parent}` : name
}

export interface OutlineEntry {
  category: Category
  /** 0 for a top-level category. */
  depth: number
  hasChildren: boolean
}

/**
 * The categories as an indented outline: each followed by those inside it,
 * siblings by name. Archived categories are left out unless asked for; a
 * category whose parent is missing or excluded is listed at the top level.
 */
export function categoryOutline(categories: readonly Category[], { includeArchived = false } = {}): OutlineEntry[] {
  const shown = categories.filter((c) => includeArchived || c.archivedAt === null)
  const shownIds = new Set(shown.map((c) => c.id))
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)
  const out: OutlineEntry[] = []
  const seen = new Set<string>()
  const visit = (category: Category, depth: number) => {
    if (seen.has(category.id) || depth > WALK_LIMIT) return
    seen.add(category.id)
    const children = shown.filter((c) => c.parentId === category.id).sort(byName)
    out.push({ category, depth, hasChildren: children.length > 0 })
    for (const child of children) visit(child, depth + 1)
  }
  for (const root of shown.filter((c) => c.parentId === null || !shownIds.has(c.parentId)).sort(byName)) visit(root, 0)
  return out
}

/**
 * Works out which categories to un-archive when restoring `id`:
 * - every archived ancestor comes back too, so it is never left orphaned;
 * - categories inside it that were archived in the same action (same
 *   `archivedAt`) come back with it; ones archived separately stay archived.
 * Fails if a restored name would clash with a live sibling.
 */
export function restorePlan(
  id: string,
  categories: readonly Category[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const target = categories.find((c) => c.id === id)
  if (!target) return { ok: false, error: 'That category no longer exists.' }
  if (target.archivedAt === null) return { ok: true, ids: [] }

  const find = (cid: string) => categories.find((c) => c.id === cid)!
  const restoring: Category[] = [target]
  for (const ancestor of ancestorIds(id, categories).map(find)) if (ancestor.archivedAt !== null) restoring.push(ancestor)
  for (const inside of descendantIds(id, categories).map(find)) {
    if (inside.archivedAt === target.archivedAt) restoring.push(inside)
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
