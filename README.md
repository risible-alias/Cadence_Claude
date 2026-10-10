# Cadence

A local-first activity tracker (React + TypeScript + Vite + Tailwind CSS + Dexie/IndexedDB).
See [PRODUCT.md](PRODUCT.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the specification.

No account, backend, AI, telemetry or network requests: everything is stored in this
browser's IndexedDB.

## Status

Milestones 1–5 are implemented, now in the redesigned "journal" interface. Charts beyond the
weekly bars, statistics and CSV export are not built.

- **Installable, offline-capable PWA.**
- **Three sections:** Track, Explore and Settings, with a small frosted-glass navigation pane.
- **Activities** (categories) in a two-level hierarchy, each marked with one of a curated set
  of inks.
- **Timer:** one session at a time; begin, pause, resume, finish, discard; survives reloads.
- **Optional reflections:** concentration, mental fatigue and notes, each independently optional.
- **History:** a to-scale day timeline and a week view, filterable by activity; manual entry,
  editing and deleting.
- **Backup:** export to JSON and validated restore.

## The interface

Activities are always shown specific name first: "Violin — Music", or "Violin" with "Music" as
secondary text. (The code and the data format call them *categories*; the interface says
*activities*.)

### Track

- **Beginning:** the four most recently used activities appear as large ledger rows (about 82px
  high): a margin line in the activity's ink, its name, its group and when it was last used.
  One tap starts the timer. "Other activities" opens the rest in place. With no activities yet,
  the screen says so and links to Settings.
- **While a session runs:** the activity's name, a large left-set timer of active time, a thin
  line in the activity's ink showing the session so far (pauses hatched), and the start time,
  elapsed time and paused time in words. Pause/Resume and Finish are the two main controls.
- **Other options** (closed by default) holds the optional title and "Discard this session",
  which asks for confirmation.
- **After Finish** the session is already saved. A quiet "Add a reflection (optional)" link
  appears; ignoring it needs no action.
- **Today so far** sits below: the total, a line of the day with each session in its ink, and
  the day's sessions. Tapping one opens it for editing.

### Explore

- **Day** is a timeline drawn to scale from the recorded sessions: hours in the margin, each
  session a block washed in its ink, pauses as a hatched notch on its margin line. A session
  that began the previous day is listed above the scale with only this day's share. Sessions
  that overlap, or are too short to label without colliding, sit side by side. The session in
  progress is drawn dashed, labelled, not editable and not counted. Tap a block to edit it.
- **Week** (Monday to Sunday) shows the total, a stacked bar per day by top-level group, the
  groups with their time and share, a per-activity breakdown, and each day with its total; a
  day opens in the Day view.
- **The date** is plain text between two arrows. The native date picker lies invisibly over the
  text, so tapping it opens the system picker but its width can never push the row out of line.
- **Filter** by one activity; a group includes its sub-activities.
- **Add a past session** opens the same sheet used for editing.

There is no "Patterns" view yet. The design prototypes sketched one with invented data; nothing
of it was carried into the app.

### Settings

- **Activities:** the list with each activity's ink named beside its mark; tap one to rename it,
  change its ink or archive it. Add an activity on its own or inside another. Archived
  activities can be restored.
- **Keeping your record:** export and restore (see Backup and restore), and whether the browser
  treats the data as persistent.
- **Install** guidance (hidden once installed) and a short About list of fixed behaviours.

### Navigation and layout

- On a phone the navigation is a small pane floating above the foot of the screen, with a
  marker that slides between the three words. The page keeps enough space at its foot that the
  last control always scrolls clear of the pane, and the pane hides while a sheet is open.
- From 768px wide (iPad, desktop) the pane moves to the head of the page and stays in view while
  the page scrolls beneath it. Content stays in a single book-width column.
- The section is kept in the address (`#track`, `#explore`, `#settings`), so reload and the Back
  button behave as expected.
- Fallbacks: with reduced transparency or increased contrast the pane is solid; without
  `backdrop-filter` support it is nearly opaque; with reduced motion the marker does not slide.
  Safe-area insets are respected.
- Sheets (editing a session or an activity) use the native `<dialog>`: rising from the foot on a
  phone, centred on wider screens, and falling back to an in-page panel without modal support.

## Colour system

All colour comes from tokens in `src/styles/tokens.css`; components never hold colour values.

**Rules**

1. **Colour means category, and only that.** An activity keeps its ink in lists, on the
   timeline and in charts.
2. **Status is never colour alone.** In progress: a filled pip, an unbroken line, the words.
   Paused: a hollow pip and hatching. Completed: a square mark and a washed block. Not yet
   saved: an open mark and a dashed edge.
3. **Totals across categories are plain ink.**
4. **Text is never coloured.** A mark sits beside a name, and the ink is named in words where
   it is chosen. Errors and warnings are set off by a rule and wording, not by a warning colour.
5. **Focus is plain ink** with a gap of paper, so it cannot be mistaken for a category.

**Foundation:** paper (page, raised, sunk), ink (primary, soft, faint), two rules. Dark mode
has its own values rather than an inversion.

**Inks**

| Ink | Light | Dark |
|---|---|---|
| Lapis | `#1f4db3` | `#6690ec` |
| Oxblood | `#a52a20` | `#e25c55` |
| Plum | `#8e3f92` | `#ad6cba` |
| Forest | `#08775a` | `#2a9d80` |
| Brass | `#b3811a` | `#b08f24` |

Lapis and oxblood are richer than in the prototype, and the dark paper is lighter
(`#22201c`). The set was checked in both modes for separation under the common forms of colour
blindness (for marks that sit next to each other), for separation with full colour vision, and
for at least 3:1 contrast against paper.

**How inks are assigned**

- There are five inks and no limit on the number of activities. Inks are reused freely.
- Each top-level activity stores an ink. A new one is given the ink least used by the other
  top-level activities (palette order on a tie), so the first five each get their own.
- A sub-activity follows its group's ink unless given its own in Settings; it can go back to
  following.
- An ink is stored on the activity itself (`color` holds the ink's id, e.g. `"forest"`).
  Nothing is derived from position or count, so adding, archiving, restoring or reordering
  activities never changes another's ink.
- Reports and charts group by activity, never by ink. Two groups in the same ink remain two
  rows and two bar segments, separated by a gap of paper and named in the list beneath.
- **Adding an ink** is three small edits: the id in `INKS` (`src/domain/inks.ts`), and its
  token lines and `.ink-<id>` rule in `tokens.css`. The palette order should be re-checked for
  colour-blind separation when it changes.

**Existing data.** The `color` field already existed and was always `null`. On first launch of
this version a database upgrade (schema version 2) gives each existing top-level activity an
ink, oldest first; sessions are untouched. Backups keep `schemaVersion: 1`: old backups restore
and are given inks the same way, and new backups differ only in having `color` filled in.

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

- Finishing a session saves it at once. The reflection is offered afterwards and can be ignored.
- Concentration and mental fatigue are 1–10 choices with an explicit "Not answered" option,
  which is the initial state, so no score is ever recorded by default. Notes are free text (up
  to 2000 characters).
- Each field is stored separately and unanswered fields are stored as `null`, never `0`.
- All three can be changed or cleared later from a session's edit sheet, and set when adding a
  past session.
- Reflections never affect recorded times or totals.

## How time is counted

- **Elapsed** is the whole span from start to end. **Active** is elapsed minus pauses. Totals
  always use active time; the timer and the edit sheet state elapsed and paused as well.
- Durations are shown to the minute ("1 h 22 m"), rounded down, and in seconds only under a
  minute. The running timer shows seconds. Stored times keep full precision.
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
  button reads "Save with overlap". Overlapping sessions are both counted in daily totals, the
  day view says so, and the timeline sets them side by side. Back-to-back sessions, and time inside another session's pause, are not
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
              reflections, inks, history aggregation and timeline layout, backup
              validation, category rules (+ tests)
  db/         Dexie schema and transactional repository (+ tests)
  features/   timer/, categories/, history/, reflections/, backup/, install/, settings/ UI
  components/ category mark and name, sheet (dialog), rating field
  styles/     tokens.css (design tokens) and journal.css (the interface)
  app/        shell, navigation, hooks, wording helpers, service-worker registration
scripts/      icon generation
e2e/          Playwright tests (timer; editing and backup; reflections, week view,
              inks, navigation; offline)
design-prototypes/  the design exploration this interface came from; not part of the build
```

`src/domain` has no React or IndexedDB imports. Time-dependent functions take `nowMs` as an
argument; only UI event handlers call `Date.now()`. Everything a chart or the timeline shows is
calculated there (`history.ts`); the components only arrange it.

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
- **The glass navigation** uses `backdrop-filter` with the `-webkit-` prefix and the fallbacks
  described under Navigation and layout.
- **File export** uses the share sheet on iOS/iPadOS (see Backup and restore); **file import**
  accepts `.json` by extension and MIME type, and falls back to `FileReader` where `File.text()`
  is missing.
- **IDs** fall back to `crypto.getRandomValues` where `crypto.randomUUID` is unavailable
  (non-HTTPS pages).
- Layout respects the notch/home-indicator safe areas and uses 16px inputs to avoid iOS zoom.

## Deviations from the specs and assumptions

- **Instruction file.** The agent instructions live in `CLAUDE.md`; there is no `AGENTS.md`.
- **Three sections, not four.** PRODUCT.md suggests Track/History/Insights/Settings; the
  approved design has Track, Explore and Settings, with history under Explore and no Insights.
- **Styling.** ARCHITECTURE.md names Tailwind CSS. Tailwind remains for its reset, but the
  interface is hand-written CSS driven by design tokens (`src/styles`), because the journal
  design is built from a small set of named elements rather than utility classes.
- **Wording.** The interface says "activities"; the code, database and backup say "categories".
- **Inks.** The specs give categories an optional colour; this version stores an ink id there
  and requires one for top-level categories. See Colour system.
- **Title.** A title is added after starting (under Other options) or when editing, not before.
- **Time format.** Durations read "1 h 22 m" to the minute rather than with seconds.
- **Week start** is Monday and is not configurable.
- **Reflection offer after Finish is collapsed** behind a link rather than shown as an open
  form, so that finishing never presents anything to dismiss (PRODUCT.md §2.2).
- **Reflection scales** are labelled 1 = very low / 10 = very high (concentration) and
  1 = fresh / 10 = exhausted (fatigue); the specs give only the ranges.
- **Service worker:** generated by `vite-plugin-pwa` (Workbox), precache only, update on user
  confirmation. This adds a sizeable dev-only dependency tree in exchange for a maintained,
  well-tested caching implementation.
- **Icons** are a plain clock glyph in ink on paper tones, rendered from
  `scripts/generate-icons.mjs`; placeholder artwork.
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
- **Totals** count saved sessions only, not the session in progress.
- **One database migration:** schema version 2 assigns inks to existing top-level categories.
  Table layouts are unchanged, and sessions, the active session and earlier backups work as
  before. Once a device has run this version its database cannot be opened by the older one.
- **Tooling versions.** Current releases were used (Vite 8, React 19, Tailwind 4 via
  `@tailwindcss/vite`, TypeScript 7, Vitest 5, Dexie 4, vite-plugin-pwa 2). `fake-indexeddb` is a
  dev-only addition for testing the Dexie layer in Node.

## Known limitations

- **Not tested on real Apple devices.** The automated tests run in Chromium and in Playwright's
  WebKit build (Safari's engine) at desktop and iPhone sizes. That covers layout, navigation,
  sheets, date/time fields and import, but it is not Safari itself. Still to be checked by hand on an
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
- **Filters** are by one activity (with its sub-activities) only; there is no date-range view
  beyond a single day or week, and no search.
- **Colour.** Five inks cannot all be told apart by everyone: lapis and plum are the closest
  pair, more so in dark mode. A name always accompanies a mark, and nothing depends on colour
  alone. With more than five groups, inks repeat; in the week chart two same-ink groups are
  separated only by a thin gap and the list beneath.
- **Typeface.** The design relies on a book serif present on Apple devices (Iowan Old Style or
  Palatino). Other platforms fall back to Georgia and lose some of the character.
- **Week view** no longer lists every session under each day; open a day to see and edit them.
- **Moving an activity** to a different group is not possible; create a new one instead.
- **Preferences** (week start, appearance, reflection offer) are fixed and only described.
- **The sheet and glass pane** have been checked in Playwright's WebKit build, not on a physical
  iPhone; how the frosted pane looks over moving text is worth judging on a real device.
- A corrupt stored active session is reported and left in place rather than discarded; there is no
  in-app repair path yet (it also blocks export, since the export would be incomplete).
