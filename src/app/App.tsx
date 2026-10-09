import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { cardClass, errorClass, mutedClass } from '../components/fields'
import { db } from '../db/db'
import { getActiveSession } from '../db/repo'
import { categoryPath } from '../domain/categories'
import type { ActiveSession } from '../domain/types'
import { CategoryManager } from '../features/categories/CategoryManager'
import { BackupPanel } from '../features/backup/BackupPanel'
import { InstallPanel } from '../features/install/InstallPanel'
import { HistoryPanel } from '../features/history/HistoryPanel'
import { TimerPanel } from '../features/timer/TimerPanel'
import { UpdateBanner } from './UpdateBanner'

type ActiveResult = { ok: true; active: ActiveSession | null } | { ok: false; error: string }

export function App() {
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const activeResult = useLiveQuery(
    (): Promise<ActiveResult> =>
      getActiveSession(db).then(
        (active) => ({ ok: true, active }),
        (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      ),
    [],
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState('')

  const loading = categories === undefined || activeResult === undefined

  // Make an in-progress session visible in the tab, window and app switcher.
  const active = activeResult?.ok ? activeResult.active : null
  const activeLabel = active && categories ? categoryPath(active.categoryId, categories) : null
  useEffect(() => {
    document.title = active ? `${active.state === 'running' ? '▶' : '⏸'} ${activeLabel} · Cadence` : 'Cadence'
  }, [active?.state, activeLabel])

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
      <header className="mb-4 flex items-baseline justify-between sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cadence</h1>
        <p className={mutedClass}>Stored only on this device</p>
      </header>
      <UpdateBanner />

      {loading ? (
        <p className={mutedClass}>Loading…</p>
      ) : (
        <main className="grid gap-4 md:grid-cols-2 md:items-start md:gap-6">
          {activeResult.ok ? (
            <TimerPanel
              categories={categories}
              active={activeResult.active}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />
          ) : (
            <section className={cardClass} aria-labelledby="timer-heading">
              <h2 id="timer-heading" className="mb-2 text-lg font-semibold">
                Current session
              </h2>
              <p role="alert" className={errorClass}>
                {activeResult.error} Nothing has been deleted; the record is still stored on this device.
              </p>
            </section>
          )}
          {/* Second on phones, right-hand column on wider screens. */}
          <div className="md:col-start-2 md:row-span-4 md:row-start-1">
            <HistoryPanel categories={categories} active={activeResult.ok ? activeResult.active : null} />
          </div>
          <CategoryManager categories={categories} onCreated={setSelectedCategoryId} />
          <BackupPanel />
          <InstallPanel />
        </main>
      )}
    </div>
  )
}
