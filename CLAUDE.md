# Codex instructions — Cadence

## Mission

Build and maintain **Cadence**, a local-first activity-tracking Progressive Web App for iPhone, iPad, and Mac. Read `PRODUCT.md` and `ARCHITECTURE.md` before making implementation decisions. Those files define the intended scope; if they conflict, surface the conflict instead of quietly inventing product behaviour.

## Current scope

Version 0.1 is a **non-AI** product: user-defined activity categories, session timer, manual entry/editing, history, optional concentration/fatigue/notes, basic deterministic analytics, and export/import. **Do not** add an LLM, AI SDK, external inference call, chatbot, accounts, server, or automatic sync unless explicitly requested.

## Working rules

1. Make the smallest cohesive change that satisfies the current milestone; avoid speculative complexity or unrelated refactors.
2. Before significant work, briefly state what you'll implement and which files will change. Afterward, summarise what changed, how you tested it, and any limitations.
3. Prioritise accurate time accounting, durable IndexedDB state, accessibility, and fast interactions over decorative UI.
4. Keep domain/time/statistics functions pure and independently testable. Use explicit types and runtime validation at data boundaries; avoid `any` except with justification.
5. Dates persisted as ISO instants; derive durations from timestamps and pause intervals, never UI tick counts. Handle sessions crossing midnight through overlap-based aggregation.
6. Every reflection field must be independently nullable/optional. Never silently convert unanswered ratings into numeric values.
7. Preserve historical data when renaming/archiving categories. For destructive actions, require confirmation; never silently wipe the user's stored history.
8. No telemetry, external analytics or unnecessary network requests. Treat exported/imported data as sensitive; never send it to an external service.
9. Write tests for state transitions, duration arithmetic, and any database migrations. Fix failing relevant tests before claiming completion.
10. Do not assume the app works offline merely because it has a manifest; test actual reload behaviour after assets have been cached.
11. Prefer clear, minimal dependencies. Explain trade-offs when introducing a major dependency or architecture change.
12. Keep README setup instructions up to date, including local development commands and known browser limitations.

## Expected stack

React + TypeScript + Vite + Tailwind CSS + Dexie/IndexedDB. Recharts for visualisations later, Vitest and Playwright for testing. Adapt versions to the current compatible ecosystem, documenting any necessary deviation.

## Milestone order

1. Scaffold project with responsive shell, test setup, and Dexie.
2. Add category creation/selection and a single persistent active session with Start/Pause/Resume/Finish/Cancel.
3. Add minimal history and manual session correction.
4. Add optional reflection fields and better day/week history.
5. Add backup/restore, CSV, PWA offline/installation support.
6. Add deterministic charts and exploratory statistics.

Implement **only the milestone requested** in a given Codex conversation; do not attempt everything at once. Ask only when blocked by a decision that materially changes functionality; otherwise use conservative defaults consistent with the specs and document assumptions.

## Acceptance focus

A user can track time and review history without ever filling in a self-rating; timers survive refresh/reopen; pausing excludes time; local data persists; users can correct mistakes; core behaviour is covered by automated tests.
