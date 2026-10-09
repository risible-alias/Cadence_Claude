import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Chromium's install prompt event; not in the standard DOM typings. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** A new version has been downloaded and is waiting for a reload. */
  updateReady: boolean
  /** The app shell has just been cached for the first time. */
  offlineReady: boolean
  /** The browser can show its own install dialog (Chromium only). */
  canPromptInstall: boolean
}

let state: PwaState = { updateReady: false, offlineReady: false, canPromptInstall: false }
const listeners = new Set<() => void>()
const set = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

let installEvent: InstallPromptEvent | null = null
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installEvent = event as InstallPromptEvent
  set({ canPromptInstall: true })
})
window.addEventListener('appinstalled', () => {
  installEvent = null
  set({ canPromptInstall: false })
})

// The service worker only exists in production builds. A new version never
// takes over by itself: it waits until the user chooses to reload, so a page
// in use is not swapped underneath them and stale versions do not linger.
const applyUpdate = registerSW({
  onNeedRefresh: () => set({ updateReady: true }),
  onOfflineReady: () => set({ offlineReady: true }),
  onRegisteredSW: (_url, registration) => {
    if (!registration) return
    // An installed app can stay open for days, so look for updates whenever it is brought back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => undefined)
    })
  },
})

export function usePwa(): PwaState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, () => state)
}

export const reloadToUpdate = () => void applyUpdate(true)
export const dismissOfflineReady = () => set({ offlineReady: false })

export async function promptInstall(): Promise<void> {
  if (!installEvent) return
  await installEvent.prompt()
  await installEvent.userChoice
  installEvent = null
  set({ canPromptInstall: false })
}

/** Running as an installed app (home screen, Dock or app window) rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
