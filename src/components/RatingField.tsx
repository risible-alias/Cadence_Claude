import { RATING_MAX, RATING_MIN } from '../domain/reflections'
import { labelClass } from './fields'

const SCORES = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i)

/**
 * A 1–10 rating as native radio buttons. "Not answered" is a real choice and
 * the initial one, so no score is ever recorded unless the user picks it.
 */
export function RatingField({
  name,
  legend,
  scale,
  value,
  onChange,
}: {
  name: string
  legend: string
  scale: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={labelClass}>
        {legend} <span className="font-normal">({scale})</span>
      </legend>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
        {SCORES.map((score) => (
          <label key={score} className="relative">
            <input
              type="radio"
              name={name}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base tabular-nums peer-checked:border-teal-700 peer-checked:bg-teal-700 peer-checked:font-bold peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600 dark:border-slate-600 dark:bg-slate-800 dark:peer-checked:border-teal-500 dark:peer-checked:bg-teal-600">
              {score}
            </span>
          </label>
        ))}
      </div>
      <label className="mt-1 inline-flex min-h-11 items-center gap-2 text-base">
        <input
          type="radio"
          name={name}
          value=""
          checked={value === null}
          onChange={() => onChange(null)}
          className="size-5"
        />
        Not answered
      </label>
    </fieldset>
  )
}
