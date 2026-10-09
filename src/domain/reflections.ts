import { toIso } from './time'
import type { Session } from './types'

/**
 * The optional self-report on a session. Each field is independent, and
 * `null` always means "not answered" — never zero or a default.
 */
export interface Reflection {
  concentration: number | null
  fatigue: number | null
  notes: string | null
}

export const RATING_MIN = 1
export const RATING_MAX = 10
export const MAX_NOTES_LENGTH = 2000

export const EMPTY_REFLECTION: Reflection = { concentration: null, fatigue: null, notes: null }

export function isRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX
}

/** Problems that must block saving. Values are checked as given, never coerced. */
export function reflectionProblems(reflection: { concentration: unknown; fatigue: unknown; notes: unknown }): string[] {
  const problems: string[] = []
  const range = `a whole number from ${RATING_MIN} to ${RATING_MAX}`
  if (reflection.concentration !== null && !isRating(reflection.concentration)) {
    problems.push(`Concentration must be ${range}, or left unanswered.`)
  }
  if (reflection.fatigue !== null && !isRating(reflection.fatigue)) {
    problems.push(`Mental fatigue must be ${range}, or left unanswered.`)
  }
  if (reflection.notes !== null && typeof reflection.notes !== 'string') problems.push('Notes must be text.')
  else if (typeof reflection.notes === 'string' && reflection.notes.trim().length > MAX_NOTES_LENGTH) {
    problems.push(`Keep notes to ${MAX_NOTES_LENGTH} characters or fewer.`)
  }
  return problems
}

export function reflectionOf(session: Session): Reflection {
  return { concentration: session.concentration, fatigue: session.fatigue, notes: session.notes }
}

export function hasReflection(session: Session): boolean {
  return session.concentration !== null || session.fatigue !== null || session.notes !== null
}

/** Sets the reflection on a session; blank notes are stored as unanswered. */
export function applyReflection(session: Session, reflection: Reflection, nowMs: number): Session {
  return {
    ...session,
    concentration: reflection.concentration,
    fatigue: reflection.fatigue,
    notes: reflection.notes?.trim() || null,
    updatedAt: toIso(nowMs),
  }
}
