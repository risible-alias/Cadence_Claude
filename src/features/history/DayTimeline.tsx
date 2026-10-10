import { clockTime, clockTimeIn, hourLabel } from '../../app/format'
import { useNow } from '../../app/hooks'
import { CategoryName, inkClass } from '../../components/Category'
import { categoryLabel } from '../../domain/categories'
import { layoutTimeline } from '../../domain/history'
import { sessionTimes } from '../../domain/sessions'
import { activeOverlapMs, formatMinutes, toMs } from '../../domain/time'
import type { ActiveSession, Category, Session } from '../../domain/types'

/** Height of one hour, and the least a block may be so its label still fits. */
const HOUR_PX = 56
const MIN_BLOCK_PX = 26
const PX_PER_MIN = HOUR_PX / 60
const HOUR_MS = 3_600_000

type Item = { startMs: number; endMs: number } & ({ kind: 'saved'; session: Session } | { kind: 'live' })

/**
 * One day drawn to scale against the clock. Each saved session is a block
 * washed in its category's ink and opens for editing; pauses show as a hatched
 * notch; the session in progress is dashed and cannot be edited here. A
 * session that began the day before is listed above the scale.
 */
export function DayTimeline({
  sessions,
  dayStartMs,
  dayEndMs,
  categories,
  active,
  overlapping,
  onEdit,
}: {
  sessions: Session[]
  dayStartMs: number
  dayEndMs: number
  categories: Category[]
  /** The timer in progress, if it belongs in this day. */
  active: ActiveSession | null
  overlapping: Set<string>
  onEdit: (session: Session) => void
}) {
  const now = useNow(active ? 1000 : 30_000)
  const carried = sessions.filter((s) => toMs(s.startedAt) < dayStartMs)
  const items: Item[] = sessions
    .filter((s) => toMs(s.startedAt) >= dayStartMs)
    .map((session) => ({ kind: 'saved', session, startMs: toMs(session.startedAt), endMs: toMs(session.endedAt) }))
  if (active) items.push({ kind: 'live', startMs: toMs(active.startedAt), endMs: Math.max(now, toMs(active.startedAt)) })

  const { firstMs, lastMs, blocks } = layoutTimeline(items, dayStartMs, dayEndMs, MIN_BLOCK_PX / PX_PER_MIN)
  // Always show at least a few hours, so a single short session is not adrift.
  const endMs = Math.min(dayEndMs, Math.max(lastMs, firstMs + 3 * HOUR_MS))
  const hours: number[] = []
  for (let t = firstMs; t <= endMs; t += HOUR_MS) hours.push(t)
  const showNow = now >= firstMs && now <= endMs && now >= dayStartMs && now < dayEndMs
  const time = (ms: number) => clockTimeIn(ms, dayStartMs, dayEndMs)

  const describe = (s: Session) => {
    const times = sessionTimes(s)
    return [
      `${time(toMs(s.startedAt))} – ${time(toMs(s.endedAt))}`,
      s.title,
      times.pausedMs >= 1000 && `${formatMinutes(times.pausedMs)} paused`,
      s.concentration !== null && `concentration ${s.concentration}`,
      s.fatigue !== null && `fatigue ${s.fatigue}`,
      overlapping.has(s.id) && 'overlaps another session',
      s.notes,
    ].filter(Boolean)
  }

  return (
    <>
      {carried.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`carry ${inkClass(s.categoryId, categories)}`}
          aria-label={`Edit ${categoryLabel(s.categoryId, categories)}, ${time(toMs(s.startedAt))} – ${time(toMs(s.endedAt))}`}
          onClick={() => onEdit(s)}
        >
          <CategoryName id={s.categoryId} categories={categories} />
          <span className="len">{formatMinutes(activeOverlapMs(s, dayStartMs, dayEndMs))}</span>
          <span className="more">
            began {time(toMs(s.startedAt))}, until {clockTime(Math.min(toMs(s.endedAt), dayEndMs))} · this day’s part of{' '}
            {formatMinutes(sessionTimes(s).activeMs)}
          </span>
        </button>
      ))}

      {blocks.length > 0 && (
        <div className="tl" style={{ height: ((endMs - firstMs) / 60_000) * PX_PER_MIN + 12 }}>
          {hours.map((t) => (
            <div key={t} className="hr" style={{ top: ((t - firstMs) / 60_000) * PX_PER_MIN }} aria-hidden="true">
              <span>{hourLabel(t)}</span>
            </div>
          ))}
          <div className="lanes">
            {blocks.map((block) => {
              const heightPx = block.height * PX_PER_MIN - 2
              const place = {
                top: block.top * PX_PER_MIN + 1,
                height: heightPx,
                left: `${(block.lane / block.lanes) * 100}%`,
                width: `calc(${100 / block.lanes}% - ${block.lanes > 1 ? 2 : 0}px)`,
              }
              const shape = heightPx < 42 ? ' one' : ''

              if (block.item.kind === 'live' && active) {
                return (
                  <div
                    key="live"
                    className={`blk live one ${inkClass(active.categoryId, categories)}`}
                    style={place}
                    data-testid="in-progress-row"
                  >
                    <span className="head">
                      <CategoryName id={active.categoryId} categories={categories} />
                      <span className="len">{active.state === 'paused' ? 'paused' : 'in progress'}</span>
                    </span>
                  </div>
                )
              }
              if (block.item.kind !== 'saved') return null

              const s = block.item.session
              const blockStartMs = Math.max(toMs(s.startedAt), dayStartMs)
              const details = describe(s)
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`blk${shape} ${inkClass(s.categoryId, categories)}`}
                  style={place}
                  aria-label={`Edit ${categoryLabel(s.categoryId, categories)}, ${details[0]}`}
                  title={details.join(' · ')}
                  onClick={() => onEdit(s)}
                >
                  {s.pausedIntervals.map((p) => {
                    const from = Math.max(toMs(p.startedAt), blockStartMs)
                    const to = Math.min(toMs(p.endedAt), dayEndMs)
                    return to > from ? (
                      <i
                        key={p.startedAt}
                        className="notch"
                        style={{
                          top: ((from - blockStartMs) / 60_000) * PX_PER_MIN,
                          height: Math.max(3, ((to - from) / 60_000) * PX_PER_MIN),
                        }}
                      />
                    ) : null
                  })}
                  <span className="head">
                    <CategoryName id={s.categoryId} categories={categories} />
                    <span className="len">{formatMinutes(activeOverlapMs(s, dayStartMs, dayEndMs))}</span>
                  </span>
                  <span className="more">{(heightPx >= 64 ? details : details.slice(0, 1)).join(' · ')}</span>
                </button>
              )
            })}
          </div>
          {showNow && (
            <div className="nowline" style={{ top: ((now - firstMs) / 60_000) * PX_PER_MIN }} aria-hidden="true">
              <span>{clockTime(now)}</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
