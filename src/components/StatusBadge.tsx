/**
 * Marks a session that is still in progress. State is carried by the word and
 * the icon shape as well as the colour.
 */
export function StatusBadge({ state, testId }: { state: 'running' | 'paused'; testId?: string }) {
  const running = state === 'running'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${
        running ? 'bg-teal-700 text-white dark:bg-teal-600' : 'bg-amber-200 text-amber-950 dark:bg-amber-300'
      }`}
    >
      {running ? (
        <span aria-hidden="true" className="size-2 rounded-full bg-white motion-safe:animate-pulse" />
      ) : (
        <span aria-hidden="true" className="flex gap-0.5">
          <span className="h-2.5 w-1 bg-amber-950" />
          <span className="h-2.5 w-1 bg-amber-950" />
        </span>
      )}
      <span data-testid={testId}>{running ? 'Running' : 'Paused'}</span>
    </span>
  )
}

/** Card/row accent for an in-progress session. */
export const inProgressClass = {
  running: 'border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40',
  paused: 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/40',
} as const
