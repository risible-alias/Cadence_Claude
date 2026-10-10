import { dismissOfflineReady, reloadToUpdate, usePwa } from './pwa'

export function UpdateBanner() {
  const { updateReady, offlineReady } = usePwa()
  if (!updateReady && !offlineReady) return null

  return (
    <div role="status" className="banner">
      {updateReady ? (
        <>
          <p>A new version of Cadence is ready. Your data and any running timer are kept.</p>
          <button type="button" className="plate slim full" onClick={reloadToUpdate}>
            Reload to update
          </button>
        </>
      ) : (
        <>
          <p>Cadence is ready to work offline on this device.</p>
          <button type="button" className="plate slim" onClick={dismissOfflineReady}>
            OK
          </button>
        </>
      )}
    </div>
  )
}
