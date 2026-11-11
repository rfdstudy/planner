import { useEffect, useRef, useState } from 'react'
import styles from './RecurrenceScopeDialog.module.css'

export type RecurrenceScope = 'once' | 'all'

interface RecurrenceScopeDialogProps {
  title: string
  subject: string
  onChoose: (scope: RecurrenceScope) => Promise<void>
  onCancel: () => void
}

/**
 * Petite fenêtre de choix affichée pour tout bloc issu de la semaine type.
 * Elle ne modifie rien elle-même : l'appelant décide quelle écriture faire.
 */
export function RecurrenceScopeDialog({
  title,
  subject,
  onChoose,
  onCancel
}: RecurrenceScopeDialogProps): React.JSX.Element {
  const [busy, setBusy] = useState<RecurrenceScope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const onceRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    onceRef.current?.focus()

    const handlePointerDown = (event: PointerEvent): void => {
      if (busy !== null) return
      if (panelRef.current?.contains(event.target as Node)) return
      onCancel()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy !== null) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [busy, onCancel])

  async function choose(scope: RecurrenceScope): Promise<void> {
    if (busy !== null) return

    setBusy(scope)
    setError(null)

    try {
      await onChoose(scope)
    } catch {
      setError('L’opération a échoué. Réessayez.')
      setBusy(null)
    }
  }

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-labelledby="recurrence-scope-title"
      aria-describedby="recurrence-scope-subject"
    >
      <h2 className={styles.title} id="recurrence-scope-title">
        {title}
      </h2>
      <p className={styles.subject} id="recurrence-scope-subject">
        {subject}
      </p>

      <div className={styles.choices}>
        <button
          ref={onceRef}
          type="button"
          className={styles.choice}
          disabled={busy !== null}
          onClick={() => void choose('once')}
        >
          <span className={styles.choiceLabel}>
            {busy === 'once' ? 'Enregistrement…' : 'Cette fois seulement'}
          </span>
          <span className={styles.choiceHint}>Seule cette semaine change.</span>
        </button>

        <button
          type="button"
          className={styles.choice}
          disabled={busy !== null}
          onClick={() => void choose('all')}
        >
          <span className={styles.choiceLabel}>
            {busy === 'all' ? 'Enregistrement…' : 'Toutes les semaines'}
          </span>
          <span className={styles.choiceHint}>Le modèle de semaine type est modifié.</span>
        </button>
      </div>

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.cancel} disabled={busy !== null} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
