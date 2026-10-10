/** Locale-aware wording shared by the screens. Calculation lives in src/domain. */

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })
const dayMonthShort = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const hour = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

export const clockTime = (ms: number) => time.format(ms)
/** A time, with the weekday added when it falls outside the day being shown. */
export const clockTimeIn = (ms: number, dayStartMs: number, dayEndMs: number) =>
  (ms >= dayStartMs && ms < dayEndMs ? time : weekdayTime).format(ms)
export const weekdayName = (ms: number) => weekdayLong.format(ms)
export const weekdayAbbr = (ms: number) => weekdayShort.format(ms)
export const dayAndMonth = (ms: number) => dayMonth.format(ms)
export const shortDay = (ms: number) => dayMonthShort.format(ms)
export const datedDay = (ms: number) => dayMonthYear.format(ms)
export const hourLabel = (ms: number) => hour.format(ms)

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** "five sessions", "one session", "12 sessions". */
export function countOf(n: number, noun: string): string {
  return `${n < WORDS.length ? WORDS[n] : n} ${noun}${n === 1 ? '' : 's'}`
}
