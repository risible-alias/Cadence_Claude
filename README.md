# Cadence

A local-first activity tracker (React + TypeScript + Vite + Tailwind CSS + Dexie/IndexedDB).
See [PRODUCT.md](PRODUCT.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the specification.

No account, backend, AI, telemetry or network requests: everything is stored in this
browser's IndexedDB.

## Status: milestones 1–5 (no charts yet)

Implemented:

- **Installable, offline-capable PWA:** manifest, icons, and a service worker that caches the
  built app so it loads and works with no connection after the first visit.
- **Categories:** create, rename, archive and restore, with a two-level hierarchy
  (e.g. Academics → Mathematics). Archiving never deletes sessions.
- **Timer:** one active session at a time with Start, Pause, Resume, Finish and Cancel (cancel
  asks for confirmation). The active session is persisted on every transition and restored after
  refresh/reopen.
- **Finishing saves immediately**, with no form in the way.
- **Optional reflections:** concentration (1–10), mental fatigue (1–10) and notes, each
  independently optional, offered after finishing and editable later.
- **Manual entry, editing and deleting** of saved sessions (delete needs a second confirmation).
- **History:** a day view and a week view (Monday to Sunday) with a category filter, per-category
  weekly breakdown, and navigation to earlier days and weeks.
- **In-progress session shown distinctly** from completed ones.
- **Backup:** export everything to a JSON file; restore from a file after validation, a preview
  and (if data exists) an explicit confirmation.

Not implemented yet: charts and statistics, CSV export, Track/History/Insights/Settings
navigation.

## Installing and offline use

Cadence must be served over HTTPS (or from `localhost`) to be installable; service workers do
not run on a plain-HTTP LAN address. For real use, deploy the `dist/` folder to any static host
you trust. It is only static files; no data is ever sent to the host.

- **iPhone / iPad:** open the site in Safari, tap Share, then "Add to Home Screen".
- **Mac (Safari 17+):** File → "Add to Dock".
- **Chrome / Edge:** the install icon in the address bar, or the in-app "Install Cadence" button.

Things to know:

- **Installed apps on Apple devices have their own storage.** A home-screen or Dock app does not
  see data recorded in the Safari tab, and each device is separate. To move data, export a backup
  in one place and restore it in the other.
- **Offline:** the whole built app (HTML, JS, CSS, icons) is precached on the first visit. A
  banner confirms when it is ready. After that, loading, timing, history, editing, export and
  restore all work offline, because the app makes no network requests of its own.
- **Updates are never applied behind your back.** When a new version has been downloaded, a
  banner offers "Reload to update"; until you accept, the version you are using keeps running.
  The app checks for a new version on load and whenever it returns to the foreground. Stored data
  and a running timer are unaffected by an update.
- **Storage protection:** the Backup card shows whether the browser treats this data as
  persistent and lets you ask for that. Browsers decide by their own rules; this is no substitute
  for exporting backups.
- The service worker exists only in production builds (`npm run build`, `npm run preview`), not
  under `npm run dev`.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` runs on every push to `main` (and on demand): it installs
dependencies, typechecks, runs the unit tests, builds, and publishes `dist/` to GitHub Pages.
A failing typecheck or test stops the deployment. Playwright tests are not run in CI.

One-time setup in the GitHub repository: **Settings → Pages → Build and deployment → Source:
"GitHub Actions"**. On a personal account, Pages for a *private* repository needs a paid GitHub
plan; a public repository works on the free plan. The published site is public either way, but
it contains only the app, never your recorded data.

A project site is served from `/<repository>/`, so the workflow passes that as `BASE_PATH` to
the build (`vite.config.ts` reads it; the default is `/`). The manifest's `start_url` and
`scope` are relative, so the installed app and service worker follow the same path. To check
such a build locally: `BASE_PATH=/Cadence_Claude/ npm run build && BASE_PATH=/Cadence_Claude/ npm run preview`.

Data is stored per origin and path-independent: moving the site to a different domain later
starts with empty storage there, so export a backup first.

## Reflections

- Finishing a session saves it at once. An "Add a reflection (optional)" button then appears
  under the timer; ignoring it needs no action and starting the next session removes it.
- Concentration and mental fatigue are 1–10 choices with an explicit "Not answered" option,
  which is the initial state, so no score is ever recorded by default. Notes are free text (up to
  2000 characters).
- Each field is stored separately and unanswered fields are stored as `null`, never `0`.
- All three can be changed or cleared later from a session's Edit dialog, and can be set when
  adding a past session.
- Reflections never affect recorded times or totals.

## History views

- **Day** (default) and **Week** share the same navigation: previous/next, a date picker, and a
  button back to today/this week. Future days and weeks cannot be selected.
- **Weeks run Monday to Sunday** in local time. The week total, the per-category breakdown and
  each day's total all use the overlap rule below, so day totals add up to the week total and a
  session crossing midnight (or the week boundary) is split correctly.
- **Category filter:** choosing a top-level category includes its sub-categories; archived
  categories can be chosen too. Totals and lists follow the filter.
- **The session in progress** appears in the day it is running through with a coloured edge,
  tinted background and a Running/Paused badge (text and icon shape, not colour alone). It cannot
  be edited there and is not counted in totals until finished. The Current session card gets the
  same accent, and the page title shows ▶ or ⏸ with the category.

## How time is counted

- **Elapsed** is the whole span from start to end. **Active** is elapsed minus pauses. Totals
  always use active time; a row shows elapsed and paused as well when they differ.
- Durations are derived from the start instant and pause intervals, never from a tick counter.
- **Manual entries have no pauses**, so their active time equals their elapsed time. To record a
  break, enter two sessions.
- **Editing a timed session keeps its recorded pauses.** If the new start or end cuts into a
  pause it is trimmed, and a pause left outside the new span is dropped; the dialog shows the
  resulting active/elapsed/paused figures before you save. A checkbox removes all pauses.
  Individual pauses cannot be edited.
- The edit form works in whole minutes. A time field you do not change keeps its stored value
  to the millisecond; one you change is set to the start of the chosen minute.
- **Midnight:** a day's total counts only the active time that falls inside that local day. A
  session from 23:30 to 00:45 appears on both days with its share of each, and the dialog shows
  the split.
- **Invalid ranges are refused:** end not after start, start or end in the future (a saved
  session is finished), dates before 2000, and local times that do not exist because the clocks
  went forward. A time that occurs twice when the clocks go back is taken as its first occurrence.
- **Overlaps are warned about, not blocked.** If a new or edited session shares active time with
  another saved session or with the timer in progress, the dialog lists the clashes and the
  button reads "Save with overlap". Overlapping sessions are both counted in daily totals, and
  the day view says so. Back-to-back sessions, and time inside another session's pause, are not
  overlaps. Finishing a timer is not checked against existing manual entries.

## Backup and restore

- **On iPhone and iPad**, Export prepares the file and then offers "Save or share file", which
  opens the system share sheet (choose "Save to Files"). Plain downloads are unreliable there,
  particularly in the installed app. "Download instead" remains available.
- **Export** produces `cadence-backup-YYYY-MM-DD-HH-mm.json`: all categories (including
  archived), all sessions with their pauses and reflection fields, and the timer in progress if
  there is one. The file is plain, unencrypted JSON; treat it as private.
- **Format:** `{ format: "cadence-backup", schemaVersion: 1, exportedAt, categories, sessions,
  activeSession }`, with records as described in ARCHITECTURE.md §3. `schemaVersion` is the
  backup layout version, separate from the app and database versions.
- **Restore is replace-all, not merge.** The file is fully validated first (structure, schema
  version, timestamps and their range, category references and depth, duplicate ids, pause
  intervals, ratings as whole numbers 1–10 or null). Any problem rejects the whole file and
  nothing is changed. A valid file shows a summary; if this device already has data you must tick
  a confirmation box before "Replace all data" is enabled. The replacement is one transaction.
- **Unfinished sessions are never restored as a running timer.** The preview tells you one was
  in progress at export time so you can add it as a past session.
- Restore is refused while a timer is in progress; finish or cancel it first.
- Unknown fields in a backup are ignored, and timestamps are normalised to UTC.

## Setup

Requires Node.js 20.19+ (developed on Node 26) and npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm test             # unit tests (Vitest; pure domain + Dexie on fake-indexeddb)
npm run test:e2e     # Playwright tests: Chromium and WebKit, desktop and phone sizes, plus offline
npm run icons        # regenerate the PNG app icons in public/ from scripts/generate-icons.mjs
npm run typecheck
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
```

The first E2E run needs browsers: `npx playwright install chromium webkit`. Playwright starts its
own dev server on port 5183, and builds and serves the production bundle on port 4183 for the
offline tests. Unit tests run with `TZ=Europe/London` (set in `vite.config.ts`) so the
daylight-saving cases are deterministic.

To try it on an iPhone/iPad on the same network: `npm run dev -- --host`, then open the printed
network URL. Data there is separate from the Mac's (storage is per browser and origin). Over
plain HTTP like this the app runs but cannot be installed or work offline; that needs HTTPS.

## Structure

```
src/
  domain/     pure types, time arithmetic, timer state machine, session editing rules,
              reflections, history aggregation, backup validation, category rules (+ tests)
  db/         Dexie schema and transactional repository (+ tests)
  features/   timer/, categories/, history/, reflections/, backup/, install/ UI
  components/ shared button and field styles
  app/        shell, hooks, service-worker registration and update banner
scripts/      icon generation
e2e/          Playwright tests (timer; editing and backup; reflections, week view and
              filter; offline)
```

`src/domain` has no React or IndexedDB imports. Time-dependent functions take `nowMs` as an
argument; only UI event handlers call `Date.now()`.

## Browser support

Safari 16.4+ (iOS/iPadOS 16.4+, macOS Ventura with Safari 16.4+) and current Chrome, Edge and
Firefox. The floor comes from Tailwind CSS 4 and the default Vite build target. Installing to
the Dock on a Mac needs Safari 17 (macOS Sonoma).

Safari-specific handling:

- **Date and time fields** use native `datetime-local` and `date` inputs, which Safari supports
  on all the versions above. Values are parsed strictly; a time that does not exist because the
  clocks went forward is rejected rather than shifted.
- **Dialogs** use the native `<dialog>` element, with a non-modal fallback where `showModal` is
  missing.
- **Select menus** are restyled, because Safari on macOS ignores height on native ones.
- **File export** uses the share sheet on iOS/iPadOS (see Backup and restore); **file import**
  accepts `.json` by extension and MIME type, and falls back to `FileReader` where `File.text()`
  is missing.
- **IDs** fall back to `crypto.getRandomValues` where `crypto.randomUUID` is unavailable
  (non-HTTPS pages).
- Layout respects the notch/home-indicator safe areas and uses 16px inputs to avoid iOS zoom.

## Deviations from the specs and assumptions

- **Instruction file.** The agent instructions live in `CLAUDE.md`; there is no `AGENTS.md`.
- **Single screen.** PRODUCT.md suggests Track/History/Insights/Settings areas; everything is
  still on one scrolling screen.
- **Week start** is Monday and is not configurable.
- **Reflection offer after Finish is collapsed** behind a button rather than shown as an open
  form, so that finishing never presents anything to dismiss (PRODUCT.md §2.2).
- **Reflection scales** are labelled 1 = very low / 10 = very high (concentration) and
  1 = fresh / 10 = exhausted (fatigue); the specs give only the ranges.
- **Service worker:** generated by `vite-plugin-pwa` (Workbox), precache only, update on user
  confirmation. This adds a sizeable dev-only dependency tree in exchange for a maintained,
  well-tested caching implementation.
- **Icons** are a plain clock glyph rendered from `scripts/generate-icons.mjs`; placeholder
  artwork.
- **Startup with an active session.** ARCHITECTURE.md says to "offer to resume, finish, or correct
  it". The app restores the session in its stored state (running or paused) and shows the normal
  controls; there is no separate prompt. A session in progress cannot be edited until finished.
- **Finishing while paused** ends the session at the finish instant and closes the open pause
  there (per ARCHITECTURE.md §4), so `endedAt` is when Finish was tapped, not when Pause was.
- **Overlap policy** (warn, do not block) and **pause handling on edit** (trim to fit) are not
  specified; see "How time is counted".
- **Import** offers replace-all only, as ARCHITECTURE.md §6 prefers; there is no merge.
- **Backup contents.** There are no settings to export yet. CSV export is not implemented.
- **ActiveSession storage.** Stored as a single row keyed `slot: 'current'` in its own table; the
  `slot` field is a storage detail and is not part of the domain type or the backup.
- **Archiving a parent** also archives its sub-categories. **Restoring** a parent brings back the
  sub-categories archived in that same action; restoring a sub-category also restores its parent.
  A restore is refused if a live category now has the same name in the same place.
- **Duplicate names** are rejected among non-archived siblings (case-insensitive).
- **Category picker** is a plain `<select>`; recent categories are not surfaced yet.
- **Totals** count saved sessions only, not the session in progress.
- **No database migration** was needed: the IndexedDB schema is still version 1, so existing
  data, active sessions and earlier backups work unchanged.
- **Tooling versions.** Current releases were used (Vite 8, React 19, Tailwind 4 via
  `@tailwindcss/vite`, TypeScript 7, Vitest 5, Dexie 4, vite-plugin-pwa 2). `fake-indexeddb` is a
  dev-only addition for testing the Dexie layer in Node.

## Known limitations

- **Not tested on real Apple devices.** The automated tests run in Chromium and in Playwright's
  WebKit build (Safari's engine) at desktop and iPhone sizes. That covers layout, dialogs,
  date/time fields and import, but it is not Safari itself. Still to be checked by hand on an
  iPhone, iPad and Mac: Add to Home Screen / Add to Dock, launching offline from the icon, the
  native date/time pickers, the share-sheet export (tested only against a stand-in), and file
  selection in the Files picker.
- **Offline behaviour is tested in Chromium only**, against the production build. Safari's
  service worker implementation is not exercised by the tests.
- **Local data only.** IndexedDB belongs to one browser/origin/device. Nothing syncs between
  iPhone, iPad and Mac, and data can be lost by clearing site data, storage pressure, or private
  browsing. Safari may delete data for sites not opened in the browser for about a week;
  installing to the Home Screen or Dock avoids that rule. Export backups regularly; the app does
  not remind you or record when you last exported.
- **Moving data between devices, or from the Safari tab to the installed app,** is manual:
  export in one, restore in the other, which replaces whatever the second had.
- **Deleting a session is permanent** (after confirmation). There is no undo other than
  restoring a backup.
- **Wall-clock time.** Durations are differences of wall-clock instants. If the device clock is
  changed during a session the result is affected. A clock that moves backwards never produces
  negative or inverted intervals (transitions are pinned to the last recorded instant), but the
  recorded duration will be wrong; correct it by editing the saved session.
- **No notifications or background activity.** A running timer is just a stored start time; it
  keeps counting correctly while the app is closed, but nothing reminds you it is running.
- **Two tabs/windows.** State stays consistent across tabs (single active session enforced in a
  transaction, live queries update both), but this is not covered by automated tests.
- **Day and week boundaries** use the browser's current timezone; travelling changes which local
  day a past session falls in.
- **Filters** are by one category (with its sub-categories) only; there is no date-range view
  beyond a single day or week, and no search.
- A corrupt stored active session is reported and left in place rather than discarded; there is no
  in-app repair path yet (it also blocks export, since the export would be incomplete).
