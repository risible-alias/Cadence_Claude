import { isStandalone, promptInstall, usePwa } from '../../app/pwa'

/** How to install, shown only in a browser tab. The installed app has no use for it. */
export function InstallPanel() {
  const { canPromptInstall } = usePwa()
  if (isStandalone()) return null

  return (
    <section className="part" aria-labelledby="install-heading">
      <h2 id="install-heading">Install</h2>
      <p className="prose">Installed, Cadence opens like an app and works without a connection once it has loaded.</p>
      {canPromptInstall && (
        <button type="button" className="plate wide full" style={{ marginBottom: '1rem' }} onClick={() => void promptInstall()}>
          Install Cadence
        </button>
      )}
      <ul className="steps">
        <li>
          <strong>iPhone or iPad:</strong> in Safari, tap Share, then “Add to Home Screen”.
        </li>
        <li>
          <strong>Mac, Safari:</strong> File menu, then “Add to Dock”.
        </li>
        <li>
          <strong>Chrome or Edge:</strong> the install icon in the address bar, or the menu’s “Install” item.
        </li>
      </ul>
      <p className="hint" style={{ marginTop: '0.8rem' }}>
        On iPhone, iPad and Mac Safari the installed app starts with its own empty storage. To bring your data across,
        export a backup here first, then restore it in the installed app. Each device keeps its own data.
      </p>
    </section>
  )
}
