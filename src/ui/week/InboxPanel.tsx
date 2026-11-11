import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { DRAG_START_DISTANCE_PX } from '../../core/drag'
import { listInboxTasks, validateQuickTaskDraft, type InboxTask } from '../../core/inbox'
import { taskDraftFrom, type TaskDraft, type TaskDraftValues } from '../../core/elementEditor'
import { formatDurationMinutes } from '../../core/time'
import type { Block, Category, CategoryGroup, Item } from '../../core/types'
import { repositories } from '../../db/repositories'
import { usePreferencesStore } from '../../state/preferences'
import { categoryColorStyle } from '../categoryColorStyle'
import { Icon } from '../components/Icon'
import { ElementEditor } from './ElementEditor'
import type { FloatingAnchor } from './scheduleTypes'
import styles from './InboxPanel.module.css'

interface InboxPanelProps {
  onTaskDragStart: (task: InboxTask, event: React.PointerEvent<HTMLButtonElement>) => void
  /** Vrai lorsqu'un bloc est survolé au-dessus du panneau. */
  dropActive: boolean
}

interface InboxSnapshot {
  items: Item[]
  blocks: Block[]
  categories: Category[]
  categoryGroups: CategoryGroup[]
}

interface CategorySection {
  id: string
  label: string
  categories: Category[]
}

interface TaskEditorSession {
  itemId: string
  anchor: FloatingAnchor
  draft: TaskDraft
}

/**
 * Panneau latéral « À planifier ». Il ne fait aucune écriture directe : les
 * ajouts et modifications passent par les repositories, la liste se met à jour
 * via `useLiveQuery`. Les rangées servent aussi de source de glisser.
 */
export const InboxPanel = memo(function InboxPanel({
  onTaskDragStart,
  dropActive
}: InboxPanelProps): React.JSX.Element {
  const defaultTaskDurationMin = usePreferencesStore(
    (state) => state.preferences.defaultTaskDurationMin
  )
  const [collapsed, setCollapsed] = useState(false)
  const [snapshot, setSnapshot] = useState<InboxSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [estimateMin, setEstimateMin] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [taskEditor, setTaskEditor] = useState<TaskEditorSession | null>(null)
  const taskPointerDownRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [items, blocks, categories, categoryGroups] = await Promise.all([
        repositories.items.list(),
        repositories.blocks.list(),
        repositories.categories.list(),
        repositories.categoryGroups.list()
      ])

      return {
        items,
        blocks,
        categories,
        categoryGroups
      }
    }).subscribe({
      next: (data) => {
        setSnapshot(data)
        setLoadError(false)
      },
      error: () => setLoadError(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const tasks = useMemo(
    () =>
      snapshot === null
        ? []
        : listInboxTasks(
            snapshot.items,
            snapshot.blocks,
            snapshot.categories,
            defaultTaskDurationMin
          ),
    [defaultTaskDurationMin, snapshot]
  )
  const categories = useMemo(() => snapshot?.categories ?? [], [snapshot])
  const categoryGroups = useMemo(() => snapshot?.categoryGroups ?? [], [snapshot])

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

  const filterCategories = useMemo(() => {
    const categoriesById = new Map(categories.map((category) => [category.id, category]))
    const seen = new Set<string>()
    const result: Category[] = []

    for (const task of tasks) {
      const id = task.item.categoryId

      if (id === null || seen.has(id)) continue

      seen.add(id)
      const category = categoriesById.get(id)

      if (category !== undefined) result.push(category)
    }

    return result
  }, [tasks, categories])

  const effectiveFilterCategoryId =
    filterCategoryId !== null &&
    filterCategories.some((category) => category.id === filterCategoryId)
      ? filterCategoryId
      : null
  const effectiveCategoryId =
    categoryId !== null &&
    categories.some((category) => category.id === categoryId && category.archivedAt === null)
      ? categoryId
      : null
  const visibleTasks =
    effectiveFilterCategoryId === null
      ? tasks
      : tasks.filter((task) => task.item.categoryId === effectiveFilterCategoryId)
  const selectedCategory =
    categories.find((category) => category.id === effectiveCategoryId) ?? null

  function selectFilter(categoryIdToSelect: string | null): void {
    setFilterCategoryId(categoryIdToSelect)

    if (categoryIdToSelect === null) {
      setCategoryId(null)
      return
    }

    const category = categories.find((candidate) => candidate.id === categoryIdToSelect)
    setCategoryId(category !== undefined && category.archivedAt === null ? category.id : null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (pending) return

    const validation = validateQuickTaskDraft({
      title,
      categoryId: effectiveCategoryId,
      estimateMin
    })

    if (!validation.ok) {
      setFormError(validation.message)
      return
    }

    setPending(true)
    setFormError(null)

    try {
      await repositories.items.create({
        kind: 'task',
        title: validation.values.title,
        categoryId: validation.values.categoryId,
        estimateMin: validation.values.estimateMin,
        status: 'todo'
      })

      setTitle('')
      setEstimateMin('')
    } catch {
      setFormError('La tâche n’a pas pu être ajoutée. Réessayez.')
    } finally {
      setPending(false)
    }
  }

  function openTask(task: InboxTask, event: React.MouseEvent<HTMLButtonElement>): void {
    setTaskEditor({
      itemId: task.item.id,
      anchor: { x: event.clientX, y: event.clientY },
      draft: taskDraftFrom(task.item)
    })
  }

  function handleTaskPointerDown(
    task: InboxTask,
    event: React.PointerEvent<HTMLButtonElement>
  ): void {
    if (event.button !== 0) return

    taskPointerDownRef.current = { x: event.clientX, y: event.clientY }
    onTaskDragStart(task, event)
  }

  function handleTaskClick(task: InboxTask, event: React.MouseEvent<HTMLButtonElement>): void {
    const pointerDown = taskPointerDownRef.current
    taskPointerDownRef.current = null

    if (event.detail !== 0 && pointerDown !== null) {
      const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)

      if (distance > DRAG_START_DISTANCE_PX) return
    }

    openTask(task, event)
  }

  async function handleTaskSubmit(values: TaskDraftValues): Promise<void> {
    if (taskEditor === null) return

    await repositories.items.update(taskEditor.itemId, {
      title: values.title,
      notes: values.notes,
      categoryId: values.categoryId,
      estimateMin: values.estimateMin
    })
    setTaskEditor(null)
  }

  return (
    <>
      <aside
        className={[
          styles.panel,
          collapsed ? styles.collapsed : '',
          dropActive ? styles.dropTarget : ''
        ]
          .filter((className) => className !== '')
          .join(' ')}
        aria-label="À planifier"
        data-inbox-drop=""
      >
        {collapsed ? (
          <div className={styles.collapsedHeader}>
            <button
              type="button"
              className={styles.collapseButton}
              aria-label="Déplier le panneau À planifier"
              title="Déplier le panneau À planifier"
              aria-expanded={false}
              onClick={() => setCollapsed(false)}
            >
              <Icon name="chevronLeft" size={17} />
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <h2 className={styles.heading}>À planifier</h2>
              <button
                type="button"
                className={styles.collapseButton}
                aria-label="Replier le panneau À planifier"
                title="Replier le panneau À planifier"
                aria-expanded={true}
                onClick={() => setCollapsed(true)}
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </div>

            <form className={styles.quickAdd} onSubmit={handleSubmit} noValidate>
              <input
                className={styles.titleInput}
                type="text"
                value={title}
                placeholder="Ajouter une tâche…"
                aria-label="Titre de la tâche à ajouter"
                maxLength={200}
                disabled={pending}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setFormError(null)
                }}
              />

              <div className={styles.quickRow}>
                <span className={styles.categoryField}>
                  <span
                    className={styles.categoryDot}
                    style={
                      selectedCategory === null
                        ? undefined
                        : categoryColorStyle(selectedCategory.color)
                    }
                    aria-hidden="true"
                  />
                  <select
                    className={styles.categorySelect}
                    value={effectiveCategoryId ?? ''}
                    aria-label="Catégorie de la nouvelle tâche"
                    disabled={pending}
                    onChange={(event) => {
                      setCategoryId(event.target.value === '' ? null : event.target.value)
                      setFormError(null)
                    }}
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
                  </select>
                </span>

                <span className={styles.estimateField}>
                  <input
                    className={styles.estimateInput}
                    type="number"
                    min={1}
                    step={15}
                    inputMode="numeric"
                    value={estimateMin}
                    placeholder="Durée"
                    aria-label="Durée estimée en minutes (facultative)"
                    disabled={pending}
                    onChange={(event) => {
                      setEstimateMin(event.target.value)
                      setFormError(null)
                    }}
                  />
                  <span className={styles.estimateSuffix}>min</span>
                </span>

                <button
                  type="submit"
                  className={styles.submitButton}
                  aria-label="Ajouter la tâche"
                  title="Ajouter la tâche"
                  disabled={pending || title.trim().length === 0}
                >
                  <Icon name="plus" size={15} />
                </button>
              </div>

              {formError !== null && (
                <p className={styles.error} role="alert">
                  {formError}
                </p>
              )}
            </form>

            <div className={styles.filters} role="group" aria-label="Filtrer par catégorie">
              <button
                type="button"
                className={
                  effectiveFilterCategoryId === null
                    ? `${styles.filterButton} ${styles.filterActive}`
                    : styles.filterButton
                }
                aria-pressed={effectiveFilterCategoryId === null}
                onClick={() => selectFilter(null)}
              >
                Toutes
              </button>
              {filterCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={
                    effectiveFilterCategoryId === category.id
                      ? `${styles.filterButton} ${styles.filterActive}`
                      : styles.filterButton
                  }
                  aria-pressed={effectiveFilterCategoryId === category.id}
                  onClick={() => selectFilter(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className={styles.list}>
              {loadError ? (
                <p className={styles.empty}>Les tâches n’ont pas pu être chargées.</p>
              ) : visibleTasks.length === 0 ? (
                <p className={styles.empty}>
                  {tasks.length === 0
                    ? 'Aucune tâche à planifier. Ajoutez-en une ci-dessus.'
                    : 'Aucune tâche dans cette catégorie.'}
                </p>
              ) : (
                visibleTasks.map((task) => (
                  <button
                    key={task.item.id}
                    type="button"
                    className={
                      task.item.status === 'done' ? `${styles.row} ${styles.rowDone}` : styles.row
                    }
                    onPointerDown={(event) => handleTaskPointerDown(task, event)}
                    onClick={(event) => handleTaskClick(task, event)}
                  >
                    <span
                      className={styles.dot}
                      style={
                        task.category === null ? undefined : categoryColorStyle(task.category.color)
                      }
                      aria-hidden="true"
                    />
                    <span className={styles.rowTitle}>{task.item.title}</span>
                    <span className={styles.remaining}>
                      {formatDurationMinutes(task.remainingMin)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {dropActive && !collapsed && (
          <div className={styles.dropHint} aria-hidden="true">
            Relâcher pour retirer le bloc
          </div>
        )}
      </aside>

      {taskEditor !== null && (
        <ElementEditor
          key={taskEditor.itemId}
          mode="task"
          initialDraft={taskEditor.draft}
          anchor={taskEditor.anchor}
          categories={categories}
          categoryGroups={categoryGroups}
          onClose={() => setTaskEditor(null)}
          onSubmitTask={handleTaskSubmit}
        />
      )}
    </>
  )
})
