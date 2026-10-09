import { describe, expect, it } from 'vitest'
import { categoryPath, categoryProblem, categoryTree, restorePlan } from './categories'
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

  it('rejects a third level, and missing or archived parents', () => {
    expect(categoryProblem({ name: 'Algebra', parentId: 'm' }, categories)).toMatch(/two levels/)
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

describe('categoryPath and categoryTree', () => {
  it('shows the parent in the path, including for archived categories', () => {
    expect(categoryPath('m', categories)).toBe('Academics → Mathematics')
    expect(categoryPath('old', categories)).toBe('Old')
    expect(categoryPath('gone', categories)).toBe('Unknown category')
  })

  it('builds a sorted tree without archived categories', () => {
    const tree = categoryTree(categories)
    expect(tree.map((n) => n.category.name)).toEqual(['Academics', 'Violin'])
    expect(tree[0]?.children.map((c) => c.name)).toEqual(['Mathematics'])
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
