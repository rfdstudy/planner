import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  validateElementDraft,
  validateTaskDraft,
  type ElementDraft,
  type ElementDraftValues,
  type TaskDraft,
  type TaskDraftValues
} from '../../core/elementEditor'
import type { Category, CategoryGroup, ItemKind } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import { Icon } from '../components/Icon'
import type { FloatingAnchor } from './scheduleTypes'
import styles from './ElementEditor.module.css'

const PANEL_MARGIN = 12

const KIND_OPTIONS: ReadonlyArray<{ value: ItemKind; label: string }> = [
  { value: 'task', label: 'Tâche' },
  { value: 'fixed', label: 'Fixe' },
  { value: 'exam', label: 'Épreuve' },
  { value: 'free', label: 'Libre' }
]

interface ElementEditorProps {
  mode: 'create' | 'edit' | 'task'
  initialDraft: ElementDraft | TaskDraft
  anchor: FloatingAnchor
  categories: readonly Category[]
  categoryGroups: readonly CategoryGroup[]
  /** Bloc calculé depuis la semaine type : type limité et pas de notes. */
  recurring?: boolean
  onClose: () => void
  /** Appelé pour un élément de la grille. */
  onSubmit?: (values: ElementDraftValues) => Promise<void>
  /** Appelé pour une tâche encore sans bloc, depuis « À planifier ». */
  onSubmitTask?: (values: TaskDraftValues) => Promise<void>
  /** Absent en création : rien n'existe encore à supprimer. */
  onDelete?: () => Promise<void>
}

interface CategorySection {
  id: string
  label: string
  categories: Category[]
}

/**
 * Petite fenêtre flottante d'édition, ancrée près du clic. Elle ne bloque pas
 * la grille : un clic à l'extérieur ou Échap la referme sans enregistrer.
 */
export function ElementEditor({
  mode,
  initialDraft,
  anchor,
  categories,
  categoryGroups,
  recurring = false,
  onClose,
  onSubmit,
  onSubmitTask,
  onDelete
}: ElementEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState<ElementDraft | TaskDraft>(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'save' | 'delete' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [position, setPosition] = useState<FloatingAnchor | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const busy = pending !== null

  const kindOptions = useMemo(
    () =>
      recurring
        ? KIND_OPTIONS.filter((option) => option.value !== 'task' && option.value !== 'exam')
        : KIND_OPTIONS,
    [recurring]
  )

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === draft.categoryId) ?? null,
    [categories, draft.categoryId]
  )

  const categorySections = useMemo<CategorySection[]>(() => {
    const active = categories.filter((category) => category.archivedAt === null)
    const knownGroupIds = new Set(categoryGroups.map((group) => group.id))
    const sections: CategorySection[] = [...categoryGroups]
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        id: group.id,
        label: group.name,
        categories: active
          .filter((category) => category.groupId === group.id)
          .sort((a, b) => a.order - b.order)
      }))
      .filter((section) => section.categories.length > 0)

    const ungrouped = active
      .filter((category) => category.groupId === null || !knownGroupIds.has(category.groupId))
      .sort((a, b) => a.order - b.order)

    if (ungrouped.length > 0) {
      sections.push({ id: 'ungrouped', label: 'Sans groupe', categories: ungrouped })
    }

    return sections
  }, [categories, categoryGroups])

  const archivedCurrent =
    selectedCategory !== null && selectedCategory.archivedAt !== null ? selectedCategory : null
  const draftShape = draft.variant === 'element' ? draft.kind : 'task'

  useLayoutEffect(() => {
    const panel = panelRef.current

    if (panel === null) return

    const place = (): void => {
      const rect = panel.getBoundingClientRect()
      const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - rect.width - PANEL_MARGIN)
      const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - rect.height - PANEL_MARGIN)
      const gap = 8
      const fitsBelow = anchor.y + gap + rect.height <= window.innerHeight - PANEL_MARGIN
      const fitsAbove = anchor.y - gap - rect.height >= PANEL_MARGIN
      const preferredTop = fitsBelow
        ? anchor.y + gap
        : fitsAbove
          ? anchor.y - gap - rect.height
          : anchor.y

      setPosition({
        x: Math.min(Math.max(PANEL_MARGIN, anchor.x), maxLeft),
        y: Math.min(Math.max(PANEL_MARGIN, preferredTop), maxTop)
      })
    }

    place()
    window.addEventListener('resize', place)

    return () => window.removeEventListener('resize', place)
  }, [anchor, error, confirmingDelete, draftShape])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (busy) return

      const panel = panelRef.current

      if (panel !== null && event.target instanceof Node && panel.contains(event.target)) {
        return
      }

      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy) return

      event.preventDefault()
      event.stopPropagation()
      onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [busy, onClose])

  function updateDraft(patch: Partial<ElementDraft>): void {
    setDraft((current) => (current.variant === 'element' ? { ...current, ...patch } : current))
    setError(null)
    setConfirmingDelete(false)
  }

  function updateCommon(patch: {
    title?: string
    notes?: string
    categoryId?: string | null
  }): void {
    setDraft((current) =>
      current.variant === 'task' ? { ...current, ...patch } : { ...current, ...patch }
    )
    setError(null)
    setConfirmingDelete(false)
  }

  function updateEstimate(estimateMin: string): void {
    setDraft((current) =>
      current.variant === 'task' ? { ...current, estimateMin } : { ...current, estimateMin }
    )
    setError(null)
    setConfirmingDelete(false)
  }

  function handleKindChange(kind: ItemKind): void {
    if (draft.variant !== 'element') return

    updateDraft({
      kind,
      noTime: kind === 'exam' ? draft.noTime : false,
      time: kind !== 'exam' && draft.time === '' ? '08:00' : draft.time
    })
  }

  function handleNoTimeChange(noTime: boolean): void {
    if (draft.variant !== 'element') return

    updateDraft({
      noTime,
      time: noTime || draft.time !== '' ? draft.time : '08:00'
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (busy) return

    if (draft.variant === 'task') {
      const validation = validateTaskDraft(draft)

      if (!validation.ok) {
        setError(validation.message)

        if (draft.title.trim().length === 0) {
          titleRef.current?.focus()
        }

        return
      }

      if (onSubmitTask === undefined) return

      setError(null)
      setPending('save')

      try {
        await onSubmitTask(validation.values)
        setPending(null)
      } catch {
        setError('L’enregistrement a échoué. Réessayez.')
        setPending(null)
      }

      return
    }

    if (onSubmit === undefined) return

    const validation = validateElementDraft(draft)

    if (!validation.ok) {
      setError(validation.message)

      if (draft.title.trim().length === 0) {
        titleRef.current?.focus()
      }

      return
    }

    setError(null)
    setPending('save')

    try {
      await onSubmit(validation.values)
      setPending(null)
    } catch {
      setError('L’enregistrement a échoué. Réessayez.')
      setPending(null)
    }
  }

  async function handleDelete(): Promise<void> {
    if (busy || onDelete === undefined) return

    if (!confirmingDelete) {
      setError(null)
      setConfirmingDelete(true)
      return
    }

    setError(null)
    setPending('delete')

    try {
      await onDelete()
    } catch {
      setError('La suppression a échoué. Réessayez.')
      setPending(null)
      setConfirmingDelete(false)
    }
  }

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      style={{
        left: `${position?.x ?? anchor.x}px`,
        top: `${position?.y ?? anchor.y}px`,
        visibility: position === null ? 'hidden' : 'visible'
      }}
      role="dialog"
      aria-label={
        mode === 'create'
          ? 'Nouvel élément'
          : mode === 'task'
            ? 'Modifier la tâche'
            : 'Modifier l’élément'
      }
    >
      <div className={styles.header}>
        <h2 className={styles.title}>
          {mode === 'create'
            ? 'Nouvel élément'
            : mode === 'task'
              ? 'Modifier la tâche'
              : 'Modifier'}
        </h2>
        {recurring && <span className={styles.recurringBadge}>Semaine type</span>}
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Fermer"
          title="Fermer"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>Titre</span>
            <input
              ref={titleRef}
              className={styles.control}
              type="text"
              value={draft.title}
              placeholder={mode === 'task' ? 'Titre de la tâche' : 'Titre de l’élément'}
              aria-label="Titre"
              maxLength={200}
              autoFocus
              disabled={busy}
              onChange={(event) => updateCommon({ title: event.target.value })}
            />
          </label>

          <div className={styles.row}>
            {draft.variant === 'element' && (
              <label className={`${styles.field} ${styles.typeField}`}>
                <span className={styles.label}>Type</span>
                <select
                  className={styles.control}
                  value={draft.kind}
                  aria-label="Type"
                  disabled={busy}
                  onChange={(event) => handleKindChange(event.target.value as ItemKind)}
                >
                  {kindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={`${styles.field} ${styles.grow}`}>
              <span className={styles.label}>Catégorie</span>
              <span className={styles.categoryControl}>
                <span
                  className={
                    selectedCategory === null
                      ? `${styles.categoryDot} ${styles.categoryDotEmpty}`
                      : styles.categoryDot
                  }
                  style={
                    selectedCategory === null
                      ? undefined
                      : categoryColorStyle(selectedCategory.color)
                  }
                  aria-hidden="true"
                />
                <select
                  className={`${styles.control} ${styles.categorySelect}`}
                  value={draft.categoryId ?? ''}
                  aria-label="Catégorie"
                  disabled={busy}
                  onChange={(event) =>
                    updateCommon({
                      categoryId: event.target.value === '' ? null : event.target.value
                    })
                  }
                >
                  <option value="">Sans catégorie</option>
                  {categorySections.map((section) => (
                    <optgroup key={section.id} label={section.label}>
                      {section.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {archivedCurrent !== null && (
                    <optgroup label="Archivées">
                      <option value={archivedCurrent.id}>{archivedCurrent.name}</option>
                    </optgroup>
                  )}
                </select>
              </span>
            </label>
          </div>

          {draft.variant === 'element' && (
            <>
              <div className={styles.row}>
                <label className={`${styles.field} ${styles.dateField}`}>
                  <span className={styles.label}>Date</span>
                  <input
                    className={styles.control}
                    type="date"
                    value={draft.date}
                    aria-label="Date"
                    disabled={busy}
                    onChange={(event) => updateDraft({ date: event.target.value })}
                  />
                </label>

                <label className={`${styles.field} ${styles.timeField}`}>
                  <span className={styles.label}>Heure</span>
                  <input
                    className={styles.control}
                    type="time"
                    step={900}
                    value={draft.noTime ? '' : draft.time}
                    aria-label="Heure"
                    disabled={busy || draft.noTime}
                    onChange={(event) => updateDraft({ time: event.target.value })}
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
                      value={draft.durationMin}
                      aria-label="Durée en minutes"
                      disabled={busy}
                      onChange={(event) => updateDraft({ durationMin: event.target.value })}
                    />
                    <span className={styles.suffix}>min</span>
                  </span>
                </label>
              </div>

              {draft.kind === 'exam' && (
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={draft.noTime}
                    disabled={busy}
                    onChange={(event) => handleNoTimeChange(event.target.checked)}
                  />
                  Sans heure (ligne du haut)
                </label>
              )}
            </>
          )}

          {(draft.variant === 'task' || draft.kind === 'task') && (
            <label className={`${styles.field} ${styles.estimateField}`}>
              <span className={styles.label}>Durée estimée</span>
              <span className={styles.suffixField}>
                <input
                  className={styles.control}
                  type="number"
                  min={1}
                  step={15}
                  inputMode="numeric"
                  value={draft.estimateMin}
                  placeholder="Facultative"
                  aria-label="Durée estimée en minutes"
                  disabled={busy}
                  onChange={(event) => updateEstimate(event.target.value)}
                />
                <span className={styles.suffix}>min</span>
              </span>
            </label>
          )}

          {!recurring && (
            <label className={styles.field}>
              <span className={styles.label}>Notes</span>
              <textarea
                className={`${styles.control} ${styles.textarea}`}
                rows={2}
                value={draft.notes}
                placeholder="Notes"
                aria-label="Notes"
                maxLength={4000}
                disabled={busy}
                onChange={(event) => updateCommon({ notes: event.target.value })}
              />
            </label>
          )}

          {error !== null && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        {confirmingDelete && (
          <div className={styles.confirmDelete}>
            <span>
              {recurring
                ? 'Supprimer ce bloc de la semaine type ?'
                : 'Retirer ce bloc de la grille ?'}
            </span>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Non
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                {pending === 'delete' ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        )}

        <div className={styles.footer}>
          {onDelete === undefined ? (
            <span />
          ) : (
            <button
              type="button"
              className={styles.deleteButton}
              disabled={busy || confirmingDelete}
              onClick={() => void handleDelete()}
            >
              Supprimer
            </button>
          )}

          <div className={styles.footerActions}>
            <button type="button" className={styles.ghostButton} disabled={busy} onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {pending === 'save' ? 'Enregistrement…' : mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
