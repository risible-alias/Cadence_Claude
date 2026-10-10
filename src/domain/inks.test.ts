import { describe, expect, it } from 'vitest'
import { assignMissingInks, defaultInkFor, INKS, inkName, inkProblem, isInkId, resolveInk } from './inks'
import type { Category } from './types'

const cat = (id: string, over: Partial<Category> = {}): Category => ({
  id,
  name: id,
  parentId: null,
  color: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('the palette', () => {
  it('has unique ids and recognises only those', () => {
    expect(new Set(INKS.map((i) => i.id)).size).toBe(INKS.length)
    expect(isInkId('lapis')).toBe(true)
    expect(inkName('oxblood')).toBe('Oxblood')
    for (const bad of ['teal', '#2c56ad', '', null, undefined, 3]) expect(isInkId(bad)).toBe(false)
  })

  it('accepts a known ink or none as a stored colour', () => {
    expect(inkProblem('plum')).toBeNull()
    expect(inkProblem(null)).toBeNull()
    expect(inkProblem('#ff0000')).not.toBeNull()
  })
})

describe('resolveInk', () => {
  const categories = [
    cat('music', { color: 'oxblood' }),
    cat('violin', { parentId: 'music' }),
    cat('piano', { parentId: 'music', color: 'brass' }),
    cat('reading', { color: 'plum' }),
  ]

  it('uses a category’s own ink', () => {
    expect(resolveInk('music', categories)).toBe('oxblood')
    expect(resolveInk('reading', categories)).toBe('plum')
  })

  it('lets a sub-category inherit its parent’s ink by default', () => {
    expect(resolveInk('violin', categories)).toBe('oxblood')
  })

  it('lets a sub-category override its parent', () => {
    expect(resolveInk('piano', categories)).toBe('brass')
  })

  it('follows the parent when the parent’s ink changes', () => {
    const changed = categories.map((c) => (c.id === 'music' ? { ...c, color: 'forest' } : c))
    expect(resolveInk('violin', changed)).toBe('forest')
    expect(resolveInk('piano', changed)).toBe('brass')
  })

  it('always returns an ink, even for missing or unassigned categories', () => {
    expect(isInkId(resolveInk('gone', categories))).toBe(true)
    expect(isInkId(resolveInk('x', [cat('x')]))).toBe(true)
    expect(isInkId(resolveInk('x', [cat('x', { color: 'not-an-ink' })]))).toBe(true)
  })

  it('does not change when other categories are added, removed or reordered', () => {
    const before = categories.map((c) => resolveInk(c.id, categories))
    const more = [cat('new', { color: 'lapis' }), ...categories.slice().reverse(), cat('other')]
    expect(categories.map((c) => resolveInk(c.id, more))).toEqual(before)
    const fewer = categories.filter((c) => c.id !== 'reading')
    expect(resolveInk('violin', fewer)).toBe('oxblood')
    // The fallback for an unassigned group depends on nothing but its own id.
    expect(resolveInk('x', [cat('x')])).toBe(resolveInk('x', [cat('a', { color: 'plum' }), cat('x'), cat('b')]))
  })
})

describe('defaultInkFor', () => {
  it('starts with the first ink and takes each unused ink in palette order', () => {
    const categories: Category[] = []
    for (const ink of INKS) {
      expect(defaultInkFor(categories)).toBe(ink.id)
      categories.push(cat(`c-${ink.id}`, { color: ink.id }))
    }
  })

  it('reuses inks evenly once every ink is taken, so categories are not limited by the palette', () => {
    const categories = INKS.map((ink) => cat(`c-${ink.id}`, { color: ink.id }))
    const extra: string[] = []
    for (let i = 0; i < INKS.length * 2; i++) {
      const ink = defaultInkFor(categories)
      extra.push(ink)
      categories.push(cat(`extra-${i}`, { color: ink }))
    }
    expect(extra).toEqual([...INKS, ...INKS].map((i) => i.id))
    expect(categories).toHaveLength(INKS.length * 3)
  })

  it('counts only live top-level categories', () => {
    const categories = [
      cat('a', { color: 'lapis' }),
      cat('gone', { color: 'oxblood', archivedAt: '2026-01-02T00:00:00.000Z' }),
      cat('child', { parentId: 'a', color: 'oxblood' }),
    ]
    expect(defaultInkFor(categories)).toBe('oxblood')
  })
})

describe('assignMissingInks', () => {
  it('fills in top-level categories oldest first and leaves sub-categories inheriting', () => {
    const categories = [
      cat('later', { createdAt: '2026-01-03T00:00:00.000Z' }),
      cat('first', { createdAt: '2026-01-01T00:00:00.000Z' }),
      cat('child', { parentId: 'first', createdAt: '2026-01-02T00:00:00.000Z' }),
      cat('second', { createdAt: '2026-01-02T00:00:00.000Z' }),
    ]
    const result = assignMissingInks(categories)
    expect(result.map((c) => [c.id, c.color])).toEqual([
      ['later', 'plum'],
      ['first', 'lapis'],
      ['child', null],
      ['second', 'oxblood'],
    ])
  })

  it('never changes an ink that is already assigned', () => {
    const categories = [cat('a', { color: 'forest' }), cat('b'), cat('kid', { parentId: 'a', color: 'brass' })]
    const result = assignMissingInks(categories)
    expect(result[0]?.color).toBe('forest')
    expect(result[1]?.color).toBe('lapis')
    expect(result[2]?.color).toBe('brass')
  })

  it('is repeatable and does not mutate its input', () => {
    const categories = [cat('b', { createdAt: '2026-01-02T00:00:00.000Z' }), cat('a')]
    const snapshot = structuredClone(categories)
    const once = assignMissingInks(categories)
    expect(categories).toEqual(snapshot)
    expect(assignMissingInks(once)).toEqual(once)
    expect(assignMissingInks(categories.slice().reverse()).find((c) => c.id === 'a')?.color).toBe(
      once.find((c) => c.id === 'a')?.color,
    )
  })

  it('replaces an ink this version does not know', () => {
    const result = assignMissingInks([cat('a', { color: 'teal' }), cat('kid', { parentId: 'a', color: 'teal' })])
    expect(result.map((c) => c.color)).toEqual(['lapis', null])
  })

  it('gives more categories than inks a valid ink each', () => {
    const many = Array.from({ length: 23 }, (_, i) => cat(`c${String(i).padStart(2, '0')}`, { createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }))
    const result = assignMissingInks(many)
    expect(result.every((c) => isInkId(c.color))).toBe(true)
    expect(result.slice(0, 7).map((c) => c.color)).toEqual(['lapis', 'oxblood', 'plum', 'forest', 'brass', 'cerulean', 'lapis'])
  })
})
