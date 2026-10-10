import { buildBackup, type Backup } from '../domain/backup'
import { categoryProblem, normalizeCategoryName, restorePlan } from '../domain/categories'
import { assignMissingInks, defaultInkFor, inkProblem } from '../domain/inks'
import { applyReflection, reflectionProblems, type Reflection } from '../domain/reflections'
import { applySessionEdit, createManualSession, draftProblems, type SessionDraft } from '../domain/sessions'
import { toIso } from '../domain/time'
import {
  activeSessionProblem,
  finishSession,
  pauseSession,
  resumeSession,
  retitleSession,
  startSession,
} from '../domain/timer'
import type { ActiveSession, Category, Session } from '../domain/types'
import { ACTIVE_SLOT, type CadenceDb } from './db'
import { newId } from './id'

// Every write runs inside one IndexedDB transaction and resolves only after it
// commits, so the UI never reports an action that was not persisted.

export async function createCategory(
  db: CadenceDb,
  input: { name: string; parentId: string | null },
  nowMs: number,
): Promise<Category> {
  return db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.toArray()
    const problem = categoryProblem(input, existing)
    if (problem) throw new Error(problem)
    const now = toIso(nowMs)
    const category: Category = {
      id: newId(),
      name: normalizeCategoryName(input.name),
      parentId: input.parentId,
      // A new group gets the least-used ink; a sub-category inherits its parent's.
      color: input.parentId === null ? defaultInkFor(existing) : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await db.categories.add(category)
    return category
  })
}

export async function renameCategory(db: CadenceDb, id: string, name: string, nowMs: number): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const category = await db.categories.get(id)
    if (!category) throw new Error('That category no longer exists.')
    const problem = categoryProblem(
      { name, parentId: category.parentId, selfId: id },
      await db.categories.toArray(),
    )
    if (problem) throw new Error(problem)
    await db.categories.update(id, { name: normalizeCategoryName(name), updatedAt: toIso(nowMs) })
  })
}

/**
 * Changes a category's ink. `null` on a sub-category means "same as its
 * parent"; a top-level category must always have one. Nothing else changes,
 * and no other category is affected.
 */
export async function setCategoryInk(db: CadenceDb, id: string, color: string | null, nowMs: number): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const category = await db.categories.get(id)
    if (!category) throw new Error('That category no longer exists.')
    const problem = inkProblem(color)
    if (problem) throw new Error(problem)
    if (color === null && category.parentId === null) throw new Error('Choose an ink for this group.')
    await db.categories.update(id, { color, updatedAt: toIso(nowMs) })
  })
}

/**
 * Archives a category and its sub-categories. Nothing is deleted: sessions
 * keep their category reference and history keeps showing its name.
 */
export async function archiveCategory(db: CadenceDb, id: string, nowMs: number): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const now = toIso(nowMs)
    const children = await db.categories.where('parentId').equals(id).toArray()
    const ids = [id, ...children.filter((c) => c.archivedAt === null).map((c) => c.id)]
    await db.categories.where('id').anyOf(ids).modify({ archivedAt: now, updatedAt: now })
  })
}

/** Un-archives a category (see `restorePlan` for which relatives come back with it). */
export async function restoreCategory(db: CadenceDb, id: string, nowMs: number): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const plan = restorePlan(id, await db.categories.toArray())
    if (!plan.ok) throw new Error(plan.error)
    await db.categories.where('id').anyOf(plan.ids).modify({ archivedAt: null, updatedAt: toIso(nowMs) })
  })
}

/** Reads the active session, refusing (not discarding) a record that fails validation. */
export async function getActiveSession(db: CadenceDb): Promise<ActiveSession | null> {
  const stored = await db.activeSession.get(ACTIVE_SLOT)
  if (stored === undefined) return null
  const problem = activeSessionProblem(stored)
  if (problem) throw new Error(`The stored active session is unreadable (${problem}).`)
  const { slot: _slot, ...active } = stored
  return active
}

async function requireActive(db: CadenceDb): Promise<ActiveSession> {
  const active = await getActiveSession(db)
  if (!active) throw new Error('There is no active session.')
  return active
}

export async function startActiveSession(
  db: CadenceDb,
  input: { categoryId: string; title?: string | null },
  nowMs: number,
): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, db.categories, async () => {
    if ((await db.activeSession.count()) > 0) throw new Error('A session is already in progress.')
    const category = await db.categories.get(input.categoryId)
    if (!category || category.archivedAt !== null) throw new Error('Choose an available category.')
    const active = startSession({ id: newId(), ...input, nowMs })
    await db.activeSession.add({ ...active, slot: ACTIVE_SLOT })
    return active
  })
}

export async function pauseActiveSession(db: CadenceDb, nowMs: number): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    const next = pauseSession(await requireActive(db), nowMs)
    await db.activeSession.put({ ...next, slot: ACTIVE_SLOT })
    return next
  })
}

export async function resumeActiveSession(db: CadenceDb, nowMs: number): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    const next = resumeSession(await requireActive(db), nowMs)
    await db.activeSession.put({ ...next, slot: ACTIVE_SLOT })
    return next
  })
}

/** Sets or clears the title of the session in progress. */
export async function setActiveTitle(db: CadenceDb, title: string | null, nowMs: number): Promise<ActiveSession> {
  return db.transaction('rw', db.activeSession, async () => {
    const next = retitleSession(await requireActive(db), title, nowMs)
    await db.activeSession.put({ ...next, slot: ACTIVE_SLOT })
    return next
  })
}

/** Saves the active session to history and clears the active slot, atomically. */
export async function finishActiveSession(db: CadenceDb, nowMs: number): Promise<Session> {
  return db.transaction('rw', db.activeSession, db.sessions, async () => {
    const session = finishSession(await requireActive(db), nowMs)
    await db.sessions.add(session)
    await db.activeSession.delete(ACTIVE_SLOT)
    return session
  })
}

/** Discards the active session without saving it. Callers must confirm with the user first. */
export async function cancelActiveSession(db: CadenceDb): Promise<void> {
  await db.activeSession.delete(ACTIVE_SLOT)
}

/** Saved sessions that intersect `[windowStartMs, windowEndMs)`, oldest first. */
export async function sessionsOverlapping(
  db: CadenceDb,
  windowStartMs: number,
  windowEndMs: number,
): Promise<Session[]> {
  // Instants are stored as UTC `toISOString()` strings, which sort chronologically.
  const windowEnd = toIso(windowEndMs)
  const sessions = await db.sessions.where('endedAt').above(toIso(windowStartMs)).toArray()
  return sessions.filter((s) => s.startedAt < windowEnd).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** Saves a retrospective session after validating it against current categories. */
export async function addManualSession(
  db: CadenceDb,
  draft: SessionDraft,
  nowMs: number,
  reflection?: Reflection,
): Promise<Session> {
  return db.transaction('rw', db.sessions, db.categories, async () => {
    const problems = [
      ...draftProblems(draft, { categories: await db.categories.toArray(), nowMs }),
      ...(reflection ? reflectionProblems(reflection) : []),
    ]
    if (problems.length > 0) throw new Error(problems.join(' '))
    const created = createManualSession(newId(), draft, nowMs)
    const session = reflection ? applyReflection(created, reflection, nowMs) : created
    await db.sessions.add(session)
    return session
  })
}

/**
 * Corrects a saved session. The creation time is preserved, and so are the
 * reflection fields unless a new `reflection` is supplied.
 */
export async function updateSession(
  db: CadenceDb,
  id: string,
  draft: SessionDraft,
  nowMs: number,
  reflection?: Reflection,
): Promise<Session> {
  return db.transaction('rw', db.sessions, db.categories, async () => {
    const existing = await db.sessions.get(id)
    if (!existing) throw new Error('That session no longer exists.')
    const problems = [
      ...draftProblems(draft, {
        categories: await db.categories.toArray(),
        nowMs,
        keepCategoryId: existing.categoryId,
      }),
      ...(reflection ? reflectionProblems(reflection) : []),
    ]
    if (problems.length > 0) throw new Error(problems.join(' '))
    const edited = applySessionEdit(existing, draft, nowMs)
    const session = reflection ? applyReflection(edited, reflection, nowMs) : edited
    await db.sessions.put(session)
    return session
  })
}

/** Sets or clears the optional reflection on a saved session, leaving everything else as it is. */
export async function updateReflection(
  db: CadenceDb,
  id: string,
  reflection: Reflection,
  nowMs: number,
): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const existing = await db.sessions.get(id)
    if (!existing) throw new Error('That session no longer exists.')
    const problems = reflectionProblems(reflection)
    if (problems.length > 0) throw new Error(problems.join(' '))
    const session = applyReflection(existing, reflection, nowMs)
    await db.sessions.put(session)
    return session
  })
}

/** Permanently removes a saved session. Callers must confirm with the user first. */
export async function deleteSession(db: CadenceDb, id: string): Promise<void> {
  await db.sessions.delete(id)
}

/** A consistent snapshot of everything stored, as a backup payload. */
export async function exportBackup(db: CadenceDb, nowMs: number): Promise<Backup> {
  return db.transaction('r', db.categories, db.sessions, db.activeSession, async () =>
    buildBackup(
      {
        categories: await db.categories.toArray(),
        sessions: await db.sessions.orderBy('startedAt').toArray(),
        activeSession: await getActiveSession(db),
      },
      nowMs,
    ),
  )
}

export async function storedCounts(db: CadenceDb): Promise<{ categories: number; sessions: number; active: number }> {
  return db.transaction('r', db.categories, db.sessions, db.activeSession, async () => ({
    categories: await db.categories.count(),
    sessions: await db.sessions.count(),
    active: await db.activeSession.count(),
  }))
}

/**
 * Replaces every stored category and session with a validated backup, in one
 * transaction: either all of it is applied or nothing changes. Destructive;
 * callers must confirm with the user first. Refuses while a timer is in
 * progress, and never restores the backup's unfinished session as a live timer.
 */
export async function replaceAllData(db: CadenceDb, backup: Backup): Promise<void> {
  await db.transaction('rw', db.categories, db.sessions, db.activeSession, async () => {
    if ((await db.activeSession.count()) > 0) {
      throw new Error('Finish or cancel the session in progress before restoring a backup.')
    }
    await db.categories.clear()
    await db.sessions.clear()
    // Backups made before inks existed have none; assign them as a fresh install would.
    await db.categories.bulkAdd(assignMissingInks(backup.categories))
    await db.sessions.bulkAdd(backup.sessions)
  })
}

/** The most recently finished sessions, newest first. Enough to order activities by recent use. */
export async function recentSessions(db: CadenceDb, limit = 200): Promise<Session[]> {
  return db.sessions.orderBy('endedAt').reverse().limit(limit).toArray()
}
