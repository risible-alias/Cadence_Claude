import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useAction } from '../../app/hooks'
import { db } from '../../db/db'
import { exportBackup, replaceAllData, storedCounts } from '../../db/repo'
import { parseBackupText, type Backup } from '../../domain/backup'
import { categoryLabel } from '../../domain/categories'
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
      const summary = `${plural(backup.sessions.length, 'session')} and ${plural(backup.categories.length, 'activity')}`
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
      setNotice(`Restored ${plural(backup.sessions.length, 'session')} and ${plural(backup.categories.length, 'activity')}.`)
    })

  return (
    <>
      <p className="prose">
        Everything is kept in this browser on this device and nowhere else. It is not synced, and clearing site data
        removes it. A backup is a single file you can store wherever you trust.
      </p>

      <button type="button" className="plate wide" disabled={busy} onClick={() => void exportNow()}>
        Export backup (JSON)
      </button>
      {pending && (
        <div className="pair" style={{ marginTop: '0.7rem' }}>
          <button type="button" className="plate full" onClick={() => sharePending(pending.file, pending.summary)}>
            Save or share file
          </button>
          <button
            type="button"
            className="plate"
            onClick={() => {
              downloadFile(pending.file)
              setNotice(`Exported ${pending.summary} to ${pending.file.name}. ${SENSITIVE}`)
              setPending(null)
            }}
          >
            Download instead
          </button>
        </div>
      )}

      {storage.state !== 'unsupported' && (
        <p className="hint" style={{ marginTop: '0.8rem' }} data-testid="storage-status">
          {storage.state === 'persisted' ? (
            'This browser has agreed not to clear this data automatically. You can still remove it by clearing site data.'
          ) : (
            <>
              This browser may clear this data automatically if storage runs low or the site goes unused.{' '}
              <button type="button" className="textbtn" style={{ minHeight: 0 }} onClick={storage.request}>
                Ask it to keep the data
              </button>
              {storage.declined ? ' (it declined; installing the app or using it regularly can help).' : '.'}
            </>
          )}
        </p>
      )}

      <label className="field" style={{ marginTop: '1.6rem' }}>
        <span>Restore from a backup file</span>
        <input
          key={inputKey}
          type="file"
          // Extension and both MIME types: iOS and macOS file pickers differ in which they honour.
          accept=".json,application/json,text/json"
          disabled={busy}
          onChange={(e) => void chooseFile(e.target.files?.[0])}
        />
      </label>
      <p className="hint">
        Restoring replaces everything stored here with the file's contents. The file is checked first and you confirm
        before anything changes.
      </p>

      {chosen && 'errors' in chosen && (
        <div role="alert" className="alert">
          <p>
            <strong>“{chosen.name}” cannot be restored. Nothing was changed.</strong>
          </p>
          <ul>
            {chosen.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {chosen && 'backup' in chosen && (
        <div data-testid="restore-preview">
          <BackupSummary name={chosen.name} backup={chosen.backup} />

          {timerRunning ? (
            <p role="alert" className="alert">
              Finish or cancel the session in progress before restoring.
            </p>
          ) : (
            <>
              {hasData && (
                <div className="alert">
                  <p>
                    <strong>This deletes what is stored now:</strong> {plural(counts.sessions, 'session')} and{' '}
                    {plural(counts.categories, 'activity')}. It is not merged with the file. Export a backup of the
                    current data first if you might want it back.
                  </p>
                  <label className="check">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    <span>Replace all data on this device with this backup</span>
                  </label>
                </div>
              )}
              <div className="pair">
                <button
                  type="button"
                  className={hasData ? 'plate' : 'plate full'}
                  disabled={busy || counts === undefined || (hasData && !confirmed)}
                  onClick={() => void restore(chosen.backup)}
                >
                  {hasData ? 'Replace all data' : 'Restore backup'}
                </button>
                <button
                  type="button"
                  className={hasData ? 'plate full' : 'plate'}
                  disabled={busy}
                  onClick={() => {
                    setChosen(null)
                    setConfirmed(false)
                    setInputKey((k) => k + 1)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <p role="status" className="saved" style={notice ? { marginTop: '0.8rem' } : undefined}>
        {notice}
      </p>
    </>
  )
}

function BackupSummary({ name, backup }: { name: string; backup: Backup }) {
  const archived = backup.categories.filter((c) => c.archivedAt !== null).length
  const earliest = backup.sessions.reduce((min, s) => Math.min(min, toMs(s.startedAt)), Infinity)
  const latest = backup.sessions.reduce((max, s) => Math.max(max, toMs(s.endedAt)), -Infinity)
  const unfinished = backup.activeSession

  return (
    <div className="summarybox">
      <p>
        <strong>“{name}” is a valid backup.</strong>
      </p>
      <ul>
        <li>Exported {dateTime.format(toMs(backup.exportedAt))}</li>
        <li>
          {plural(backup.categories.length, 'activity')}
          {archived > 0 ? ` (${archived} archived)` : ''}
        </li>
        <li>
          {plural(backup.sessions.length, 'session')}
          {backup.sessions.length > 0 ? `, from ${dateOnly.format(earliest)} to ${dateOnly.format(latest)}` : ''}
        </li>
        {unfinished && (
          <li>
            A timer was in progress when this was exported ({categoryLabel(unfinished.categoryId, backup.categories)},
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
