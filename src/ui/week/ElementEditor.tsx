import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  validateElementDraft,
  validateTaskDraft,
  type ElementDraft,
  type ElementDraftValues,
  type TaskDraft,
  type TaskDraftValues
} from '../../core/elementEditor'
import { notesTaskProgress } from '../../core/notes'
import type { Category, CategoryGroup, ItemType } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import { Icon } from '../components/Icon'
import { NotesEditor } from './NotesEditor'
import type { FloatingAnchor } from './scheduleTypes'
import styles from './ElementEditor.module.css'

const PANEL_MARGIN = 12

interface ElementEditorProps {
  mode: 'create' | 'edit' | 'task'
  initialDraft: ElementDraft | TaskDraft
  anchor: FloatingAnchor
  categories: readonly Category[]
  categoryGroups: readonly CategoryGroup[]
  itemTypes: readonly ItemType[]
  /** Pas d'accrochage du champ horaire, en minutes. */
  snapStepMin?: number
  /** Bloc calculé depuis la semaine type : type limité et pas de notes. */
  recurring?: boolean
  onClose: () => void
  /** Appelé pour un élément de la grille. */
  onSubmit?: (values: ElementDraftValues) => Promise<void>
  /** Appelé pour une tâche encore sans bloc, depuis « À planifier ». */
  onSubmitTask?: (values: TaskDraftValues) => Promise<void>
  /** Absent en création : rien n'existe encore à dupliquer. */
  onDuplicate?: () => Promise<void>
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
  itemTypes,
  snapStepMin = 15,
  recurring = false,
  onClose,
  onSubmit,
  onSubmitTask,
  onDuplicate,
  onDelete
}: ElementEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState<ElementDraft | TaskDraft>(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'save' | 'delete' | 'duplicate' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [position, setPosition] = useState<FloatingAnchor | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const busy = pending !== null

  const typeOptions = useMemo(() => {
    const active = itemTypes
      .filter((type) => type.archivedAt === null)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'))
    const current =
      draft.variant === 'element'
        ? (itemTypes.find((type) => type.id === draft.typeId) ?? null)
        : null

    if (
      current !== null &&
      current.archivedAt !== null &&
      !active.some((type) => type.id === current.id)
    ) {
      return [...active, current]
    }

    return active
  }, [draft, itemTypes])

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === draft.categoryId) ?? null,
    [categories, draft.categoryId]
  )

  const selectedType = useMemo(
    () =>
      draft.variant === 'element'
        ? (itemTypes.find((type) => type.id === draft.typeId) ?? null)
        : null,
    [draft, itemTypes]
  )

  const isTopLineElement =
    draft.variant === 'element' && draft.fullDay && selectedType?.placement === 'topLine'

  const notesProgress = useMemo(() => notesTaskProgress(draft.notes), [draft.notes])

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
  const draftShape = draft.variant === 'element' ? draft.typeId : 'task'

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

  function handleTypeChange(typeId: string): void {
    if (draft.variant !== 'element') return

    const type = itemTypes.find((candidate) => candidate.id === typeId)

    if (type === undefined) return

    const fullDay = type.placement === 'topLine'
    const endDate = fullDay
      ? draft.endDate !== '' && draft.endDate >= draft.date
        ? draft.endDate
        : draft.date
      : ''

    updateDraft({
      typeId: type.id,
      isTask: type.isTask,
      fullDay,
      endDate,
      time: fullDay ? '' : draft.time === '' ? '08:00' : draft.time,
      estimateMin: type.isTask ? draft.estimateMin : '',
      status: type.isTask ? (draft.status ?? 'todo') : null
    })
  }

  function handleFullDayChange(fullDay: boolean): void {
    if (draft.variant !== 'element') return

    updateDraft({
      fullDay,
      time: fullDay || draft.time !== '' ? draft.time : '08:00'
    })
  }

  function handleStartDateChange(date: string): void {
    if (draft.variant !== 'element') return

    const endDate = draft.fullDay
      ? recurring
        ? date
        : draft.endDate !== '' && draft.endDate < date
          ? date
          : draft.endDate
      : draft.endDate

    updateDraft({ date, endDate })
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

    // Une tâche sans bloc se supprime immédiatement et reste annulable depuis
    // le message affiché par le calendrier.
    if (!confirmingDelete && mode !== 'task') {
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

  async function handleDuplicate(): Promise<void> {
    if (busy || onDuplicate === undefined) return

    setError(null)
    setConfirmingDelete(false)
    setPending('duplicate')

    try {
      await onDuplicate()
      setPending(null)
    } catch {
      setError('La duplication a échoué. Réessayez.')
      setPending(null)
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
                  value={draft.typeId}
                  aria-label="Type"
                  disabled={busy}
                  onChange={(event) => handleTypeChange(event.target.value)}
                >
                  {typeOptions.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
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
              {isTopLineElement ? (
                <div className={styles.row}>
                  <label className={`${styles.field} ${styles.dateField}`}>
                    <span className={styles.label}>{recurring ? 'Date' : 'Du'}</span>
                    <input
                      className={styles.control}
                      type="date"
                      value={draft.date}
                      aria-label={recurring ? 'Date' : 'Date de début'}
                      disabled={busy}
                      onChange={(event) => handleStartDateChange(event.target.value)}
                    />
                  </label>

                  {!recurring && (
                    <label className={`${styles.field} ${styles.dateField}`}>
                      <span className={styles.label}>Au</span>
                      <input
                        className={styles.control}
                        type="date"
                        value={draft.endDate}
                        min={draft.date}
                        aria-label="Date de fin"
                        disabled={busy}
                        onChange={(event) => updateDraft({ endDate: event.target.value })}
                      />
                    </label>
                  )}
                </div>
              ) : (
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
                        step={snapStepMin * 60}
                        value={draft.fullDay ? '' : draft.time}
                        aria-label="Heure"
                        disabled={busy || draft.fullDay}
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

                  {!recurring && (
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={draft.fullDay}
                        disabled={busy}
                        onChange={(event) => handleFullDayChange(event.target.checked)}
                      />
                      Journée entière (ligne du haut)
                    </label>
                  )}
                </>
              )}
            </>
          )}

          {(draft.variant === 'task' || draft.isTask) && (
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
            <div className={styles.field}>
              <span className={styles.labelRow}>
                <span className={styles.label}>Notes</span>
                {notesProgress.total > 0 && (
                  <span
                    className={styles.notesProgress}
                    aria-label={`${notesProgress.checked} cases cochées sur ${notesProgress.total}`}
                  >
                    {notesProgress.checked}/{notesProgress.total}
                  </span>
                )}
              </span>
              <NotesEditor
                value={draft.notes}
                disabled={busy}
                onChange={(notes) => updateCommon({ notes })}
              />
            </div>
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
          <div className={styles.footerLeft}>
            {onDuplicate !== undefined && (
              <button
                type="button"
                className={styles.duplicateButton}
                disabled={busy}
                onClick={() => void handleDuplicate()}
              >
                Dupliquer
              </button>
            )}

            {onDelete !== undefined && (
              <button
                type="button"
                className={styles.deleteButton}
                disabled={busy || confirmingDelete}
                onClick={() => void handleDelete()}
              >
                Supprimer
              </button>
            )}
          </div>

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
