import { useEffect, useState } from 'react'
import { localDayWindow } from '../domain/time'

/**
 * The current time, refreshed every `intervalMs` and whenever the page becomes
 * visible again. This only triggers re-rendering; durations are always derived
 * from stored timestamps, never from counting ticks.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}

/** Start of the current local day (ms). Only changes, and re-renders, at local midnight. */
export function useTodayStartMs(): number {
  const [startMs, setStartMs] = useState(() => localDayWindow(new Date()).startMs)
  useEffect(() => {
    const check = () => setStartMs(localDayWindow(new Date()).startMs)
    const id = window.setInterval(check, 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return startMs
}

/** Runs async actions one at a time and exposes any failure for display. */
export function useAction(): {
  busy: boolean
  error: string | null
  run: (action: () => Promise<void>) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

export const TABS = ['track', 'explore', 'settings'] as const
export type Tab = (typeof TABS)[number]

const tabFromHash = (): Tab => TABS.find((t) => `#${t}` === window.location.hash) ?? 'track'

/**
 * The current section, kept in the address (#track, #explore, #settings) so
 * the browser's back button and a reload both land where the user was.
 */
export function useTab(): Tab {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  useEffect(() => {
    const sync = () => {
      setTab(tabFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return tab
}
