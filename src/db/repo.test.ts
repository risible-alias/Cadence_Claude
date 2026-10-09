import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { validateBackup } from '../domain/backup'
import { sessionTimes } from '../domain/sessions'
import { activeOverlapMs, localDayWindow, sessionActiveMs } from '../domain/time'
import { ACTIVE_SLOT, CadenceDb, type StoredActiveSession } from './db'
import {
  addManualSession,
  archiveCategory,
  cancelActiveSession,
  createCategory,
  deleteSession,
  exportBackup,
  finishActiveSession,
  getActiveSession,
  pauseActiveSession,
  renameCategory,
  replaceAllData,
  resumeActiveSession,
  restoreCategory,
  sessionsOverlapping,
  startActiveSession,
  storedCounts,
  updateReflection,
  updateSession,
} from './repo'

const MIN = 60_000
const T0 = Date.parse('2026-01-10T09:00:00Z')

let dbName: string
let db: CadenceDb
let counter = 0

beforeEach(() => {
  dbName = `cadence-test-${++counter}`
  db = new CadenceDb(dbName)
})

describe('categories', () => {
  it('creates a two-level hierarchy and rejects a third level', async () => {
    const parent = await createCategory(db, { name: 'Academics', parentId: null }, T0)
    const child = await createCategory(db, { name: 'Mathematics', parentId: parent.id }, T0)
    expect(child.parentId).toBe(parent.id)
    await expect(createCategory(db, { name: 'Algebra', parentId: child.id }, T0)).rejects.toThrow(/two levels/)
    expect(await db.categories.count()).toBe(2)
  })

  it('renames and archives without touching saved sessions', async () => {
    const parent = await createCategory(db, { name: 'Music', parentId: null }, T0)
    const child = await createCategory(db, { name: 'Violin', parentId: parent.id }, T0)
    await startActiveSession(db, { categoryId: child.id }, T0)
    const session = await finishActiveSession(db, T0 + 30 * MIN)

    await renameCategory(db, child.id, 'Viola', T0 + 40 * MIN)
    await archiveCategory(db, parent.id, T0 + 50 * MIN)

    const stored = await db.categories.toArray()
    expect(stored.every((c) => c.archivedAt !== null)).toBe(true)
    expect(stored.find((c) => c.id === child.id)?.name).toBe('Viola')
    expect(await db.sessions.get(session.id)).toEqual(session)
    await expect(startActiveSession(db, { categoryId: child.id }, T0 + 60 * MIN)).rejects.toThrow(/category/)
  })
})

describe('active session lifecycle', () => {
  let categoryId: string
  beforeEach(async () => {
    categoryId = (await createCategory(db, { name: 'Reading', parentId: null }, T0)).id
  })

  it('persists across reopening the database', async () => {
    await startActiveSession(db, { categoryId, title: 'Chapter 4' }, T0)
    await pauseActiveSession(db, T0 + 10 * MIN)
    db.close()

    const reopened = new CadenceDb(dbName)
    const active = await getActiveSession(reopened)
    expect(active).toMatchObject({ title: 'Chapter 4', state: 'paused', pauseStartedAt: '2026-01-10T09:10:00.000Z' })
    expect(active).not.toHaveProperty('slot')
  })

  it('allows only one active session', async () => {
    await startActiveSession(db, { categoryId }, T0)
    await expect(startActiveSession(db, { categoryId }, T0 + MIN)).rejects.toThrow(/already in progress/)
    expect(await db.activeSession.count()).toBe(1)
  })

  it('records the correct active duration through pause, resume and finish', async () => {
    await startActiveSession(db, { categoryId }, T0)
    await pauseActiveSession(db, T0 + 10 * MIN)
    await resumeActiveSession(db, T0 + 15 * MIN)
    const session = await finishActiveSession(db, T0 + 20 * MIN)

    expect(sessionActiveMs(session)).toBe(15 * MIN)
    expect(await getActiveSession(db)).toBeNull()
    expect(await db.sessions.get(session.id)).toMatchObject({ notes: null, concentration: null, fatigue: null })
  })

  it('rejects invalid transitions without changing stored state', async () => {
    await expect(pauseActiveSession(db, T0)).rejects.toThrow(/no active session/)
    await startActiveSession(db, { categoryId }, T0)
    await pauseActiveSession(db, T0 + MIN)
    const before = await getActiveSession(db)
    await expect(pauseActiveSession(db, T0 + 2 * MIN)).rejects.toThrow(/already paused/)
    expect(await getActiveSession(db)).toEqual(before)
  })

  it('cancel discards the active session and saves nothing', async () => {
    await startActiveSession(db, { categoryId }, T0)
    await cancelActiveSession(db)
    expect(await getActiveSession(db)).toBeNull()
    expect(await db.sessions.count()).toBe(0)
  })

  it('reports, rather than discards, an unreadable stored session', async () => {
    await db.activeSession.put({ slot: ACTIVE_SLOT, state: 'bogus' } as unknown as StoredActiveSession)
    await expect(getActiveSession(db)).rejects.toThrow(/unreadable/)
    expect(await db.activeSession.count()).toBe(1)
  })
})

describe('sessionsOverlapping', () => {
  it('returns sessions intersecting the window, oldest first', async () => {
    const categoryId = (await createCategory(db, { name: 'Admin', parentId: null }, T0)).id
    const finish = async (startMs: number, endMs: number) => {
      await startActiveSession(db, { categoryId }, startMs)
      return (await finishActiveSession(db, endMs)).id
    }
    const dayStart = Date.parse('2026-01-11T00:00:00Z')
    const dayEnd = Date.parse('2026-01-12T00:00:00Z')

    await finish(dayStart - 120 * MIN, dayStart - 60 * MIN) // entirely the day before
    const crossing = await finish(dayStart - 30 * MIN, dayStart + 30 * MIN)
    const inside = await finish(dayStart + 600 * MIN, dayStart + 660 * MIN)
    await finish(dayEnd, dayEnd + 10 * MIN) // starts exactly at the window end

    const found = await sessionsOverlapping(db, dayStart, dayEnd)
    expect(found.map((s) => s.id)).toEqual([crossing, inside])
  })
})

describe('manual entry, editing and deletion', () => {
  const NOW = Date.parse('2026-01-12T12:00:00Z')
  const at = (s: string) => new Date(s).toISOString()
  let maths: string
  let violin: string
  beforeEach(async () => {
    maths = (await createCategory(db, { name: 'Mathematics', parentId: null }, T0)).id
    violin = (await createCategory(db, { name: 'Violin', parentId: null }, T0)).id
  })
  const draft = (startedAt: string, endedAt: string, categoryId = maths) => ({
    categoryId,
    title: null,
    startedAt: at(startedAt),
    endedAt: at(endedAt),
    pausedIntervals: [],
  })
  const dayTotal = async (y: number, m: number, d: number) => {
    const { startMs, endMs } = localDayWindow(new Date(y, m, d))
    const sessions = await sessionsOverlapping(db, startMs, endMs)
    return sessions.reduce((sum, s) => sum + activeOverlapMs(s, startMs, endMs), 0)
  }

  it('saves a manual session without reflection values', async () => {
    const saved = await addManualSession(db, { ...draft('2026-01-10T09:00Z', '2026-01-10T10:30Z'), title: ' Revision ' }, NOW)
    expect(await db.sessions.get(saved.id)).toMatchObject({
      title: 'Revision',
      pausedIntervals: [],
      notes: null,
      concentration: null,
      fatigue: null,
    })
    expect(await dayTotal(2026, 0, 10)).toBe(90 * MIN)
  })

  it('rejects invalid ranges, future times and unavailable categories, storing nothing', async () => {
    await expect(addManualSession(db, draft('2026-01-10T10:00Z', '2026-01-10T09:00Z'), NOW)).rejects.toThrow(/after the start/)
    await expect(addManualSession(db, draft('2026-01-12T11:00Z', '2026-01-12T13:00Z'), NOW)).rejects.toThrow(/future/)
    await expect(addManualSession(db, draft('2026-01-10T09:00Z', '2026-01-10T10:00Z', 'nope'), NOW)).rejects.toThrow(/category/)
    await archiveCategory(db, violin, T0)
    await expect(addManualSession(db, draft('2026-01-10T09:00Z', '2026-01-10T10:00Z', violin), NOW)).rejects.toThrow(/archived/)
    expect(await db.sessions.count()).toBe(0)
  })

  it('moves time between days when an edit crosses midnight', async () => {
    const saved = await addManualSession(db, draft('2026-01-10T22:00Z', '2026-01-10T23:00Z'), NOW)
    expect(await dayTotal(2026, 0, 10)).toBe(60 * MIN)
    expect(await dayTotal(2026, 0, 11)).toBe(0)

    await updateSession(db, saved.id, draft('2026-01-10T23:30Z', '2026-01-11T00:45Z', violin), NOW)
    expect(await dayTotal(2026, 0, 10)).toBe(30 * MIN)
    expect(await dayTotal(2026, 0, 11)).toBe(45 * MIN)
    expect((await db.sessions.get(saved.id))?.categoryId).toBe(violin)
    expect(await db.sessions.count()).toBe(1)
  })

  it('editing keeps reflection values, trims pauses to the new span, and rejects bad ranges', async () => {
    await startActiveSession(db, { categoryId: maths }, T0)
    await pauseActiveSession(db, T0 + 40 * MIN)
    await resumeActiveSession(db, T0 + 50 * MIN)
    const timed = await finishActiveSession(db, T0 + 60 * MIN)
    await db.sessions.update(timed.id, { concentration: 6, notes: 'ok' })

    const edited = await updateSession(
      db,
      timed.id,
      { ...draft('2026-01-10T09:00Z', '2026-01-10T09:45Z'), pausedIntervals: timed.pausedIntervals },
      NOW,
    )
    expect(sessionTimes(edited)).toEqual({ elapsedMs: 45 * MIN, pausedMs: 5 * MIN, activeMs: 40 * MIN })
    expect(edited).toMatchObject({ concentration: 6, notes: 'ok', fatigue: null, createdAt: timed.createdAt })

    await expect(updateSession(db, timed.id, draft('2026-01-10T09:00Z', '2026-01-10T08:00Z'), NOW)).rejects.toThrow()
    expect(await db.sessions.get(timed.id)).toEqual(edited)
    await expect(updateSession(db, 'missing', draft('2026-01-10T09:00Z', '2026-01-10T10:00Z'), NOW)).rejects.toThrow(/no longer exists/)
  })

  it('lets a session keep its archived category when other fields are edited', async () => {
    const saved = await addManualSession(db, draft('2026-01-10T09:00Z', '2026-01-10T10:00Z', violin), NOW)
    await archiveCategory(db, violin, NOW)
    const edited = await updateSession(db, saved.id, draft('2026-01-10T09:00Z', '2026-01-10T11:00Z', violin), NOW)
    expect(sessionTimes(edited).activeMs).toBe(120 * MIN)
  })

  it('deletes a session and removes it from the day total', async () => {
    const keep = await addManualSession(db, draft('2026-01-10T09:00Z', '2026-01-10T10:00Z'), NOW)
    const gone = await addManualSession(db, draft('2026-01-10T11:00Z', '2026-01-10T11:30Z'), NOW)
    await deleteSession(db, gone.id)
    expect(await dayTotal(2026, 0, 10)).toBe(60 * MIN)
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual([keep.id])
  })
})

describe('restoring archived categories', () => {
  it('restores a parent with the sub-categories archived alongside it', async () => {
    const parent = await createCategory(db, { name: 'Music', parentId: null }, T0)
    const child = await createCategory(db, { name: 'Violin', parentId: parent.id }, T0)
    await archiveCategory(db, parent.id, T0 + MIN)
    await restoreCategory(db, parent.id, T0 + 2 * MIN)
    expect((await db.categories.toArray()).every((c) => c.archivedAt === null)).toBe(true)
    await expect(startActiveSession(db, { categoryId: child.id }, T0 + 3 * MIN)).resolves.toBeTruthy()
  })

  it('refuses a restore that would duplicate a live name', async () => {
    const old = await createCategory(db, { name: 'Reading', parentId: null }, T0)
    await archiveCategory(db, old.id, T0 + MIN)
    await createCategory(db, { name: 'reading', parentId: null }, T0 + 2 * MIN)
    await expect(restoreCategory(db, old.id, T0 + 3 * MIN)).rejects.toThrow(/already named/)
    expect((await db.categories.get(old.id))?.archivedAt).not.toBeNull()
  })
})

describe('backup export and restore', () => {
  const NOW = Date.parse('2026-01-12T12:00:00Z')

  async function seed(target: CadenceDb) {
    const parent = await createCategory(target, { name: 'Academics', parentId: null }, T0)
    const child = await createCategory(target, { name: 'Mathematics', parentId: parent.id }, T0)
    await startActiveSession(target, { categoryId: child.id, title: 'Timed' }, T0)
    await pauseActiveSession(target, T0 + 10 * MIN)
    await resumeActiveSession(target, T0 + 15 * MIN)
    await finishActiveSession(target, T0 + 30 * MIN)
    await addManualSession(
      target,
      { categoryId: parent.id, title: null, startedAt: '2026-01-10T23:30:00.000Z', endedAt: '2026-01-11T00:45:00.000Z', pausedIntervals: [] },
      NOW,
    )
    await archiveCategory(target, child.id, NOW)
  }

  it('round-trips the whole database through JSON into a fresh one', async () => {
    await seed(db)
    const exported = await exportBackup(db, NOW)
    const parsed = validateBackup(JSON.parse(JSON.stringify(exported)), NOW)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const fresh = new CadenceDb(`${dbName}-fresh`)
    await replaceAllData(fresh, parsed.backup)
    const sortById = <T extends { id: string }>(rows: T[]) => rows.sort((a, b) => a.id.localeCompare(b.id))
    expect(sortById(await fresh.categories.toArray())).toEqual(sortById(await db.categories.toArray()))
    expect(sortById(await fresh.sessions.toArray())).toEqual(sortById(await db.sessions.toArray()))
    expect(await storedCounts(fresh)).toEqual({ categories: 2, sessions: 2, active: 0 })
  })

  it('exports an unfinished session but never restores it as a live timer', async () => {
    await seed(db)
    const parentId = (await db.categories.toArray()).find((c) => c.parentId === null)!.id
    await startActiveSession(db, { categoryId: parentId }, NOW - 30 * MIN)
    const exported = await exportBackup(db, NOW)
    expect(exported.activeSession).toMatchObject({ state: 'running', categoryId: parentId })

    const fresh = new CadenceDb(`${dbName}-fresh`)
    await replaceAllData(fresh, exported)
    expect(await getActiveSession(fresh)).toBeNull()
    expect(await fresh.sessions.count()).toBe(2)
  })

  it('replaces existing data, but refuses while a timer is in progress', async () => {
    await seed(db)
    const exported = await exportBackup(db, NOW)

    const other = new CadenceDb(`${dbName}-other`)
    const cat = await createCategory(other, { name: 'Leisure', parentId: null }, T0)
    await startActiveSession(other, { categoryId: cat.id }, T0)
    await expect(replaceAllData(other, exported)).rejects.toThrow(/in progress/)
    expect(await storedCounts(other)).toEqual({ categories: 1, sessions: 0, active: 1 })

    await finishActiveSession(other, T0 + MIN)
    await replaceAllData(other, exported)
    expect((await other.categories.toArray()).map((c) => c.name).sort()).toEqual(['Academics', 'Mathematics'])
    expect(await other.sessions.count()).toBe(2)
  })

  it('leaves existing data untouched if the restore fails part-way', async () => {
    await seed(db)
    const exported = await exportBackup(db, NOW)
    const broken = { ...exported, sessions: [...exported.sessions, exported.sessions[0]!] }

    const other = new CadenceDb(`${dbName}-other`)
    await createCategory(other, { name: 'Leisure', parentId: null }, T0)
    await expect(replaceAllData(other, broken)).rejects.toThrow()
    expect((await other.categories.toArray()).map((c) => c.name)).toEqual(['Leisure'])
  })
})

describe('optional reflections', () => {
  const NOW = Date.parse('2026-01-12T12:00:00Z')
  let categoryId: string
  beforeEach(async () => {
    categoryId = (await createCategory(db, { name: 'Reading', parentId: null }, T0)).id
  })
  const finishOne = async () => {
    await startActiveSession(db, { categoryId }, T0)
    return finishActiveSession(db, T0 + 30 * MIN)
  }

  it('a finished session is complete with every reflection field unanswered', async () => {
    const session = await finishOne()
    expect(await db.sessions.get(session.id)).toMatchObject({ concentration: null, fatigue: null, notes: null })
  })

  it('stores each field independently and can clear it again', async () => {
    const session = await finishOne()
    await updateReflection(db, session.id, { concentration: 7, fatigue: null, notes: null }, NOW)
    expect(await db.sessions.get(session.id)).toMatchObject({ concentration: 7, fatigue: null, notes: null })

    await updateReflection(db, session.id, { concentration: 7, fatigue: null, notes: ' tired eyes ' }, NOW)
    expect(await db.sessions.get(session.id)).toMatchObject({ concentration: 7, fatigue: null, notes: 'tired eyes' })

    await updateReflection(db, session.id, { concentration: null, fatigue: 3, notes: null }, NOW)
    const stored = await db.sessions.get(session.id)
    expect(stored).toMatchObject({ concentration: null, fatigue: 3, notes: null })
    expect(sessionActiveMs(stored!)).toBe(30 * MIN)
  })

  it('rejects invalid ratings and leaves the stored session unchanged', async () => {
    const session = await finishOne()
    await expect(updateReflection(db, session.id, { concentration: 0, fatigue: null, notes: null }, NOW)).rejects.toThrow(/Concentration/)
    await expect(updateReflection(db, session.id, { concentration: null, fatigue: 2.5, notes: null }, NOW)).rejects.toThrow(/fatigue/)
    expect(await db.sessions.get(session.id)).toEqual(session)
    await expect(updateReflection(db, 'missing', { concentration: 1, fatigue: 1, notes: null }, NOW)).rejects.toThrow(/no longer exists/)
  })

  it('saves a reflection together with a time edit, and with a manual entry', async () => {
    const session = await finishOne()
    const draft = { categoryId, title: null, startedAt: session.startedAt, endedAt: '2026-01-10T09:20:00.000Z', pausedIntervals: [] }
    const edited = await updateSession(db, session.id, draft, NOW, { concentration: null, fatigue: 9, notes: null })
    expect(edited).toMatchObject({ endedAt: '2026-01-10T09:20:00.000Z', concentration: null, fatigue: 9 })

    const manual = await addManualSession(
      db,
      { ...draft, startedAt: '2026-01-11T09:00:00.000Z', endedAt: '2026-01-11T10:00:00.000Z' },
      NOW,
      { concentration: 5, fatigue: null, notes: null },
    )
    expect(manual).toMatchObject({ concentration: 5, fatigue: null, notes: null })
    await expect(
      addManualSession(db, { ...draft, startedAt: '2026-01-11T11:00:00.000Z', endedAt: '2026-01-11T12:00:00.000Z' }, NOW, {
        concentration: 12,
        fatigue: null,
        notes: null,
      }),
    ).rejects.toThrow(/Concentration/)
    expect(await db.sessions.count()).toBe(2)
  })

  it('survives a backup round trip with nulls intact', async () => {
    const session = await finishOne()
    await updateReflection(db, session.id, { concentration: null, fatigue: 6, notes: 'ok' }, NOW)
    const parsed = validateBackup(JSON.parse(JSON.stringify(await exportBackup(db, NOW))), NOW)
    expect(parsed.ok && parsed.backup.sessions[0]).toMatchObject({ concentration: null, fatigue: 6, notes: 'ok' })
  })
})
