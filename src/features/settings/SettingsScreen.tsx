import type { Category } from '../../domain/types'
import { BackupPanel } from '../backup/BackupPanel'
import { CategoryManager } from '../categories/CategoryManager'
import { InstallPanel } from '../install/InstallPanel'

export function SettingsScreen({ categories }: { categories: Category[] }) {
  return (
    <>
      <header className="mast">
        <h1>Settings</h1>
      </header>

      <section className="part" aria-labelledby="activities-heading">
        <h2 id="activities-heading">Activities</h2>
        <CategoryManager categories={categories} />
      </section>

      <section className="part" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Keeping your record</h2>
        <BackupPanel />
      </section>

      <InstallPanel />

      <section className="part" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        <dl className="facts">
          <dt>Week begins</dt>
          <dd>Monday</dd>
          <dt>Appearance</dt>
          <dd>Follows the device</dd>
          <dt>Reflection after finishing</dt>
          <dd>Offered, never required</dd>
        </dl>
        <p className="hint" style={{ marginTop: '0.6rem' }}>
          These are how Cadence works today; they are not yet adjustable.
        </p>
      </section>
    </>
  )
}
