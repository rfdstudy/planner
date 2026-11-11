import { useRef, useState } from 'react'
import {
  WEEKDAY_CODES,
  buildWeeklyRrule,
  weekdayCodeFromDate,
  type WeekdayCode
} from '../../core/recurrence'
import {
  MINUTES_PER_DAY,
  formatDurationMinutes,
  getWeekStart,
  isLocalDate,
  minutesToTime,
  parsePositiveMinutes,
  timeToMinutes,
  todayLocalDate
} from '../../core/time'
import type { Category, CategoryGroup, TemplateKind } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import styles from './TemplateForm.module.css'

const WEEKDAY_LABELS: Readonly<Record<WeekdayCode, string>> = {
  MO: 'Lun',
  TU: 'Mar',
  WE: 'Mer',
  TH: 'Jeu',
  FR: 'Ven',
  SA: 'Sam',
  SU: 'Dim'
}

const KIND_OPTIONS: ReadonlyArray<{ value: TemplateKind; label: string }> = [
  { value: 'fixed', label: 'Fixe' },
  { value: 'free', label: 'Libre' }
]

export interface TemplateFormValues {
  kind: TemplateKind
  title: string
  categoryId: string | null
  days: WeekdayCode[]
  startMin: number
  durationMin: number
  validFrom: string
  validUntil: string | null
}

export interface TemplateFormInitialValues {
  kind: TemplateKind
  title: string
  categoryId: string | null
  days: WeekdayCode[]
  startMin: number
  durationMin: number
  validFrom: string
  validUntil: string | null
}

interface TemplateFormProps {
  mode: 'create' | 'edit'
  initial?: TemplateFormInitialValues
  categories: readonly Category[]
  categoryGroups: readonly CategoryGroup[]
  onSubmit: (values: TemplateFormValues) => Promise<void>
  onCancel: () => void
}

interface CategorySection {
  id: string
  label: string
  categories: Category[]
}

function defaultInitialValues(): TemplateFormInitialValues {
  return {
    kind: 'fixed',
    title: '',
    categoryId: null,
    days: [weekdayCodeFromDate(todayLocalDate())],
    startMin: 8 * 60,
    durationMin: 60,
    validFrom: getWeekStart(todayLocalDate()),
    validUntil: null
  }
}

export function TemplateForm({
  mode,
  initial,
  categories,
  categoryGroups,
  onSubmit,
  onCancel
}: TemplateFormProps): React.JSX.Element {
  const start = initial ?? defaultInitialValues()
  const [title, setTitle] = useState(start.title)
  const [kind, setKind] = useState<TemplateKind>(start.kind)
  const [categoryId, setCategoryId] = useState<string | null>(start.categoryId)
  const [days, setDays] = useState<WeekdayCode[]>(start.days)
  const [time, setTime] = useState(minutesToTime(start.startMin))
  const [durationMin, setDurationMin] = useState(String(start.durationMin))
  const [validFrom, setValidFrom] = useState(start.validFrom)
  const [validUntil, setValidUntil] = useState(start.validUntil ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const activeCategories = categories.filter((category) => category.archivedAt === null)
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null
  const archivedCurrent =
    selectedCategory !== null && selectedCategory.archivedAt !== null ? selectedCategory : null
  const knownGroupIds = new Set(categoryGroups.map((group) => group.id))
  const sections: CategorySection[] = [...categoryGroups]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      id: group.id,
      label: group.name,
      categories: activeCategories
        .filter((category) => category.groupId === group.id)
        .sort((a, b) => a.order - b.order)
    }))
    .filter((section) => section.categories.length > 0)
  const ungrouped = activeCategories
    .filter((category) => category.groupId === null || !knownGroupIds.has(category.groupId))
    .sort((a, b) => a.order - b.order)

  function toggleDay(day: WeekdayCode): void {
    setDays((current) =>
      current.includes(day)
        ? current.filter((candidate) => candidate !== day)
        : WEEKDAY_CODES.filter((candidate) => candidate === day || current.includes(candidate))
    )
    setError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (saving) return

    const trimmedTitle = title.trim()

    if (trimmedTitle.length === 0) {
      setError('Donnez un titre au modèle.')
      titleRef.current?.focus()
      return
    }

    if (days.length === 0) {
      setError('Choisissez au moins un jour de la semaine.')
      return
    }

    let startMin: number

    try {
      startMin = timeToMinutes(time)
    } catch {
      setError('L’heure de début est invalide.')
      return
    }

    if (startMin >= MINUTES_PER_DAY) {
      setError('L’heure de début doit être avant minuit.')
      return
    }

    const parsedDuration = parsePositiveMinutes(durationMin)

    if (parsedDuration === null || parsedDuration > MINUTES_PER_DAY) {
      setError('La durée doit être un nombre entier de minutes, entre 1 et 1440.')
      return
    }

    if (startMin + parsedDuration > MINUTES_PER_DAY) {
      setError('Le bloc dépasserait minuit.')
      return
    }

    if (!isLocalDate(validFrom)) {
      setError('Choisissez une date de début valide.')
      return
    }

    const trimmedValidUntil = validUntil.trim()

    if (trimmedValidUntil.length > 0) {
      if (!isLocalDate(trimmedValidUntil)) {
        setError('Choisissez une date de fin valide.')
        return
      }

      if (trimmedValidUntil < validFrom) {
        setError('La fin de validité doit suivre le début.')
        return
      }
    }

    // Construit la règle ici pour valider les jours avant l'écriture.
    try {
      buildWeeklyRrule(days)
    } catch {
      setError('Choisissez au moins un jour de la semaine.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await onSubmit({
        kind,
        title: trimmedTitle,
        categoryId,
        days,
        startMin,
        durationMin: parsedDuration,
        validFrom,
        validUntil: trimmedValidUntil.length === 0 ? null : trimmedValidUntil
      })
    } catch {
      setError('L’enregistrement a échoué. Réessayez.')
      setSaving(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className={styles.topRow}>
        <label className={`${styles.field} ${styles.grow}`}>
          <span className={styles.label}>Titre</span>
          <input
            ref={titleRef}
            className={styles.control}
            type="text"
            value={title}
            placeholder="Cours, repas, sport…"
            aria-label="Titre du modèle"
            maxLength={200}
            autoFocus
            disabled={saving}
            onChange={(event) => {
              setTitle(event.target.value)
              setError(null)
            }}
          />
        </label>

        <label className={`${styles.field} ${styles.kindField}`}>
          <span className={styles.label}>Type</span>
          <select
            className={styles.control}
            value={kind}
            aria-label="Type de bloc"
            disabled={saving}
            onChange={(event) => setKind(event.target.value as TemplateKind)}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.field} ${styles.categoryField}`}>
          <span className={styles.label}>Catégorie</span>
          <span className={styles.categoryControl}>
            <span
              className={
                selectedCategory === null
                  ? `${styles.categoryDot} ${styles.categoryDotEmpty}`
                  : styles.categoryDot
              }
              style={
                selectedCategory === null ? undefined : categoryColorStyle(selectedCategory.color)
              }
              aria-hidden="true"
            />
            <select
              className={`${styles.control} ${styles.categorySelect}`}
              value={categoryId ?? ''}
              aria-label="Catégorie du modèle"
              disabled={saving}
              onChange={(event) =>
                setCategoryId(event.target.value === '' ? null : event.target.value)
              }
            >
              <option value="">Sans catégorie</option>
              {sections.map((section) => (
                <optgroup key={section.id} label={section.label}>
                  {section.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {ungrouped.length > 0 && (
                <optgroup label="Sans groupe">
                  {ungrouped.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {archivedCurrent !== null && (
                <optgroup label="Archivées">
                  <option value={archivedCurrent.id}>{archivedCurrent.name}</option>
                </optgroup>
              )}
            </select>
          </span>
        </label>
      </div>

      <fieldset className={styles.daysField}>
        <legend className={styles.label}>Jours</legend>
        <div className={styles.dayOptions}>
          {WEEKDAY_CODES.map((day) => {
            const checked = days.includes(day)

            return (
              <label
                className={
                  checked ? `${styles.dayOption} ${styles.dayOptionActive}` : styles.dayOption
                }
                key={day}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={() => toggleDay(day)}
                />
                {WEEKDAY_LABELS[day]}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className={styles.scheduleRow}>
        <label className={`${styles.field} ${styles.timeField}`}>
          <span className={styles.label}>Heure</span>
          <input
            className={styles.control}
            type="time"
            step={900}
            value={time}
            aria-label="Heure de début"
            disabled={saving}
            onChange={(event) => {
              setTime(event.target.value)
              setError(null)
            }}
          />
        </label>

        <label className={`${styles.field} ${styles.durationField}`}>
          <span className={styles.label}>Durée</span>
          <span className={styles.suffixField}>
            <input
              className={styles.control}
              type="number"
              min={1}
              max={1440}
              step={15}
              inputMode="numeric"
              value={durationMin}
              aria-label="Durée en minutes"
              disabled={saving}
              onChange={(event) => {
                setDurationMin(event.target.value)
                setError(null)
              }}
            />
            <span className={styles.suffix}>min</span>
          </span>
        </label>

        <span className={styles.durationHint}>
          {formatDurationMinutes(parsePositiveMinutes(durationMin) ?? 0)}
        </span>

        <label className={`${styles.field} ${styles.dateField}`}>
          <span className={styles.label}>Valable à partir du</span>
          <input
            className={styles.control}
            type="date"
            value={validFrom}
            aria-label="Début de validité"
            disabled={saving}
            onChange={(event) => {
              setValidFrom(event.target.value)
              setError(null)
            }}
          />
        </label>

        <label className={`${styles.field} ${styles.dateField}`}>
          <span className={styles.label}>Jusqu’au (facultatif)</span>
          <input
            className={styles.control}
            type="date"
            value={validUntil}
            aria-label="Fin de validité"
            disabled={saving}
            onChange={(event) => {
              setValidUntil(event.target.value)
              setError(null)
            }}
          />
        </label>
      </div>

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.ghostButton} disabled={saving} onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className={styles.primaryButton} disabled={saving}>
          {saving ? 'Enregistrement…' : mode === 'create' ? 'Créer le modèle' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
