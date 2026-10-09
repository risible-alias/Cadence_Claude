import { intervalProblems, toIso } from './time'
import { activeSessionProblem } from './timer'
import type { ActiveSession, Category, Interval, Session } from './types'

export const BACKUP_FORMAT = 'cadence-backup'
/** Version of the backup file layout. Independent of the app and database versions. */
export const BACKUP_SCHEMA_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  exportedAt: string
  categories: Category[]
  sessions: Session[]
  /**
   * The timer in progress when the backup was made, kept so the export is
   * complete. It is informational: restoring never revives it as a live timer.
   */
  activeSession: ActiveSession | null
}

export function buildBackup(
  data: { categories: Category[]; sessions: Session[]; activeSession: ActiveSession | null },
  nowMs: number,
): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: toIso(nowMs),
    categories: data.categories,
    sessions: data.sessions,
    activeSession: data.activeSession,
  }
}

export type BackupResult = { ok: true; backup: Backup } | { ok: false; errors: string[] }

const MAX_ERRORS = 20
const EARLIEST_MS = Date.UTC(2000, 0, 1)
const DAY_MS = 86_400_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseBackupText(text: string, nowMs: number): BackupResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] }
  }
  return validateBackup(value, nowMs)
}

/**
 * Checks an untrusted value against the backup format without touching stored
 * data. On success the returned backup is rebuilt from known fields only, with
 * instants normalised to the UTC form the database sorts by.
 */
export function validateBackup(value: unknown, nowMs: number): BackupResult {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This is not a Cadence backup file.'] }
  }
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        typeof value.schemaVersion === 'number' && value.schemaVersion > BACKUP_SCHEMA_VERSION
          ? 'This backup was made by a newer version of Cadence and cannot be read by this one.'
          : 'This backup has an unsupported schema version.',
      ],
    }
  }

  const errors: string[] = []
  const fail = (message: string) => void errors.push(message)
  const latestMs = nowMs + DAY_MS

  /** Returns the normalised instant, or `null` after recording a problem. */
  const instant = (v: unknown, where: string): string | null => {
    const ms = typeof v === 'string' ? Date.parse(v) : NaN
    if (Number.isNaN(ms)) return fail(`${where} is not a valid timestamp.`), null
    if (ms < EARLIEST_MS || ms > latestMs) return fail(`${where} is outside the accepted date range.`), null
    return toIso(ms)
  }
  const nullableString = (v: unknown, where: string): string | null => {
    if (v !== null && typeof v !== 'string') fail(`${where} must be text or null.`)
    return typeof v === 'string' ? v : null
  }
  const rating = (v: unknown, where: string): number | null => {
    if (v === null) return null
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 10) {
      return fail(`${where} must be a whole number from 1 to 10, or null.`), null
    }
    return v
  }
  const pauses = (v: unknown, where: string): Interval[] => {
    if (!Array.isArray(v)) return fail(`${where} has no list of pauses.`), []
    const result: Interval[] = []
    v.forEach((p: unknown, i) => {
      const startedAt = isRecord(p) ? instant(p.startedAt, `${where} pause ${i + 1} start`) : null
      const endedAt = isRecord(p) ? instant(p.endedAt, `${where} pause ${i + 1} end`) : null
      if (!isRecord(p)) fail(`${where} pause ${i + 1} is malformed.`)
      if (startedAt && endedAt) result.push({ startedAt, endedAt })
    })
    return result
  }

  const exportedAt = instant(value.exportedAt, 'The export time')

  const categories: Category[] = []
  if (!Array.isArray(value.categories)) fail('The backup has no list of categories.')
  else {
    value.categories.forEach((c: unknown, i) => {
      const where = `Category ${i + 1}`
      if (!isRecord(c)) return fail(`${where} is malformed.`)
      if (typeof c.id !== 'string' || c.id === '') return fail(`${where} has no id.`)
      if (typeof c.name !== 'string' || c.name.trim() === '') fail(`${where} has no name.`)
      if (c.parentId !== null && typeof c.parentId !== 'string') fail(`${where} has an invalid parent.`)
      const color = nullableString(c.color, `${where} colour`)
      const archivedAt = c.archivedAt === null ? null : instant(c.archivedAt, `${where} archive time`)
      const createdAt = instant(c.createdAt, `${where} creation time`)
      const updatedAt = instant(c.updatedAt, `${where} update time`)
      if (categories.some((existing) => existing.id === c.id)) return fail(`${where} duplicates another category's id.`)
      categories.push({
        id: c.id,
        name: String(c.name).trim(),
        parentId: typeof c.parentId === 'string' ? c.parentId : null,
        color,
        archivedAt,
        createdAt: createdAt ?? '',
        updatedAt: updatedAt ?? '',
      })
    })
    for (const c of categories) {
      if (c.parentId === null) continue
      const parent = categories.find((p) => p.id === c.parentId)
      if (!parent) fail(`Category “${c.name}” refers to a parent that is not in the backup.`)
      else if (parent.parentId !== null) fail(`Category “${c.name}” is nested more than two levels deep.`)
    }
  }
  const categoryIds = new Set(categories.map((c) => c.id))

  const sessions: Session[] = []
  const sessionIds = new Set<string>()
  if (!Array.isArray(value.sessions)) fail('The backup has no list of sessions.')
  else {
    value.sessions.forEach((s: unknown, i) => {
      const where = `Session ${i + 1}`
      if (!isRecord(s)) return fail(`${where} is malformed.`)
      if (typeof s.id !== 'string' || s.id === '') return fail(`${where} has no id.`)
      if (sessionIds.has(s.id)) return fail(`${where} duplicates another session's id.`)
      sessionIds.add(s.id)
      if (typeof s.categoryId !== 'string' || !categoryIds.has(s.categoryId)) {
        fail(`${where} refers to a category that is not in the backup.`)
      }
      const startedAt = instant(s.startedAt, `${where} start`)
      const endedAt = instant(s.endedAt, `${where} end`)
      const pausedIntervals = pauses(s.pausedIntervals, where)
      if (startedAt && endedAt) {
        for (const problem of intervalProblems(startedAt, endedAt, pausedIntervals)) fail(`${where}: ${problem}.`)
      }
      sessions.push({
        id: s.id,
        categoryId: String(s.categoryId),
        title: nullableString(s.title, `${where} title`),
        startedAt: startedAt ?? '',
        endedAt: endedAt ?? '',
        pausedIntervals,
        notes: nullableString(s.notes, `${where} notes`),
        concentration: rating(s.concentration, `${where} concentration`),
        fatigue: rating(s.fatigue, `${where} fatigue`),
        createdAt: instant(s.createdAt, `${where} creation time`) ?? '',
        updatedAt: instant(s.updatedAt, `${where} update time`) ?? '',
      })
    })
  }

  let activeSession: ActiveSession | null = null
  if (value.activeSession !== null && value.activeSession !== undefined) {
    const a = value.activeSession
    const problem = activeSessionProblem(a)
    if (problem) fail(`The unfinished session is malformed (${problem}).`)
    else {
      const v = a as ActiveSession
      if (!categoryIds.has(v.categoryId)) fail('The unfinished session refers to a category that is not in the backup.')
      activeSession = {
        id: v.id,
        categoryId: v.categoryId,
        title: v.title,
        startedAt: instant(v.startedAt, 'The unfinished session start') ?? '',
        pausedIntervals: pauses(v.pausedIntervals, 'The unfinished session'),
        state: v.state,
        pauseStartedAt:
          v.pauseStartedAt === null ? null : instant(v.pauseStartedAt, 'The unfinished session pause start'),
        updatedAt: instant(v.updatedAt, 'The unfinished session update time') ?? '',
      }
    }
  }

  if (errors.length > 0 || exportedAt === null) {
    const shown = errors.slice(0, MAX_ERRORS)
    if (errors.length > MAX_ERRORS) shown.push(`…and ${errors.length - MAX_ERRORS} more problems.`)
    return { ok: false, errors: shown }
  }
  return {
    ok: true,
    backup: { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, categories, sessions, activeSession },
  }
}
