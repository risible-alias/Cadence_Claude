import { RATING_MAX, RATING_MIN } from '../domain/reflections'

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
    <fieldset className="field">
      <legend className="label">
        {legend} <small>({scale})</small>
      </legend>
      <div className="choices ten">
        {SCORES.map((score) => (
          <label key={score} className="choice">
            <input type="radio" name={name} value={score} checked={value === score} onChange={() => onChange(score)} />
            <span>{score}</span>
          </label>
        ))}
      </div>
      <label className="unanswered">
        <input type="radio" name={name} value="" checked={value === null} onChange={() => onChange(null)} />
        Not answered
      </label>
    </fieldset>
  )
}
