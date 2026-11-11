import { useRef, useState } from 'react'
import {
  DEFAULT_CATEGORY_COLOR,
  normalizeCategoryColor,
  normalizeCategoryName
} from '../../core/categories'
import type { CategoryGroup } from '../../core/types'
import { ColorPicker } from '../components/ColorPicker'
import styles from './CategoryForm.module.css'

export interface CategoryFormValues {
  name: string
  color: string
  groupId: string | null
}

interface CategoryFormProps {
  mode: 'create' | 'edit'
  initialName?: string
  initialColor?: string
  initialGroupId: string | null
  groups: readonly CategoryGroup[]
  onSubmit: (values: CategoryFormValues) => Promise<void>
  onCancel: () => void
}

export function CategoryForm({
  mode,
  initialName = '',
  initialColor = DEFAULT_CATEGORY_COLOR,
  initialGroupId,
  groups,
  onSubmit,
  onCancel
}: CategoryFormProps): React.JSX.Element {
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(normalizeCategoryColor(initialColor) ?? DEFAULT_CATEGORY_COLOR)
  const [groupId, setGroupId] = useState<string | null>(() => {
    if (initialGroupId === null) return null
    return groups.some((group) => group.id === initialGroupId) ? initialGroupId : null
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    if (saving) return

    const normalizedName = normalizeCategoryName(name)

    if (normalizedName.length === 0) {
      setError('Donnez un nom à la catégorie.')
      nameInputRef.current?.focus()
      return
    }

    const normalizedColor = normalizeCategoryColor(color)

    if (normalizedColor === null) {
      setError('Choisissez une couleur valide.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      await onSubmit({ name: normalizedName, color: normalizedColor, groupId })
    } catch {
      setError('L’enregistrement a échoué. Réessayez.')
      setSaving(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.topRow}>
        <input
          ref={nameInputRef}
          className={styles.nameInput}
          type="text"
          value={name}
          placeholder="Nom de la catégorie"
          aria-label="Nom de la catégorie"
          autoFocus
          maxLength={80}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />

        <select
          className={styles.select}
          value={groupId ?? ''}
          aria-label="Groupe"
          disabled={saving}
          onChange={(event) => setGroupId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">Sans groupe</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>

        <div className={styles.actions}>
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={saving}>
            Annuler
          </button>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {mode === 'create' ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <ColorPicker value={color} onChange={setColor} disabled={saving} />

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
