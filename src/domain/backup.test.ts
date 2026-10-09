import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, buildBackup, parseBackupText, validateBackup, type Backup } from './backup'
import type { ActiveSession, Category, Session } from './types'

const NOW = Date.parse('2026-01-12T12:00:00Z')

const parent: Category = {
  id: 'c-academics',
  name: 'Academics',
  parentId: null,
  color: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const child: Category = { ...parent, id: 'c-maths', name: 'Mathematics', parentId: 'c-academics', archivedAt: '2026-01-05T00:00:00.000Z' }

const session: Session = {
  id: 's1',
  categoryId: 'c-maths',
  title: 'Problem set',
  startedAt: '2026-01-10T23:30:00.000Z',
  endedAt: '2026-01-11T00:45:00.000Z',
  pausedIntervals: [{ startedAt: '2026-01-10T23:50:00.000Z', endedAt: '2026-01-11T00:10:00.000Z' }],
  notes: null,
  concentration: 8,
  fatigue: null,
  createdAt: '2026-01-11T00:45:00.000Z',
  updatedAt: '2026-01-11T00:45:00.000Z',
}

const active: ActiveSession = {
  id: 'a1',
  categoryId: 'c-academics',
  title: null,
  startedAt: '2026-01-12T11:00:00.000Z',
  pausedIntervals: [],
  state: 'paused',
  pauseStartedAt: '2026-01-12T11:30:00.000Z',
  updatedAt: '2026-01-12T11:30:00.000Z',
}

// `any` below is deliberate: these helpers corrupt a valid payload in ways the types forbid.
const good = (): Backup => buildBackup({ categories: [parent, child], sessions: [session], activeSession: active }, NOW)
const errorsFor = (mutate: (b: any) => void): string[] => {
  const b = structuredClone(good())
  mutate(b)
  const result = validateBackup(b, NOW)
  return result.ok ? [] : result.errors
}

describe('buildBackup', () => {
  it('writes the documented envelope', () => {
    expect(good()).toMatchObject({ format: BACKUP_FORMAT, schemaVersion: 1, exportedAt: '2026-01-12T12:00:00.000Z' })
  })
})

describe('round trip', () => {
  it('restores exactly what was exported, through JSON text', () => {
    const result = parseBackupText(JSON.stringify(good()), NOW)
    expect(result).toEqual({ ok: true, backup: good() })
  })

  it('keeps unanswered reflection fields null', () => {
    const result = validateBackup(good(), NOW)
    expect(result.ok && result.backup.sessions[0]).toMatchObject({ notes: null, concentration: 8, fatigue: null })
  })

  it('accepts an empty database and a missing unfinished session', () => {
    const empty = buildBackup({ categories: [], sessions: [], activeSession: null }, NOW)
    expect(validateBackup(empty, NOW).ok).toBe(true)
  })

  it('drops unknown fields and normalises offset timestamps to UTC', () => {
    const result = validateBackup(
      errorless((b) => {
        b.sessions[0].startedAt = '2026-01-11T00:30:00+01:00'
        b.sessions[0].mood = 'great'
        b.extra = true
      }),
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.sessions[0]?.startedAt).toBe('2026-01-10T23:30:00.000Z')
    expect(result.backup.sessions[0]).not.toHaveProperty('mood')
    expect(result.backup).not.toHaveProperty('extra')
  })
})

function errorless(mutate: (b: any) => void): unknown {
  const b = structuredClone(good())
  mutate(b)
  return b
}

describe('rejection of malformed payloads', () => {
  it('rejects text that is not JSON, and JSON that is not a backup', () => {
    expect(parseBackupText('{nope', NOW)).toEqual({ ok: false, errors: ['The file is not valid JSON.'] })
    for (const value of [null, [], 'text', {}, { format: 'something-else' }]) {
      expect(validateBackup(value, NOW)).toEqual({ ok: false, errors: ['This is not a Cadence backup file.'] })
    }
  })

  it('rejects other schema versions', () => {
    expect(errorsFor((b) => (b.schemaVersion = 2))[0]).toMatch(/newer version/)
    expect(errorsFor((b) => (b.schemaVersion = '1'))[0]).toMatch(/unsupported/)
  })

  it('rejects missing collections', () => {
    expect(errorsFor((b) => delete b.sessions)).toContain('The backup has no list of sessions.')
    expect(errorsFor((b) => (b.categories = {}))).toContain('The backup has no list of categories.')
  })

  it('rejects broken category references and hierarchy', () => {
    expect(errorsFor((b) => (b.sessions[0].categoryId = 'gone'))[0]).toMatch(/Session 1 refers to a category/)
    expect(errorsFor((b) => (b.categories[1].parentId = 'gone'))[0]).toMatch(/parent that is not in the backup/)
    expect(
      errorsFor((b) => b.categories.push({ ...b.categories[1], id: 'c-algebra', name: 'Algebra', parentId: 'c-maths' })),
    ).toEqual(['Category “Algebra” is nested more than two levels deep.'])
  })

  it('rejects duplicate ids', () => {
    expect(errorsFor((b) => b.sessions.push(b.sessions[0]))).toEqual(["Session 2 duplicates another session's id."])
    expect(errorsFor((b) => b.categories.push(b.categories[0]))).toEqual(["Category 3 duplicates another category's id."])
  })

  it('rejects invalid and out-of-range timestamps', () => {
    expect(errorsFor((b) => (b.sessions[0].startedAt = 'yesterday'))).toContain('Session 1 start is not a valid timestamp.')
    expect(errorsFor((b) => (b.sessions[0].endedAt = '2031-01-01T00:00:00.000Z'))).toContain(
      'Session 1 end is outside the accepted date range.',
    )
    expect(errorsFor((b) => (b.exportedAt = 12345))).toContain('The export time is not a valid timestamp.')
  })

  it('rejects inverted sessions and bad pause intervals', () => {
    expect(errorsFor((b) => (b.sessions[0].endedAt = '2026-01-10T23:00:00.000Z')).join(' ')).toMatch(
      /ends before it starts/,
    )
    expect(
      errorsFor((b) => (b.sessions[0].pausedIntervals[0].endedAt = '2026-01-11T02:00:00.000Z')),
    ).toEqual(['Session 1: Pause 1 is outside the session.'])
    expect(errorsFor((b) => (b.sessions[0].pausedIntervals = 'none'))).toEqual(['Session 1 has no list of pauses.'])
    expect(
      errorsFor((b) =>
        b.sessions[0].pausedIntervals.push({ startedAt: '2026-01-11T00:00:00.000Z', endedAt: '2026-01-11T00:20:00.000Z' }),
      ),
    ).toEqual(['Session 1: Pause 2 overlaps or precedes an earlier interval.'])
  })

  it('rejects ratings that are not whole numbers from 1 to 10, without coercing them', () => {
    for (const bad of [0, 11, 7.5, '7', false]) {
      expect(errorsFor((b) => (b.sessions[0].concentration = bad))).toEqual([
        'Session 1 concentration must be a whole number from 1 to 10, or null.',
      ])
    }
    expect(errorsFor((b) => (b.sessions[0].fatigue = 0))).toHaveLength(1)
  })

  it('rejects a malformed unfinished session', () => {
    expect(errorsFor((b) => (b.activeSession.state = 'stopped'))[0]).toMatch(/unfinished session is malformed/)
    expect(errorsFor((b) => (b.activeSession.categoryId = 'gone'))[0]).toMatch(/unfinished session refers/)
  })

  it('caps the number of reported problems', () => {
    const errors = errorsFor((b) => {
      b.sessions = Array.from({ length: 50 }, (_, i) => ({ ...b.sessions[0], id: `s${i}`, categoryId: 'gone' }))
    })
    expect(errors).toHaveLength(21)
    expect(errors.at(-1)).toBe('…and 30 more problems.')
  })
})
