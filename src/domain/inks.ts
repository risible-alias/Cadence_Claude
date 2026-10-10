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
 * The ink a category is shown in. A category's own ink wins; otherwise a
 * sub-category takes its parent's. The result never depends on which other
 * categories exist, so adding, archiving or reordering them cannot change it.
 */
export function resolveInk(categoryId: string, categories: readonly Category[]): InkId {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return fallbackInk(categoryId)
  if (isInkId(category.color)) return category.color
  if (category.parentId !== null) {
    const parent = categories.find((c) => c.id === category.parentId)
    if (parent) return isInkId(parent.color) ? parent.color : fallbackInk(parent.id)
  }
  return fallbackInk(category.id)
}

/**
 * The ink to give a new top-level category: the one least used by the other
 * live top-level categories, earliest in palette order on a tie. Once the
 * palette is exhausted this starts reusing inks evenly.
 */
export function defaultInkFor(categories: readonly Category[]): InkId {
  const uses = new Map<InkId, number>(INKS.map((ink) => [ink.id, 0]))
  for (const c of categories) {
    if (c.parentId === null && c.archivedAt === null && isInkId(c.color)) uses.set(c.color, uses.get(c.color)! + 1)
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
