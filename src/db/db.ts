import Dexie, { type Table } from 'dexie'
import { assignMissingInks } from '../domain/inks'
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
    // v2: categories gain an ink. The stored shape is unchanged (the `color`
    // field already existed and was always null); this only fills it in for
    // top-level categories created before inks. Sessions are not touched.
    this.version(2)
      .stores({
        categories: 'id, parentId',
        sessions: 'id, startedAt, endedAt, categoryId',
        activeSession: 'slot',
      })
      .upgrade(async (tx) => {
        const table = tx.table<Category, string>('categories')
        const before = await table.toArray()
        const after = assignMissingInks(before)
        const changed = after.filter((c, i) => c.color !== before[i]!.color)
        if (changed.length > 0) await table.bulkPut(changed)
      })
  }
}

export const db = new CadenceDb()
