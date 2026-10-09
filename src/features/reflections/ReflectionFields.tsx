import { inputClass, labelClass } from '../../components/fields'
import { RatingField } from '../../components/RatingField'
import { MAX_NOTES_LENGTH, type Reflection } from '../../domain/reflections'
import type { Session } from '../../domain/types'

/** Form state: like `Reflection`, but notes stay a string while being typed. */
export interface ReflectionForm {
  concentration: number | null
  fatigue: number | null
  notes: string
}

export const emptyReflectionForm: ReflectionForm = { concentration: null, fatigue: null, notes: '' }

export const reflectionFormOf = (session: Session): ReflectionForm => ({
  concentration: session.concentration,
  fatigue: session.fatigue,
  notes: session.notes ?? '',
})

export const toReflection = (form: ReflectionForm): Reflection => ({
  concentration: form.concentration,
  fatigue: form.fatigue,
  notes: form.notes.trim() || null,
})

export const isAnswered = (form: ReflectionForm) =>
  form.concentration !== null || form.fatigue !== null || form.notes.trim() !== ''

export function ReflectionFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: ReflectionForm
  onChange: (value: ReflectionForm) => void
}) {
  return (
    <div className="grid gap-3">
      <RatingField
        name={`${idPrefix}-concentration`}
        legend="Concentration"
        scale="1 = very low, 10 = very high"
        value={value.concentration}
        onChange={(concentration) => onChange({ ...value, concentration })}
      />
      <RatingField
        name={`${idPrefix}-fatigue`}
        legend="Mental fatigue"
        scale="1 = fresh, 10 = exhausted"
        value={value.fatigue}
        onChange={(fatigue) => onChange({ ...value, fatigue })}
      />
      <div>
        <label htmlFor={`${idPrefix}-notes`} className={labelClass}>
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          className={`${inputClass} py-2`}
          rows={3}
          value={value.notes}
          maxLength={MAX_NOTES_LENGTH}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
    </div>
  )
}
