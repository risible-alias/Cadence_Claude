import { isStandalone, promptInstall, usePwa } from '../../app/pwa'
import { Button } from '../../components/Button'
import { cardClass, mutedClass } from '../../components/fields'

/** How to install, shown only in a browser tab. The installed app has no use for it. */
export function InstallPanel() {
  const { canPromptInstall } = usePwa()
  if (isStandalone()) return null

  return (
    <section className={cardClass} aria-labelledby="install-heading">
      <h2 id="install-heading" className="mb-2 text-lg font-semibold">
        Install
      </h2>
      <p className={`mb-2 ${mutedClass}`}>
        Installed, Cadence opens like an app and works without a connection once it has loaded.
      </p>
      {canPromptInstall && (
        <Button variant="primary" className="mb-3 w-full" onClick={() => void promptInstall()}>
          Install Cadence
        </Button>
      )}
      <ul className={`list-disc space-y-1 pl-5 ${mutedClass}`}>
        <li>
          <strong className="font-semibold">iPhone or iPad:</strong> in Safari, tap Share, then “Add to Home Screen”.
        </li>
        <li>
          <strong className="font-semibold">Mac, Safari:</strong> File menu, then “Add to Dock”.
        </li>
        <li>
          <strong className="font-semibold">Chrome or Edge:</strong> the install icon in the address bar, or the menu’s
          “Install” item.
        </li>
      </ul>
      <p className={`mt-2 ${mutedClass}`}>
        On iPhone, iPad and Mac Safari the installed app starts with its own empty storage. To bring your data
        across, export a backup here first, then restore it in the installed app. Each device keeps its own data.
      </p>
    </section>
  )
}
