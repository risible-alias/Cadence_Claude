import { ancestorIds, topLevelId } from './categories'
import type { Category } from './types'

/**
 * The curated palette of category inks, in a fixed order. An ink is a name, not
 * a colour value: the actual light and dark colours live in the stylesheet
 * (`--ink-<id>` in src/styles/tokens.css). To add an ink, append it here and
 * add its two token lines there; nothing else depends on the count.
 *
 * Inks are only a visual aid. Any number of categories can share one, and
 * totals and charts always group by category, never by ink.
 */
export const INKS = [
  { id: 'lapis', name: 'Lapis' },
  { id: 'oxblood', name: 'Oxblood' },
  { id: 'plum', name: 'Plum' },
  { id: 'forest', name: 'Forest' },
  { id: 'brass', name: 'Brass' },
  { id: 'cerulean', name: 'Cerulean' },
] as const

export type InkId = (typeof INKS)[number]['id']

export function isInkId(value: unknown): value is InkId {
  return INKS.some((ink) => ink.id === value)
}

export function inkName(id: InkId): string {
  return INKS.find((ink) => ink.id === id)?.name ?? id
}

/** A category's stored colour must be a known ink or unset. */
export function inkProblem(color: unknown): string | null {
  return color === null || isInkId(color) ? null : 'Choose one of the available inks.'
}

/** Stable last resort for a group with no usable stored ink: depends only on its own id. */
function fallbackInk(id: string): InkId {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % INKS.length
  return INKS[sum]!.id
}

/**
 * The category whose ink this one shows: itself if it has an ink of its own,
 * otherwise its nearest ancestor that has one, otherwise its top-level
 * category. Charts that stack by colour group sessions by this, so a coloured
 * segment always stands for exactly one category.
 */
export function inkOwnerId(categoryId: string, categories: readonly Category[]): string {
  const category = categories.find((c) => c.id === categoryId)
  if (!category || isInkId(category.color)) return categoryId
  for (const id of ancestorIds(categoryId, categories)) {
    if (isInkId(categories.find((c) => c.id === id)?.color)) return id
  }
  return topLevelId(categoryId, categories)
}

/**
 * The ink a category is shown in: its own, or else the nearest ancestor's.
 * The result never depends on unrelated categories, so adding, archiving or
 * reordering them cannot change it.
 */
export function resolveInk(categoryId: string, categories: readonly Category[]): InkId {
  const owner = inkOwnerId(categoryId, categories)
  const color = categories.find((c) => c.id === owner)?.color
  return isInkId(color) ? color : fallbackInk(owner)
}

/**
 * The ink to give a new group: the one least used by live categories that
 * have an ink of their own, at any level, earliest in palette order on a tie.
 * Once the palette is exhausted this starts reusing inks evenly.
 */
export function defaultInkFor(categories: readonly Category[]): InkId {
  const uses = new Map<InkId, number>(INKS.map((ink) => [ink.id, 0]))
  for (const c of categories) {
    if (c.archivedAt === null && isInkId(c.color)) uses.set(c.color, uses.get(c.color)! + 1)
  }
  let best: InkId = INKS[0].id
  for (const ink of INKS) if (uses.get(ink.id)! < uses.get(best)!) best = ink.id
  return best
}

/**
 * Gives an ink to every top-level category that lacks a usable one (data from
 * before inks existed, or a backup naming an ink this version does not have).
 * Categories that already have an ink are never touched, and sub-categories are
 * left to inherit. Assignment runs oldest first so the result is repeatable.
 */
export function assignMissingInks(categories: readonly Category[]): Category[] {
  const result = categories.map((c) => ({ ...c }))
  const missing = result
    .filter((c) => c.parentId === null && !isInkId(c.color))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  for (const category of missing) category.color = defaultInkFor(result)
  // A sub-category naming an unknown ink falls back to inheriting.
  for (const c of result) if (c.parentId !== null && !isInkId(c.color)) c.color = null
  return result
}
