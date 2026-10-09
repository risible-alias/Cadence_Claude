import { describe, expect, it } from 'vitest'
import { applyReflection, EMPTY_REFLECTION, hasReflection, isRating, reflectionOf, reflectionProblems } from './reflections'
import { finishSession, startSession } from './timer'

const T0 = Date.parse('2026-01-10T09:00:00Z')
const session = finishSession(startSession({ id: 's1', categoryId: 'c1', nowMs: T0 }), T0 + 60_000)

describe('isRating', () => {
  it('accepts whole numbers 1 to 10 only', () => {
    expect([1, 5, 10].every(isRating)).toBe(true)
    for (const bad of [0, 11, -3, 5.5, NaN, '5', null, undefined, true]) expect(isRating(bad)).toBe(false)
  })
})

describe('reflectionProblems', () => {
  it('accepts every field unanswered', () => {
    expect(reflectionProblems(EMPTY_REFLECTION)).toEqual([])
  })

  it('accepts any single field on its own', () => {
    expect(reflectionProblems({ ...EMPTY_REFLECTION, concentration: 7 })).toEqual([])
    expect(reflectionProblems({ ...EMPTY_REFLECTION, fatigue: 1 })).toEqual([])
    expect(reflectionProblems({ ...EMPTY_REFLECTION, notes: 'Hard going.' })).toEqual([])
  })

  it('rejects out-of-range, fractional and non-numeric ratings independently', () => {
    expect(reflectionProblems({ concentration: 0, fatigue: null, notes: null })).toHaveLength(1)
    expect(reflectionProblems({ concentration: null, fatigue: 11, notes: null })).toHaveLength(1)
    expect(reflectionProblems({ concentration: 7.5, fatigue: '3', notes: null })).toHaveLength(2)
  })

  it('rejects overlong or non-text notes', () => {
    expect(reflectionProblems({ ...EMPTY_REFLECTION, notes: 'x'.repeat(2001) })).toHaveLength(1)
    expect(reflectionProblems({ ...EMPTY_REFLECTION, notes: 42 })).toEqual(['Notes must be text.'])
  })
})

describe('applyReflection', () => {
  it('a finished session starts with nothing answered', () => {
    expect(reflectionOf(session)).toEqual(EMPTY_REFLECTION)
    expect(hasReflection(session)).toBe(false)
  })

  it('stores one field and leaves the others unanswered, not zero', () => {
    const updated = applyReflection(session, { concentration: null, fatigue: 4, notes: null }, T0 + 120_000)
    expect(reflectionOf(updated)).toEqual({ concentration: null, fatigue: 4, notes: null })
    expect(hasReflection(updated)).toBe(true)
    expect(updated.updatedAt).toBe('2026-01-10T09:02:00.000Z')
  })

  it('trims notes and stores blank notes as unanswered', () => {
    expect(applyReflection(session, { ...EMPTY_REFLECTION, notes: '  good  ' }, T0).notes).toBe('good')
    expect(applyReflection(session, { ...EMPTY_REFLECTION, notes: '   ' }, T0).notes).toBeNull()
  })

  it('can clear answers back to unanswered without touching times', () => {
    const answered = applyReflection(session, { concentration: 8, fatigue: 2, notes: 'x' }, T0)
    const cleared = applyReflection(answered, EMPTY_REFLECTION, T0)
    expect(reflectionOf(cleared)).toEqual(EMPTY_REFLECTION)
    expect(cleared).toMatchObject({ startedAt: session.startedAt, endedAt: session.endedAt, id: 's1' })
  })

  it('does not mutate the original', () => {
    const snapshot = structuredClone(session)
    applyReflection(session, { concentration: 3, fatigue: 3, notes: 'n' }, T0)
    expect(session).toEqual(snapshot)
  })
})
