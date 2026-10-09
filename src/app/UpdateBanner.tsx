import { Button } from '../components/Button'
import { dismissOfflineReady, reloadToUpdate, usePwa } from './pwa'

export function UpdateBanner() {
  const { updateReady, offlineReady } = usePwa()
  if (!updateReady && !offlineReady) return null

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-600 bg-teal-50 px-4 py-2 text-base dark:bg-teal-950/40"
    >
      {updateReady ? (
        <>
          <p>A new version of Cadence is ready. Your data and any running timer are kept.</p>
          <Button variant="primary" onClick={reloadToUpdate}>
            Reload to update
          </Button>
        </>
      ) : (
        <>
          <p>Cadence is ready to work offline on this device.</p>
          <Button onClick={dismissOfflineReady}>OK</Button>
        </>
      )}
    </div>
  )
}
