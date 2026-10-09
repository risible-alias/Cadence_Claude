import Dexie, { type Table } from 'dexie'
import type { ActiveSession, Category, Session } from '../domain/types'

/** The active session lives in a one-row table under this fixed key. */
export const ACTIVE_SLOT = 'current'
export type StoredActiveSession = ActiveSession & { slot: typeof ACTIVE_SLOT }

export class CadenceDb extends Dexie {
  categories!: Table<Category, string>
  sessions!: Table<Session, string>
  activeSession!: Table<StoredActiveSession, string>

  constructor(name = 'cadence') {
    super(name)
    // Add a new `.version(n)` with an upgrade step for any schema change;
    // never edit a released version in place.
    this.version(1).stores({
      categories: 'id, parentId',
      sessions: 'id, startedAt, endedAt, categoryId',
      activeSession: 'slot',
    })
  }
}

export const db = new CadenceDb()
