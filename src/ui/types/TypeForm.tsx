import { useRef, useState } from 'react'
import {
  DEFAULT_ITEM_TYPE_COLOR,
  ITEM_TYPE_NAMES_MAX_LENGTH,
  ITEM_TYPE_PLACEMENTS,
  ITEM_TYPE_STYLES,
  normalizeItemTypeDetails,
  type ItemTypeDetailsInput
} from '../../core/itemTypes'
import type { ItemTypePlacement, ItemTypeStyle } from '../../core/types'
import { ColorPicker } from '../components/ColorPicker'
import styles from './TypeForm.module.css'

export type TypeFormValues = ItemTypeDetailsInput

interface TypeFormProps {
  mode: 'create' | 'edit'
  initial?: TypeFormValues
  onSubmit: (values: TypeFormValues) => Promise<void>
  onCancel: () => void
}

const INITIAL_VALUES: TypeFormValues = {
  name: '',
  style: 'neutral',
  color: null,
  isTask: false,
  countdown: false,
  placement: 'grid'
}

export function TypeForm({
  mode,
  initial = INITIAL_VALUES,
  onSubmit,
  onCancel
}: TypeFormProps): React.JSX.Element {
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initial.name)
  const [style, setStyle] = useState<ItemTypeStyle>(initial.style)
  const [placement, setPlacement] = useState<ItemTypePlacement>(initial.placement)
  const [isTask, setIsTask] = useState(initial.isTask)
  const [countdown, setCountdown] = useState(initial.countdown)
  const [useColor, setUseColor] = useState(initial.color !== null)
  const [color, setColor] = useState(initial.color ?? DEFAULT_ITEM_TYPE_COLOR)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const colorAvailable = style === 'neutral' || style === 'free'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (saving) return

    let values: TypeFormValues

    try {
      values = normalizeItemTypeDetails({
        name,
        style,
        color: colorAvailable && useColor ? color : null,
        isTask,
        countdown,
        placement
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vérifiez les propriétés du type.')
      nameInputRef.current?.focus()
      return
    }

    setError(null)
    setSaving(true)

    try {
      await onSubmit(values)
    } catch {
      setError('L’enregistrement a échoué. Réessayez.')
      setSaving(false)
    }
  }

  function handleStyleChange(value: ItemTypeStyle): void {
    setStyle(value)

    if (value === 'category' || value === 'alert') {
      setUseColor(false)
    }

    setError(null)
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className={styles.topRow}>
        <input
          ref={nameInputRef}
          className={styles.nameInput}
          type="text"
          value={name}
          placeholder="Nom du type"
          aria-label="Nom du type"
          autoFocus
          maxLength={ITEM_TYPE_NAMES_MAX_LENGTH}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />

        <div className={styles.actions}>
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={saving}>
            Annuler
          </button>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {mode === 'create' ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div className={styles.propertyGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Style</span>
          <select
            className={styles.select}
            value={style}
            disabled={saving}
            onChange={(event) => handleStyleChange(event.target.value as ItemTypeStyle)}
          >
            {ITEM_TYPE_STYLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Placement par défaut</span>
          <select
            className={styles.select}
            value={placement}
            disabled={saving}
            onChange={(event) => {
              setPlacement(event.target.value as ItemTypePlacement)
              setError(null)
            }}
          >
            {ITEM_TYPE_PLACEMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isTask}
            disabled={saving}
            onChange={(event) => {
              setIsTask(event.target.checked)
              setError(null)
            }}
          />
          Élément tâche (à planifier, durée estimée, cases à cocher)
        </label>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={countdown}
            disabled={saving}
            onChange={(event) => {
              setCountdown(event.target.checked)
              setError(null)
            }}
          />
          Afficher le compte à rebours « J-x »
        </label>
      </div>

      {colorAvailable && (
        <div className={styles.colorSection}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={useColor}
              disabled={saving}
              onChange={(event) => {
                setUseColor(event.target.checked)
                setError(null)
              }}
            />
            Utiliser une couleur propre
          </label>

          {useColor && (
            <ColorPicker
              value={color}
              label="Couleur du type"
              disabled={saving}
              onChange={setColor}
            />
          )}
        </div>
      )}

      {!colorAvailable && (
        <p className={styles.hint}>
          {style === 'category'
            ? 'La couleur provient de la catégorie de chaque élément.'
            : 'Le style alerte utilise le rouge de la charte.'}
        </p>
      )}

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
