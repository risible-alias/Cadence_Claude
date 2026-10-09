# Cadence — Product specification

**Status:** Draft v0.1 specification  
**Product:** Cadence  
**Platform:** Responsive, installable Progressive Web App (PWA) for iPhone, iPad, and Mac  
**Current scope:** Time tracking, activity history, optional reflections, basic deterministic statistics. **No AI in v0.1.**

## 1. Purpose

Cadence is a low-friction personal activity tracker. Its primary purpose is to record how time is spent across different activities and reveal useful patterns through history and simple visualisations. It may eventually grow into an AI-assisted cognitive/workload coach, but the initial app must be useful without AI and must not depend on an LLM, AI API, account, or internet connection once installed and loaded.

The user balances academic work (e.g. Physics, Mathematics), music practice (e.g. Violin, Piano), reading, administration, leisure, and other activities. Avoid hardcoding these examples: the user controls their own activity categories.

## 2. Non-negotiable product principles

1. **Time tracking is sufficient.** A completed activity does not require any concentration, fatigue, mood, notes, or other subjective fields.
2. **Minimal friction.** Start, pause, resume, and finish should be quick on a phone. Do not interrupt every session with a compulsory form.
3. **User-defined organisation.** Customisable, nested categories and optional activity labels; no value judgments about what counts as “productive.”
4. **Local-first and private.** No account or backend for v0.1. Data stored on-device; no analytics/tracking SDKs. Clearly explain local-data limitations.
5. **Accurate and recoverable.** Timers work despite tab sleep, phone locking, backgrounding, app restarts, and wall-clock changes as robustly as practical. Persist timer state and permit correction.
6. **Data ownership.** Export and import/restore data in a documented format; make accidental data loss less likely.
7. **Honest analytics.** Display descriptive statistics transparently. Optional values remain missing, not zero. Correlations are exploratory, not causal.
8. **Expandable without premature complexity.** Keep a clean boundary between raw session records, statistics, and any future AI summaries.

## 3. v0.1 features and priorities

### P0 — working tracker (first usable milestone)
- Mobile-friendly, accessible layout with an obvious current-session control.
- Create/rename/archive user-defined categories, with at least a two-level hierarchy (e.g. Academics → Mathematics). Handle deletion carefully when sessions reference a category: prefer archival or replacement over silently deleting history.
- Start activity with category and optional free-text title/description; one active session at a time.
- Pause, resume, finish, and cancel active session, with confirmation for destructive cancellation.
- Show accurate elapsed *active* time, excluding pauses; show start time and live status.
- Persist ongoing timer state locally and restore after refresh/reopen.
- View today's sessions and daily total; open a session for details.
- Add, edit, and delete historical sessions manually (confirmation before deleting).
- Support sessions crossing midnight; daily reporting must allocate time correctly rather than attribute all time to start date.

### P1 — history and reflections
- Day/week history with chronological timeline and filters for category/date.
- Optional per-session reflection: concentration (1–10), mental fatigue (1–10), notes (free text). All individually optional; editable later. Do not preload slider defaults in a way that creates unintended scores.
- Category breakdown and weekly totals, including sessions crossing midnight and paused intervals.
- JSON export/import with validation and conflict handling, plus a human-readable CSV sessions export. Explain backup/import clearly.
- Basic PWA manifest, offline shell, appropriate icons, and installation guidance. Avoid aggressive service-worker caching that creates stale app versions.

### P2 — after basic flows work reliably
- Simple charts: daily active time, stacked category totals, distribution of session durations, time-of-day patterns.
- Optional-data analyses, e.g. concentration versus session duration, only when observations are sufficient; show number of observations and missingness.
- Potentially additional optional measures (mood, perceived difficulty), but do not add without user approval.

## 4. Explicitly out of scope for v0.1
- AI coach, chatbot, LLM API, prompt storage, AI-generated interpretations.
- Cloud accounts, automatic multi-device sync, backend, subscriptions, notifications/reminders, screen/app monitoring, background activity inference, health/calendar integrations.
- Goal streaks, “productivity scores,” coercive nudges, compulsory check-ins.

## 5. Core user journeys

1. **Quick start:** Open app → select a category (recent categories conveniently surfaced) → Start. An optional title may be added before or after starting.
2. **Stop with no reflection:** Tap Finish → session is saved immediately → user may dismiss optional reflection without losing the session.
3. **Pause:** Tap Pause → elapsed active time stops increasing → later Resume → paused interval excluded from active duration.
4. **Forgot timer:** Manually add a session with start/end time and category; edit times later if wrong.
5. **Review:** Open History → view daily/weekly sessions and totals → filter by category → inspect/edit a session.
6. **Back up:** Export all records to JSON; import into a fresh installation after an explicit validation/confirmation step.

## 6. UX guidance

- Calm, uncluttered, mobile-first interface; excellent accessibility, sufficient contrast, keyboard navigation and touch target sizes.
- Separate **Track**, **History**, **Insights**, and **Settings** areas if practical; Insights can initially be a simple statistics screen.
- Avoid requiring ratings after each session or showing motivational warnings for low activity.
- All computed times show units; use local time for calendar views and retain machine-readable instants for accuracy.
- Make category colours optional and never the sole identifying signal.
- Prefer informative empty states to fabricated demonstration data in the actual running app.

## 7. Definition of done for first usable milestone

- A user can define a category, start, pause, resume and finish a session; the recorded active duration is correct.
- Reload or reopen does not discard the active session.
- The user can complete a session without any supplemental fields.
- A user can correct an incorrect session and see updated history totals.
- Sessions and category changes persist in IndexedDB.
- Basic automated tests pass for timer-state transitions and duration arithmetic; basic functional tests cover core flows.
- Runs in a mobile viewport and desktop browser; no AI or external account required.

## 8. Future possibilities (not promises or current tasks)

Optional AI coaching, calendar-aware planning, sleep and recovery data, Apple Shortcuts, cross-device sync, richer statistical inference. Consider only after actual use reveals a need.
