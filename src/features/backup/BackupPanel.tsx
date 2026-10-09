import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useAction } from '../../app/hooks'
import { Button } from '../../components/Button'
import { cardClass, errorClass, labelClass, mutedClass } from '../../components/fields'
import { db } from '../../db/db'
import { exportBackup, replaceAllData, storedCounts } from '../../db/repo'
import { parseBackupText, type Backup } from '../../domain/backup'
import { categoryPath } from '../../domain/categories'
import { toLocalInputValue, toMs } from '../../domain/time'
import { canShareFile, downloadFile, isIos, readFileText } from './files'

const MAX_FILE_BYTES = 50 * 1024 * 1024
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word.replace(/y$/, 'ie')}s`}`

const SENSITIVE = 'The file is unencrypted and contains everything you have recorded.'

type Chosen = { name: string; backup: Backup } | { name: string; errors: string[] }

export function BackupPanel() {
  const counts = useLiveQuery(() => storedCounts(db), [])
  const [notice, setNotice] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const [pending, setPending] = useState<{ file: File; summary: string } | null>(null)
  const storage = useStoragePersistence()
  const { busy, error, run } = useAction()

  const hasData = counts !== undefined && (counts.categories > 0 || counts.sessions > 0)
  const timerRunning = counts !== undefined && counts.active > 0

  const exportNow = () =>
    run(async () => {
      const now = Date.now()
      const backup = await exportBackup(db, now)
      const filename = `cadence-backup-${toLocalInputValue(now).replace(/[T:]/g, '-')}.json`
      const file = new File([JSON.stringify(backup, null, 2)], filename, { type: 'application/json' })
      const summary = `${plural(backup.sessions.length, 'session')} and ${plural(backup.categories.length, 'category')}`
      // On iPhone and iPad a blob download is unreliable, especially in the installed
      // app, so offer the share sheet ("Save to Files") instead. Sharing must start
      // directly from a tap, hence the separate button.
      if (isIos() && canShareFile(file)) {
        setPending({ file, summary })
        setNotice(`Backup of ${summary} is ready. Choose where to save it.`)
        return
      }
      downloadFile(file)
      setNotice(`Exported ${summary} to ${filename}. ${SENSITIVE}`)
    })

  const sharePending = (file: File, summary: string) => {
    navigator.share({ files: [file], title: file.name }).then(
      () => {
        setPending(null)
        setNotice(`Exported ${summary} as ${file.name}. ${SENSITIVE}`)
      },
      (e: unknown) => {
        // Closing the share sheet is not an error; the file stays ready.
        if (e instanceof DOMException && e.name === 'AbortError') return
        setNotice('Sharing failed. Try "Download instead".')
      },
    )
  }

  const chooseFile = (file: File | undefined) =>
    run(async () => {
      setNotice(null)
      setConfirmed(false)
      if (!file) return setChosen(null)
      if (file.size > MAX_FILE_BYTES) return setChosen({ name: file.name, errors: ['The file is too large to be a Cadence backup.'] })
      // Validated in full here; stored data is not touched until the user confirms.
      const result = parseBackupText(await readFileText(file), Date.now())
      setChosen(result.ok ? { name: file.name, backup: result.backup } : { name: file.name, errors: result.errors })
    })

  const restore = (backup: Backup) =>
    run(async () => {
      await replaceAllData(db, backup)
      setChosen(null)
      setConfirmed(false)
      setInputKey((k) => k + 1)
      setNotice(`Restored ${plural(backup.sessions.length, 'session')} and ${plural(backup.categories.length, 'category')}.`)
    })

  return (
    <section className={cardClass} aria-labelledby="backup-heading">
      <h2 id="backup-heading" className="mb-2 text-lg font-semibold">
        Backup
      </h2>
      <p className={`mb-3 ${mutedClass}`}>
        Your data exists only in this browser on this device. It is not synced, and clearing site data removes it.
        Export a backup file regularly and keep it somewhere safe.
      </p>

      <Button className="w-full" disabled={busy} onClick={() => void exportNow()}>
        Export backup (JSON)
      </Button>
      {pending && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => sharePending(pending.file, pending.summary)}>
            Save or share file
          </Button>
          <Button
            onClick={() => {
              downloadFile(pending.file)
              setNotice(`Exported ${pending.summary} to ${pending.file.name}. ${SENSITIVE}`)
              setPending(null)
            }}
          >
            Download instead
          </Button>
        </div>
      )}

      {storage.state !== 'unsupported' && (
        <p className={`mt-3 ${mutedClass}`} data-testid="storage-status">
          {storage.state === 'persisted' ? (
            'This browser has agreed not to clear this data automatically. You can still remove it by clearing site data.'
          ) : (
            <>
              This browser may clear this data automatically if storage runs low or the site goes unused.{' '}
              <button type="button" className="font-medium underline" onClick={storage.request}>
                Ask it to keep the data
              </button>
              {storage.declined ? ' (it declined; installing the app or using it regularly can help).' : '.'}
            </>
          )}
        </p>
      )}

      <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
        <label htmlFor="backup-file" className={labelClass}>
          Restore from a backup file
        </label>
        <input
          key={inputKey}
          id="backup-file"
          type="file"
          // Extension and both MIME types: iOS and macOS file pickers differ in which they honour.
          accept=".json,application/json,text/json"
          disabled={busy}
          className="block w-full text-base file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-4 file:text-base file:font-medium file:text-slate-900 dark:file:border-slate-600 dark:file:bg-slate-800 dark:file:text-slate-100"
          onChange={(e) => void chooseFile(e.target.files?.[0])}
        />
        <p className={`mt-1 ${mutedClass}`}>
          Restoring replaces everything stored here with the file's contents. The file is checked first and you
          confirm before anything changes.
        </p>
      </div>

      {chosen && 'errors' in chosen && (
        <div role="alert" className={`mt-3 ${errorClass}`}>
          <p className="font-semibold">“{chosen.name}” cannot be restored. Nothing was changed.</p>
          <ul className="list-disc pl-5">
            {chosen.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {chosen && 'backup' in chosen && (
        <div className="mt-3 grid gap-2" data-testid="restore-preview">
          <BackupSummary name={chosen.name} backup={chosen.backup} />

          {timerRunning ? (
            <p role="alert" className={errorClass}>
              Finish or cancel the session in progress before restoring.
            </p>
          ) : (
            <>
              {hasData && (
                <div className="grid gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  <p>
                    <strong className="font-semibold">This deletes what is stored now:</strong>{' '}
                    {plural(counts.sessions, 'session')} and {plural(counts.categories, 'category')}. It is not merged
                    with the file. Export a backup of the current data first if you might want it back.
                  </p>
                  <label className="flex min-h-11 items-center gap-3 text-base">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Replace all data on this device with this backup
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={hasData ? 'danger' : 'primary'}
                  disabled={busy || counts === undefined || (hasData && !confirmed)}
                  onClick={() => void restore(chosen.backup)}
                >
                  {hasData ? 'Replace all data' : 'Restore backup'}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setChosen(null)
                    setConfirmed(false)
                    setInputKey((k) => k + 1)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className={`mt-3 ${errorClass}`}>
          {error}
        </p>
      )}
      <p role="status" className={`${mutedClass} ${notice ? 'mt-3' : ''}`}>
        {notice}
      </p>
    </section>
  )
}

function BackupSummary({ name, backup }: { name: string; backup: Backup }) {
  const archived = backup.categories.filter((c) => c.archivedAt !== null).length
  const earliest = backup.sessions.reduce((min, s) => Math.min(min, toMs(s.startedAt)), Infinity)
  const latest = backup.sessions.reduce((max, s) => Math.max(max, toMs(s.endedAt)), -Infinity)
  const unfinished = backup.activeSession

  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
      <p className="font-semibold">“{name}” is a valid backup.</p>
      <ul className="list-disc pl-5">
        <li>Exported {dateTime.format(toMs(backup.exportedAt))}</li>
        <li>
          {plural(backup.categories.length, 'category')}
          {archived > 0 ? ` (${archived} archived)` : ''}
        </li>
        <li>
          {plural(backup.sessions.length, 'session')}
          {backup.sessions.length > 0
            ? `, from ${dateOnly.format(earliest)} to ${dateOnly.format(latest)}`
            : ''}
        </li>
        {unfinished && (
          <li>
            A timer was in progress when this was exported ({categoryPath(unfinished.categoryId, backup.categories)},
            started {dateTime.format(toMs(unfinished.startedAt))}). It will not be restored; add it as a past session
            if you need it.
          </li>
        )}
      </ul>
    </div>
  )
}

/** Whether the browser treats this origin's storage as persistent, and a way to ask for it. */
function useStoragePersistence(): {
  state: 'unsupported' | 'persisted' | 'best-effort'
  declined: boolean
  request: () => void
} {
  const manager = typeof navigator !== 'undefined' ? navigator.storage : undefined
  const supported = typeof manager?.persisted === 'function' && typeof manager.persist === 'function'
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [declined, setDeclined] = useState(false)

  useEffect(() => {
    if (!supported) return
    manager.persisted().then(setPersisted, () => setPersisted(false))
  }, [supported, manager])

  return {
    state: !supported || persisted === null ? 'unsupported' : persisted ? 'persisted' : 'best-effort',
    declined,
    request: () => {
      if (!supported) return
      manager.persist().then(
        (granted) => {
          setPersisted(granted)
          setDeclined(!granted)
        },
        () => setDeclined(true),
      )
    },
  }
}
