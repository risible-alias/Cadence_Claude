import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { validateBackup } from '../domain/backup'
import { INKS, resolveInk } from '../domain/inks'
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
  recentSessions,
  renameCategory,
  replaceAllData,
  resumeActiveSession,
  restoreCategory,
  sessionsOverlapping,
  setActiveTitle,
  setCategoryInk,
  startActiveSession,
  storedCounts,
  updateReflection,
  updateSession,
} from './repo'

const MIN = 60_000
const HOUR_MS = 60 * MIN
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

describe('category inks', () => {
  const inkOf = async (id: string) => resolveInk(id, await db.categories.toArray())

  it('gives each new group the next unused ink and lets sub-categories inherit', async () => {
    const music = await createCategory(db, { name: 'Music', parentId: null }, T0)
    const violin = await createCategory(db, { name: 'Violin', parentId: music.id }, T0)
    const reading = await createCategory(db, { name: 'Reading', parentId: null }, T0)
    expect(music.color).toBe('lapis')
    expect(violin.color).toBeNull()
    expect(reading.color).toBe('oxblood')
    expect(await inkOf(violin.id)).toBe('lapis')
  })

  it('allows more groups than inks by reusing them', async () => {
    const colors: Array<string | null> = []
    for (let i = 0; i < INKS.length + 3; i++) {
      colors.push((await createCategory(db, { name: `Group ${i}`, parentId: null }, T0 + i)).color)
    }
    expect(colors.slice(0, INKS.length)).toEqual(INKS.map((i) => i.id))
    expect(colors.slice(INKS.length)).toEqual(['lapis', 'oxblood', 'plum'])
  })

  it('changes one ink without disturbing any other category', async () => {
    const music = await createCategory(db, { name: 'Music', parentId: null }, T0)
    const violin = await createCategory(db, { name: 'Violin', parentId: music.id }, T0)
    const piano = await createCategory(db, { name: 'Piano', parentId: music.id }, T0)
    const reading = await createCategory(db, { name: 'Reading', parentId: null }, T0)

    await setCategoryInk(db, music.id, 'forest', T0 + MIN)
    expect(await inkOf(violin.id)).toBe('forest')
    expect(await inkOf(reading.id)).toBe('oxblood')

    await setCategoryInk(db, piano.id, 'brass', T0 + MIN)
    expect(await inkOf(piano.id)).toBe('brass')
    expect(await inkOf(violin.id)).toBe('forest')
    await setCategoryInk(db, piano.id, null, T0 + 2 * MIN)
    expect(await inkOf(piano.id)).toBe('forest')
  })

  it('rejects unknown inks and clearing a group’s ink', async () => {
    const music = await createCategory(db, { name: 'Music', parentId: null }, T0)
    await expect(setCategoryInk(db, music.id, 'teal', T0)).rejects.toThrow(/available inks/)
    await expect(setCategoryInk(db, music.id, null, T0)).rejects.toThrow(/Choose an ink/)
    await expect(setCategoryInk(db, 'missing', 'plum', T0)).rejects.toThrow(/no longer exists/)
    expect((await db.categories.get(music.id))?.color).toBe('lapis')
  })

  it('keeps inks stable when other categories are archived, restored or added', async () => {
    const a = await createCategory(db, { name: 'A', parentId: null }, T0)
    const b = await createCategory(db, { name: 'B', parentId: null }, T0 + 1)
    const c = await createCategory(db, { name: 'C', parentId: null }, T0 + 2)
    await archiveCategory(db, a.id, T0 + MIN)
    const d = await createCategory(db, { name: 'D', parentId: null }, T0 + 2 * MIN)
    await restoreCategory(db, a.id, T0 + 3 * MIN)
    const stored = await db.categories.toArray()
    const color = (id: string) => stored.find((x) => x.id === id)?.color
    expect([color(a.id), color(b.id), color(c.id)]).toEqual(['lapis', 'oxblood', 'plum'])
    // The archived group's ink was free to reuse; restoring it does not take it back.
    expect(d.color).toBe('lapis')
  })

  it('sharing an ink does not merge sessions or history', async () => {
    const one = await createCategory(db, { name: 'One', parentId: null }, T0)
    const two = await createCategory(db, { name: 'Two', parentId: null }, T0)
    await setCategoryInk(db, two.id, one.color, T0)
    await startActiveSession(db, { categoryId: one.id }, T0)
    await finishActiveSession(db, T0 + 10 * MIN)
    await startActiveSession(db, { categoryId: two.id }, T0 + 20 * MIN)
    await finishActiveSession(db, T0 + 50 * MIN)
    const sessions = await db.sessions.toArray()
    expect(sessions.map((s) => s.categoryId).sort()).toEqual([one.id, two.id].sort())
  })
})

describe('upgrading stored data from before inks', () => {
  it('assigns inks on upgrade and leaves sessions and the active timer intact', async () => {
    const name = `${dbName}-legacy`
    const legacy = new Dexie(name)
    legacy.version(1).stores({ categories: 'id, parentId', sessions: 'id, startedAt, endedAt, categoryId', activeSession: 'slot' })
    const base = { color: null, archivedAt: null, updatedAt: '2026-01-01T00:00:00.000Z' }
    await legacy.table('categories').bulkAdd([
      { ...base, id: 'c2', name: 'Music', parentId: null, createdAt: '2026-01-02T00:00:00.000Z' },
      { ...base, id: 'c1', name: 'Academics', parentId: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { ...base, id: 'c3', name: 'Violin', parentId: 'c2', createdAt: '2026-01-03T00:00:00.000Z' },
    ])
    const session = {
      id: 's1', categoryId: 'c3', title: 'Scales', startedAt: '2026-01-10T09:00:00.000Z', endedAt: '2026-01-10T10:00:00.000Z',
      pausedIntervals: [{ startedAt: '2026-01-10T09:10:00.000Z', endedAt: '2026-01-10T09:20:00.000Z' }],
      notes: 'ok', concentration: 7, fatigue: null, createdAt: '2026-01-10T10:00:00.000Z', updatedAt: '2026-01-10T10:00:00.000Z',
    }
    await legacy.table('sessions').add(session)
    const active = {
      slot: 'current', id: 'a1', categoryId: 'c1', title: null, startedAt: '2026-01-12T11:00:00.000Z', pausedIntervals: [],
      state: 'paused', pauseStartedAt: '2026-01-12T11:30:00.000Z', updatedAt: '2026-01-12T11:30:00.000Z',
    }
    await legacy.table('activeSession').add(active)
    legacy.close()

    const upgraded = new CadenceDb(name)
    const categories = await upgraded.categories.toArray()
    const color = (id: string) => categories.find((c) => c.id === id)?.color
    expect([color('c1'), color('c2'), color('c3')]).toEqual(['lapis', 'oxblood', null])
    expect(resolveInk('c3', categories)).toBe('oxblood')
    expect(await upgraded.sessions.get('s1')).toEqual(session)
    expect(await getActiveSession(upgraded)).toMatchObject({ id: 'a1', state: 'paused', categoryId: 'c1' })
    expect(sessionActiveMs((await upgraded.sessions.get('s1'))!)).toBe(50 * MIN)
    upgraded.close()

    // Opening again must not reassign anything.
    const again = new CadenceDb(name)
    expect((await again.categories.toArray()).map((c) => c.color).sort()).toEqual(categories.map((c) => c.color).sort())
  })

  it('restores a backup made before inks, assigning them and keeping every session', async () => {
    const parent = await createCategory(db, { name: 'Academics', parentId: null }, T0)
    await createCategory(db, { name: 'Music', parentId: null }, T0 + 1)
    await startActiveSession(db, { categoryId: parent.id }, T0)
    await finishActiveSession(db, T0 + 30 * MIN)
    const exported = await exportBackup(db, T0 + HOUR_MS)
    // What an older version would have written: every colour null.
    const old = { ...exported, categories: exported.categories.map((c) => ({ ...c, color: null })) }
    const parsed = validateBackup(JSON.parse(JSON.stringify(old)), T0 + HOUR_MS)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const fresh = new CadenceDb(`${dbName}-fresh`)
    await replaceAllData(fresh, parsed.backup)
    expect((await fresh.categories.orderBy('id').toArray()).every((c) => c.color !== null)).toBe(true)
    expect((await fresh.categories.toArray()).map((c) => c.color).sort()).toEqual(['lapis', 'oxblood'])
    expect(await fresh.sessions.toArray()).toEqual(exported.sessions)
  })

  it('keeps assigned inks through a backup round trip', async () => {
    const music = await createCategory(db, { name: 'Music', parentId: null }, T0)
    const violin = await createCategory(db, { name: 'Violin', parentId: music.id }, T0)
    await setCategoryInk(db, music.id, 'brass', T0)
    await setCategoryInk(db, violin.id, 'plum', T0)
    const parsed = validateBackup(JSON.parse(JSON.stringify(await exportBackup(db, T0 + HOUR_MS))), T0 + HOUR_MS)
    if (!parsed.ok) throw new Error(parsed.errors.join(' '))
    const fresh = new CadenceDb(`${dbName}-fresh`)
    await replaceAllData(fresh, parsed.backup)
    const stored = await fresh.categories.toArray()
    expect(stored.find((c) => c.id === music.id)?.color).toBe('brass')
    expect(stored.find((c) => c.id === violin.id)?.color).toBe('plum')
  })
})

describe('title and recent use', () => {
  it('changes the title of the session in progress and saves it on finish', async () => {
    const id = (await createCategory(db, { name: 'Violin', parentId: null }, T0)).id
    await expect(setActiveTitle(db, 'x', T0)).rejects.toThrow(/no active session/)
    await startActiveSession(db, { categoryId: id }, T0)
    await setActiveTitle(db, ' Bach, Partita 2 ', T0 + MIN)
    expect((await getActiveSession(db))?.title).toBe('Bach, Partita 2')
    const session = await finishActiveSession(db, T0 + 10 * MIN)
    expect(session.title).toBe('Bach, Partita 2')
    expect(sessionActiveMs(session)).toBe(10 * MIN)
  })

  it('lists the latest sessions newest first', async () => {
    const id = (await createCategory(db, { name: 'Violin', parentId: null }, T0)).id
    for (let i = 0; i < 5; i++) {
      await startActiveSession(db, { categoryId: id }, T0 + i * 60 * MIN)
      await finishActiveSession(db, T0 + i * 60 * MIN + 10 * MIN)
    }
    const recent = await recentSessions(db, 3)
    expect(recent).toHaveLength(3)
    expect(recent.map((s) => s.endedAt)).toEqual(recent.map((s) => s.endedAt).slice().sort().reverse())
    expect(recent[0]?.startedAt).toBe(new Date(T0 + 4 * 60 * MIN).toISOString())
  })
})
