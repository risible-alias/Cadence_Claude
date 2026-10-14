import { describe, expect, it } from 'vitest'
import {
  ancestorIds,
  categoryLabel,
  categoryOutline,
  categoryParts,
  categoryProblem,
  depthOf,
  descendantIds,
  MAX_CATEGORY_DEPTH,
  moveProblem,
  placementProblem,
  restorePlan,
  topLevelId,
} from './categories'
import type { Category } from './types'

const cat = (id: string, name: string, parentId: string | null = null, archived = false): Category => ({
  id,
  name,
  parentId,
  color: null,
  archivedAt: archived ? '2026-01-02T00:00:00.000Z' : null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const categories = [cat('a', 'Academics'), cat('m', 'Mathematics', 'a'), cat('v', 'Violin'), cat('old', 'Old', null, true)]

describe('categoryProblem', () => {
  it('accepts a new top-level or second-level name', () => {
    expect(categoryProblem({ name: 'Reading', parentId: null }, categories)).toBeNull()
    expect(categoryProblem({ name: 'Physics', parentId: 'a' }, categories)).toBeNull()
  })

  it('rejects blank names', () => {
    expect(categoryProblem({ name: '   ', parentId: null }, categories)).toMatch(/name/)
  })

  it('rejects missing or archived parents', () => {
    expect(categoryProblem({ name: 'X', parentId: 'nope' }, categories)).toMatch(/no longer exists/)
    expect(categoryProblem({ name: 'X', parentId: 'old' }, categories)).toMatch(/archived/)
  })

  it('rejects duplicate sibling names case-insensitively, but allows them elsewhere', () => {
    expect(categoryProblem({ name: ' violin ', parentId: null }, categories)).toMatch(/already exists/)
    expect(categoryProblem({ name: 'Violin', parentId: 'a' }, categories)).toBeNull()
    expect(categoryProblem({ name: 'Old', parentId: null }, categories)).toBeNull()
  })

  it('lets a category keep its own name when renamed', () => {
    expect(categoryProblem({ name: 'VIOLIN', parentId: null, selfId: 'v' }, categories)).toBeNull()
  })
})

describe('labels and tree', () => {
  it('puts the specific name first, then its group, including for archived categories', () => {
    expect(categoryLabel('m', categories)).toBe('Mathematics — Academics')
    expect(categoryParts('m', categories)).toEqual({ name: 'Mathematics', parent: 'Academics' })
    expect(categoryLabel('old', categories)).toBe('Old')
    expect(categoryLabel('gone', categories)).toBe('Unknown activity')
  })

  it('finds the top-level category', () => {
    expect(topLevelId('m', categories)).toBe('a')
    expect(topLevelId('v', categories)).toBe('v')
  })

  it('builds a sorted outline without archived categories', () => {
    expect(categoryOutline(categories).map((e) => [e.category.name, e.depth, e.hasChildren])).toEqual([
      ['Academics', 0, true],
      ['Mathematics', 1, false],
      ['Violin', 0, false],
    ])
    expect(categoryOutline(categories, { includeArchived: true }).map((e) => e.category.name)).toContain('Old')
  })
})

describe('restorePlan', () => {
  const T1 = '2026-01-02T00:00:00.000Z'
  const T2 = '2026-01-03T00:00:00.000Z'
  const archivedAt = (c: Category, at: string | null): Category => ({ ...c, archivedAt: at })

  it('restores a top-level category on its own', () => {
    expect(restorePlan('old', categories)).toEqual({ ok: true, ids: ['old'] })
  })

  it('does nothing for a category that is not archived', () => {
    expect(restorePlan('v', categories)).toEqual({ ok: true, ids: [] })
    expect(restorePlan('gone', categories).ok).toBe(false)
  })

  it('brings back sub-categories archived together with the parent, not ones archived earlier', () => {
    const list = [
      archivedAt(cat('a', 'Academics'), T2),
      archivedAt(cat('m', 'Mathematics', 'a'), T2),
      archivedAt(cat('p', 'Physics', 'a'), T1),
    ]
    expect(restorePlan('a', list)).toEqual({ ok: true, ids: ['a', 'm'] })
  })

  it('brings back an archived parent when a sub-category is restored', () => {
    const list = [archivedAt(cat('a', 'Academics'), T2), archivedAt(cat('m', 'Mathematics', 'a'), T2)]
    expect(restorePlan('m', list)).toEqual({ ok: true, ids: ['m', 'a'] })
    const liveParent = [cat('a', 'Academics'), archivedAt(cat('m', 'Mathematics', 'a'), T1)]
    expect(restorePlan('m', liveParent)).toEqual({ ok: true, ids: ['m'] })
  })

  it('refuses when a live sibling has taken the name', () => {
    const list = [...categories, cat('old2', 'old')]
    const plan = restorePlan('old', list)
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.error).toMatch(/already named/)
  })
})

// Learning ─ Science ─ Physics ─ Optics
//          └ Music ─ Violin
// Reading (archived child: Novels)
const deep = [
  cat('learning', 'Learning'),
  cat('science', 'Science', 'learning'),
  cat('physics', 'Physics', 'science'),
  cat('optics', 'Optics', 'physics'),
  cat('music', 'Music', 'learning'),
  cat('violin', 'Violin', 'music'),
  cat('reading', 'Reading'),
  cat('novels', 'Novels', 'reading', true),
]

describe('walking the tree at any depth', () => {
  it('lists ancestors nearest first and descendants at every level', () => {
    expect(ancestorIds('optics', deep)).toEqual(['physics', 'science', 'learning'])
    expect(ancestorIds('learning', deep)).toEqual([])
    expect(descendantIds('learning', deep).sort()).toEqual(['music', 'optics', 'physics', 'science', 'violin'])
    expect(descendantIds('reading', deep)).toEqual(['novels'])
    expect(depthOf('optics', deep)).toBe(4)
    expect(topLevelId('optics', deep)).toBe('learning')
  })

  it('outlines every level in order', () => {
    expect(categoryOutline(deep).map((e) => `${'.'.repeat(e.depth)}${e.category.name}`)).toEqual([
      'Learning', '.Music', '..Violin', '.Science', '..Physics', '...Optics', 'Reading',
    ])
  })

  it('stops instead of looping on damaged data with a cycle', () => {
    const loop = [cat('a', 'A', 'b'), cat('b', 'B', 'a')]
    expect(ancestorIds('a', loop)).toEqual(['b'])
    expect(descendantIds('a', loop)).toEqual(['b'])
    expect(categoryOutline(loop)).toEqual([])
  })

  it('allows new categories down to the depth limit', () => {
    const chain = Array.from({ length: MAX_CATEGORY_DEPTH }, (_, i) => cat(`l${i}`, `L${i}`, i === 0 ? null : `l${i - 1}`))
    expect(categoryProblem({ name: 'Too deep', parentId: `l${MAX_CATEGORY_DEPTH - 1}` }, chain)).toMatch(/levels deep/)
    expect(categoryProblem({ name: 'Fits', parentId: `l${MAX_CATEGORY_DEPTH - 2}` }, chain)).toBeNull()
  })
})

describe('moveProblem', () => {
  it('allows moving under another category, to the top level, or nowhere at all', () => {
    expect(moveProblem('science', 'reading', deep)).toBeNull()
    expect(moveProblem('violin', null, deep)).toBeNull()
    expect(moveProblem('science', 'learning', deep)).toBeNull()
  })

  it('refuses self-parenting and any cycle', () => {
    expect(moveProblem('science', 'science', deep)).toMatch(/inside itself/)
    expect(moveProblem('learning', 'optics', deep)).toMatch(/cannot go inside Optics, which is inside it/)
    expect(moveProblem('science', 'physics', deep)).toMatch(/which is inside it/)
  })

  it('refuses missing and archived parents', () => {
    expect(moveProblem('violin', 'gone', deep)).toMatch(/no longer exists/)
    expect(moveProblem('violin', 'novels', deep)).toMatch(/archived/)
    expect(moveProblem('gone', null, deep)).toMatch(/no longer exists/)
  })

  it('refuses a move that would nest too deep, counting what comes along', () => {
    // Science carries three levels (Science, Physics, Optics); under Violin it would end at level 6.
    expect(moveProblem('science', 'violin', deep)).toMatch(/levels deep/)
    expect(moveProblem('optics', 'violin', deep)).toBeNull()
  })

  it('separates where a category may go from what it is called', () => {
    const clash = [...deep, cat('other-music', 'music')]
    expect(placementProblem('music', null, clash)).toBeNull()
    expect(placementProblem('learning', 'violin', clash)).toMatch(/which is inside it/)
  })

  it('refuses a name already used where it would land', () => {
    const clash = [...deep, cat('other-music', 'music')]
    expect(moveProblem('music', null, clash)).toMatch(/already exists/)
    expect(moveProblem('music', null, clash, 'Music practice')).toBeNull()
  })
})

describe('restorePlan at depth', () => {
  const T1 = '2026-01-02T00:00:00.000Z'
  const T2 = '2026-01-03T00:00:00.000Z'
  const archived = (c: Category, at: string) => ({ ...c, archivedAt: at })

  it('brings back every archived ancestor so nothing is orphaned', () => {
    const list = deep.map((c) => (['learning', 'science', 'physics', 'optics'].includes(c.id) ? archived(c, T2) : c))
    const plan = restorePlan('optics', list)
    expect(plan.ok && plan.ids.sort()).toEqual(['learning', 'optics', 'physics', 'science'])
  })

  it('brings back what was archived with it at every depth, not what was archived separately', () => {
    const list = deep.map((c) =>
      ['science', 'physics'].includes(c.id) ? archived(c, T2) : c.id === 'optics' ? archived(c, T1) : c,
    )
    const plan = restorePlan('science', list)
    expect(plan.ok && plan.ids.sort()).toEqual(['physics', 'science'])
  })
})
