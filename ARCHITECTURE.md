# Cadence — Technical architecture (draft)

## 1. Stack

- **Language/UI:** TypeScript, React, Vite
- **Styles:** Tailwind CSS; use accessible native semantics
- **Persistence:** IndexedDB accessed through Dexie
- **Graphs (later):** Recharts
- **Testing:** Vitest for unit/integration; Playwright for critical end-to-end flows
- **PWA:** Manifest + service worker using a maintainable Vite PWA solution if appropriate; document offline behaviour
- **Current architecture:** Entirely client-side. No backend, login, AI API, or third-party analytics.

Use current compatible dependency versions after checking availability. Prefer minimal dependencies and avoid speculative architecture.

## 2. Source structure (suggestion, adapt as useful)

```
src/
  app/                  # app shell, navigation, routing
  features/
    timer/              # active session state and UI
    categories/         # category CRUD and tree
    history/            # list, filters, manual edits
    reflections/        # optional fields
    insights/           # aggregated stats and charts
    backup/             # JSON import/export; CSV export
  db/                   # Dexie schema, migrations, queries
  domain/               # pure types, time accounting, validation
  components/           # reusable accessible UI
  test/                 # helpers and fixtures
```

Pure domain functions must not directly access React or IndexedDB. This enables deterministic testing.

## 3. Suggested persisted entities

Schema is provisional; finalise before implementing features.

### Category
- `id: string` UUID
- `name: string`
- `parentId: string | null` — nullable, enabling a hierarchy; v0.1 UI may initially limit depth
- `color: string | null`
- `archivedAt: string | null` — ISO instant
- `createdAt`, `updatedAt`: ISO instants

### Session
- `id: string` UUID
- `categoryId: string`
- `title: string | null`
- `startedAt: string` — ISO instant (UTC or offset-aware)
- `endedAt: string` — ISO instant, required for saved finished sessions
- `pausedIntervals: Array<{ startedAt: string; endedAt: string }>` — ISO instants
- `notes: string | null`
- `concentration: number | null` — integer 1–10, null = not supplied
- `fatigue: number | null` — integer 1–10, null = not supplied
- `createdAt`, `updatedAt`: ISO instants

### ActiveSession
- Persist a distinct single active/draft session with `id`, `categoryId`, optional `title`, `startedAt`, `pausedIntervals` (completed), `state: 'running' | 'paused'`, `pauseStartedAt: string | null`, `updatedAt`. It becomes a `Session` on finish.

A single active session simplifies v0.1. Enforce uniqueness through application logic and atomic IndexedDB transactions where appropriate. Do not store an incrementing elapsed-seconds counter as the canonical truth.

### Metadata
- Database/schema version and settings as needed.
- Export schema version separate from application version.

## 4. Time accounting and invariants

**Invariants:** `startedAt <= endedAt`, pause intervals lie within the session, intervals are ordered and nonoverlapping, and at most one pause can be open on the active session. A paused session may finish; close the open pause interval at finish.

```
activeDuration = (endedAt - startedAt) - sum(pausedIntervalDurations)
```

For an active session, use current time as provisional end; subtract completed pauses and the currently open pause. A display tick may update once a second, but must always derive from timestamps instead of incrementing a counter. Validate against negative durations, bad input, overlapping pauses, and clock changes. Wall-clock time changes and timezone changes can affect elapsed time if solely based on wall-clock instants; document these edge cases and prioritize user correction for v0.1. Do not claim exact robustness under manual clock tampering.

**Daily/weekly aggregation:** For any reporting interval `[windowStart, windowEnd)`, intersect each session's active (non-paused) intervals with the reporting window and sum overlaps. This correctly handles midnight and daylight-saving boundaries if reporting windows are constructed in the selected local timezone. Do not simply assign an entire session to its start date or divide by a fixed 24-hour day.

**Time zone:** Persist instants; format in the browser's current local timezone for v0.1. Keep aggregation rules explicit and test them. Displayed historical day may shift when traveling across timezones; an optional fixed-reporting-timezone setting is a future enhancement.

## 5. Persistence and lifecycle

- Use Dexie schema migrations when data model changes.
- Persist active state on every transition (start/pause/resume/edit/finish) before reporting the action as complete to the user.
- On startup, load active state and offer to resume, finish, or correct it; don't silently discard it.
- Handle quota/storage errors visibly with a recovery path; export should be usable before more risky changes.
- IndexedDB storage belongs to a **particular browser/origin/device**: installing a PWA does not magically synchronise between iPhone, iPad, and Mac.
- Browser/PWA local data can be removed by clearing site data, browser policy, OS storage pressure, or uninstalling in some circumstances. Provide explicit backup/export and warn that local data is not an infallible backup.
- Use no external telemetry or analytics.

## 6. Import/export

JSON export payload with `format: 'cadence-backup'`, `schemaVersion`, `exportedAt`, and arrays of categories/sessions plus any appropriate settings. Decide and document how to represent an unfinished session; avoid inadvertently importing a stale 'running' timer as if live.

Validate JSON structure, timestamp bounds, category references, pause intervals, integer ratings, and duplicates **before** modifying stored data. Preview changes and confirm. Initially prefer **replace-all after backup** or **import into empty database**, rather than an underspecified merge process. If replace-all is offered, require an explicit destructive confirmation and provide export-first warning.

CSV export: one row per finished session, with id, category path, title, startedAt, endedAt, active duration (seconds), concentration, fatigue, notes. Be clear that CSV is for inspection, not a full-fidelity restore (nested pauses/categories require JSON).

## 7. Analytics without AI

Descriptive first:
- Total active minutes per day/week and category
- Number of sessions, median/mean duration, distribution of session length
- Optional simple time-of-day chart (active-time overlap by hour)
- Optional reflection summary only across **observed** scores, with `n` and missing-count shown

For correlations (P2), use well-defined paired records, clear unit of analysis (e.g. one finished session), and show sample count; do not compute when there are too few pairs or zero variance. Correlation never proves causal effects. Optional ratings are self-selected and may bias results. Consider Spearman/Pearson depending on hypothesis, but only implement with clear labeling and tests.

**Do not fill missing rating values with 0, the mean, or an arbitrary slider default.**

## 8. Tests and failure cases

Unit tests for:
- Running/paused/finished state machine; repeated button clicks and invalid transitions
- Duration computation, open pause, overlapping invalid pauses
- Session spanning midnight, week boundary, and daylight-saving transition
- Timezone-sensitive local date aggregation
- Optional rating validation and preservation of null
- Category archive/rename history behaviour
- Backup validation, malformed payload rejection, and round-trip export/import

E2E smoke tests for:
- Create category → start → pause/resume → finish → see history
- Finish and skip reflection
- Reload during active timer
- Manual entry and editing
- Export and restore (once implemented)
- Mobile and desktop layouts

For timer tests use fake clocks/injected `now` values, not real sleep intervals.

## 9. Development workflow

Build in small vertical slices, demonstrate each working end-to-end, run appropriate tests, and report known gaps. Begin with the skeleton and P0 category + timer + persistence + minimal history. Do not begin P2 correlations before core tracking works.
