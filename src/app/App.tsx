import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, type CSSProperties } from 'react'
import { db } from '../db/db'
import { getActiveSession } from '../db/repo'
import { categoryLabel } from '../domain/categories'
import type { ActiveSession } from '../domain/types'
import { ExploreScreen } from '../features/history/ExploreScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { TrackScreen } from '../features/timer/TrackScreen'
import { useTab, TABS } from './hooks'
import { UpdateBanner } from './UpdateBanner'

type ActiveResult = { ok: true; active: ActiveSession | null } | { ok: false; error: string }

const TAB_NAMES = { track: 'Track', explore: 'Explore', settings: 'Settings' } as const

export function App() {
  const tab = useTab()
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const activeResult = useLiveQuery(
    (): Promise<ActiveResult> =>
      getActiveSession(db).then(
        (active) => ({ ok: true, active }),
        (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      ),
    [],
  )
  const loading = categories === undefined || activeResult === undefined
  const active = activeResult?.ok ? activeResult.active : null

  // Make an in-progress session visible in the tab, window and app switcher.
  const activeLabel = active && categories ? categoryLabel(active.categoryId, categories) : null
  const activeState = active?.state
  useEffect(() => {
    document.title = activeState ? `${activeState === 'running' ? '▶' : '⏸'} ${activeLabel} · Cadence` : 'Cadence'
  }, [activeState, activeLabel])

  return (
    <>
      <UpdateBanner />
      {/* On a phone this floats above the foot of the page; on wider screens it sits at the head. */}
      <nav className="nav" aria-label="Sections" style={{ '--i': TABS.indexOf(tab) } as CSSProperties}>
        <span className="thumb" aria-hidden="true" />
        {TABS.map((t) => (
          <a key={t} href={`#${t}`} aria-current={t === tab ? 'page' : undefined}>
            {TAB_NAMES[t]}
          </a>
        ))}
      </nav>
      <main className="page">
        {loading ? (
          <p className="quiet">Loading…</p>
        ) : tab === 'track' ? (
          <TrackScreen categories={categories} active={active} activeError={activeResult.ok ? null : activeResult.error} />
        ) : tab === 'explore' ? (
          <ExploreScreen categories={categories} active={active} />
        ) : (
          <SettingsScreen categories={categories} />
        )}
      </main>
    </>
  )
}
