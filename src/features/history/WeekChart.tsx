import { weekdayAbbr, weekdayName } from '../../app/format'
import { formatMinutes } from '../../domain/time'

export interface WeekChartDay {
  dayStartMs: number
  totalMs: number
  segments: Array<{ groupId: string; activeMs: number }>
}

const HOUR_MS = 3_600_000

/**
 * Seven days as stacked bars, one segment per top-level group in a fixed
 * order. Purely presentational: every number arrives already calculated.
 * Segments are separated by a gap of paper, so two groups that share an ink
 * still read as two.
 */
export function WeekChart({
  days,
  topHours,
  todayStartMs,
  groups,
}: {
  days: WeekChartDay[]
  /** The top of the scale, in whole hours. */
  topHours: number
  todayStartMs: number
  groups: Map<string, { name: string; inkClass: string }>
}) {
  const W = 320
  const H = 150
  const L = 22
  const B = 118
  const PLOT = 96
  const slot = (W - L) / days.length
  const y = (ms: number) => (ms / (topHours * HOUR_MS)) * PLOT
  const step = topHours <= 6 ? 1 : topHours <= 12 ? 2 : 4
  const lines: number[] = []
  for (let h = 0; h <= topHours; h += step) lines.push(h)
  const stamp = (ms: number) => {
    const minutes = Math.floor(ms / 60_000)
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
  }

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Active time for each day of the week, stacked by group. The same figures are listed below."
    >
      <text x="0" y="10">
        hours
      </text>
      {lines.map((h) => (
        <g key={h}>
          <line className="gridl" x1={L} y1={B - y(h * HOUR_MS)} x2={W} y2={B - y(h * HOUR_MS)} />
          {h > 0 && (
            <text x={L - 6} y={B - y(h * HOUR_MS) + 3} textAnchor="end">
              {h}
            </text>
          )}
        </g>
      ))}
      {days.map((day, d) => {
        const cx = L + slot * d + slot / 2
        let top = B
        return (
          <g key={day.dayStartMs}>
            {day.segments.map((segment) => {
              const height = y(segment.activeMs)
              top -= height
              const group = groups.get(segment.groupId)
              return (
                <rect
                  key={segment.groupId}
                  className={`seg ${group?.inkClass ?? ''}`}
                  x={cx - 7}
                  y={top + 1}
                  width="14"
                  height={Math.max(1, height - 2)}
                  rx="1"
                >
                  <title>{`${weekdayName(day.dayStartMs)}: ${group?.name ?? 'Unknown'}, ${formatMinutes(segment.activeMs)}`}</title>
                </rect>
              )
            })}
            {day.totalMs > 0 && (
              <text className="val" x={cx} y={top - 5} textAnchor="middle">
                {stamp(day.totalMs)}
              </text>
            )}
            <text className={day.dayStartMs === todayStartMs ? 'val strong' : undefined} x={cx} y={B + 16} textAnchor="middle">
              {weekdayAbbr(day.dayStartMs)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
