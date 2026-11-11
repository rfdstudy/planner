import {
  CATEGORY_PALETTE,
  DEFAULT_CATEGORY_COLOR,
  normalizeCategoryColor
} from '../../core/categories'
import { categoryColorStyle } from '../categoryColorStyle'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  label?: string
  disabled?: boolean
}

/**
 * Palette de la charte et couleur libre. La valeur transmise est toujours une
 * couleur hexadécimale normalisée en majuscules.
 */
export function ColorPicker({
  value,
  onChange,
  label = 'Couleur',
  disabled = false
}: ColorPickerProps): React.JSX.Element {
  const normalizedValue = normalizeCategoryColor(value) ?? DEFAULT_CATEGORY_COLOR

  return (
    <div className={styles.picker}>
      <span className={styles.label}>{label}</span>
      <div className={styles.controls}>
        <div className={styles.swatches} role="group" aria-label="Palette de couleurs">
          {CATEGORY_PALETTE.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={styles.swatch}
              style={categoryColorStyle(entry.value)}
              title={entry.name}
              aria-label={`Couleur ${entry.name}`}
              aria-pressed={normalizedValue === entry.value}
              onClick={() => onChange(entry.value)}
              disabled={disabled}
            />
          ))}
        </div>
        <span className={styles.separator} aria-hidden="true" />
        <label className={styles.free} title="Choisir une couleur libre">
          <input
            className={styles.colorInput}
            type="color"
            value={normalizedValue}
            aria-label="Couleur libre"
            onChange={(event) => {
              const normalized = normalizeCategoryColor(event.target.value)
              if (normalized !== null) onChange(normalized)
            }}
            disabled={disabled}
          />
          <span className={styles.hex}>{normalizedValue}</span>
          <span className={styles.freeLabel}>Couleur libre</span>
        </label>
      </div>
    </div>
  )
}
