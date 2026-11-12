import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { DRAG_START_DISTANCE_PX } from '../../core/drag'
import { firstTaskType, itemTypeAccentColor } from '../../core/itemTypes'
import { listInboxTasks, validateQuickTaskDraft, type InboxTask } from '../../core/inbox'
import { taskDraftFrom, type TaskDraft, type TaskDraftValues } from '../../core/elementEditor'
import { formatDurationMinutes } from '../../core/time'
import type { Block, Category, CategoryGroup, Item, ItemType } from '../../core/types'
import { repositories } from '../../db/repositories'
import type { DeletedTaskResult } from '../../db/repositories/planning'
import { useEditingStore } from '../../state/editing'
import { usePreferencesStore } from '../../state/preferences'
import { categoryColorStyle } from '../categoryColorStyle'
import { ContextMenu } from '../components/ContextMenu'
import { Icon } from '../components/Icon'
import { ElementEditor } from './ElementEditor'
import type { FloatingAnchor } from './scheduleTypes'
import styles from './InboxPanel.module.css'

interface InboxPanelProps {
  onTaskDragStart: (task: InboxTask, event: React.PointerEvent<HTMLButtonElement>) => void
  /** Vrai lorsqu'un bloc est survolé au-dessus du panneau. */
  dropActive: boolean
  /** Prévient la vue calendrier pour afficher le message d'annulation. */
  onTaskDeleted: (result: DeletedTaskResult) => void
}

interface InboxSnapshot {
  items: Item[]
  blocks: Block[]
  itemTypes: ItemType[]
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

interface InboxContextMenu {
  x: number
  y: number
  task: InboxTask
}

/**
 * Panneau latéral « À planifier ». Il ne fait aucune écriture directe : les
 * ajouts et modifications passent par les repositories, la liste se met à jour
 * via `useLiveQuery`. Les rangées servent aussi de source de glisser.
 */
export const InboxPanel = memo(function InboxPanel({
  onTaskDragStart,
  dropActive,
  onTaskDeleted
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
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [taskEditor, setTaskEditor] = useState<TaskEditorSession | null>(null)
  const [contextMenu, setContextMenu] = useState<InboxContextMenu | null>(null)
  const taskPointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const selection = useEditingStore((state) => state.selection)
  const select = useEditingStore((state) => state.select)
  const copyToClipboard = useEditingStore((state) => state.copyToClipboard)
  const noteDuplicate = useEditingStore((state) => state.noteDuplicate)
  const duplicateAfter = useEditingStore((state) => state.duplicateAfter)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [items, blocks, itemTypes, categories, categoryGroups] = await Promise.all([
        repositories.items.list(),
        repositories.blocks.list(),
        repositories.itemTypes.list(),
        repositories.categories.list(),
        repositories.categoryGroups.list()
      ])

      return {
        items,
        blocks,
        itemTypes,
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
            snapshot.itemTypes,
            defaultTaskDurationMin
          ),
    [defaultTaskDurationMin, snapshot]
  )
  const itemTypes = useMemo(() => snapshot?.itemTypes ?? [], [snapshot])
  const defaultTaskType = useMemo(() => firstTaskType(itemTypes), [itemTypes])
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
  const orderedTasks = useMemo(
    () => orderTasksWithDuplicates(visibleTasks, duplicateAfter),
    [duplicateAfter, visibleTasks]
  )
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

    if (defaultTaskType === null) {
      setFormError('Créez d’abord un type d’élément marqué « tâche ».')
      return
    }

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
        typeId: defaultTaskType.id,
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
    select({ kind: 'inbox', itemId: task.item.id })
    setTaskEditor({
      itemId: task.item.id,
      anchor: { x: event.clientX, y: event.clientY },
      draft: taskDraftFrom(task.item, task.type)
    })
  }

  function handleTaskPointerDown(
    task: InboxTask,
    event: React.PointerEvent<HTMLButtonElement>
  ): void {
    if (event.button !== 0) return

    select({ kind: 'inbox', itemId: task.item.id })
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

  async function deleteTask(itemId: string): Promise<void> {
    const result = await repositories.planning.deleteTask(itemId)

    setDeleteError(null)
    setTaskEditor((current) => (current?.itemId === itemId ? null : current))
    onTaskDeleted(result)
  }

  async function handleTaskDelete(task: InboxTask): Promise<void> {
    try {
      await deleteTask(task.item.id)
    } catch {
      setDeleteError('La tâche n’a pas pu être supprimée. Réessayez.')
    }
  }

  async function handleEditorTaskDelete(): Promise<void> {
    if (taskEditor === null) return

    await deleteTask(taskEditor.itemId)
  }

  async function duplicateTask(task: InboxTask): Promise<void> {
    const result = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: task.item.id,
      blockId: null
    })

    noteDuplicate(result.item.id, task.item.id)
    select({ kind: 'inbox', itemId: result.item.id })
    setDeleteError(null)
  }

  async function handleTaskDuplicate(task: InboxTask): Promise<void> {
    try {
      await duplicateTask(task)
    } catch {
      setDeleteError('La tâche n’a pas pu être dupliquée. Réessayez.')
    }
  }

  async function handleEditorTaskDuplicate(): Promise<void> {
    if (taskEditor === null) return

    const sourceId = taskEditor.itemId
    const result = await repositories.elements.duplicateItem({
      kind: 'stored',
      itemId: sourceId,
      blockId: null
    })

    noteDuplicate(result.item.id, sourceId)
    select({ kind: 'inbox', itemId: result.item.id })
    setTaskEditor(null)
  }

  function handleTaskCopy(task: InboxTask): void {
    copyToClipboard({ kind: 'stored', itemId: task.item.id, blockId: null })
  }

  function handleTaskContextMenu(task: InboxTask, event: React.MouseEvent<HTMLElement>): void {
    event.preventDefault()
    event.stopPropagation()
    select({ kind: 'inbox', itemId: task.item.id })
    setContextMenu({ x: event.clientX, y: event.clientY, task })
  }

  function handleTaskKeyDown(task: InboxTask, event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Delete' || event.repeat) return

    event.preventDefault()
    event.stopPropagation()
    void handleTaskDelete(task)
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
              {deleteError !== null && (
                <p className={`${styles.error} ${styles.listError}`} role="alert">
                  {deleteError}
                </p>
              )}

              {loadError ? (
                <p className={styles.empty}>Les tâches n’ont pas pu être chargées.</p>
              ) : visibleTasks.length === 0 ? (
                <p className={styles.empty}>
                  {tasks.length === 0
                    ? 'Aucune tâche à planifier. Ajoutez-en une ci-dessus.'
                    : 'Aucune tâche dans cette catégorie.'}
                </p>
              ) : (
                orderedTasks.map((task) => {
                  const accent = itemTypeAccentColor(task.type, task.category?.color ?? null)
                  const selected = selection?.kind === 'inbox' && selection.itemId === task.item.id

                  return (
                    <div
                      className={styles.rowWrap}
                      key={task.item.id}
                      onContextMenu={(event) => handleTaskContextMenu(task, event)}
                    >
                      <button
                        type="button"
                        className={[
                          styles.row,
                          task.item.status === 'done' ? styles.rowDone : '',
                          selected ? styles.rowSelected : ''
                        ]
                          .filter((className) => className !== '')
                          .join(' ')}
                        onFocus={() => select({ kind: 'inbox', itemId: task.item.id })}
                        onKeyDown={(event) => handleTaskKeyDown(task, event)}
                        onPointerDown={(event) => handleTaskPointerDown(task, event)}
                        onClick={(event) => handleTaskClick(task, event)}
                      >
                        <span
                          className={styles.dot}
                          style={accent === null ? undefined : categoryColorStyle(accent)}
                          aria-hidden="true"
                        />
                        <span className={styles.rowTitle}>{task.item.title}</span>
                        <span className={styles.remaining}>
                          {formatDurationMinutes(task.remainingMin)}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={styles.duplicateButton}
                        aria-label="Dupliquer la tâche"
                        title="Dupliquer la tâche"
                        onClick={() => void handleTaskDuplicate(task)}
                      >
                        <Icon name="copy" size={14} />
                      </button>

                      <button
                        type="button"
                        className={styles.deleteButton}
                        aria-label="Supprimer la tâche"
                        title="Supprimer la tâche"
                        onClick={() => void handleTaskDelete(task)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )
                })
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
          itemTypes={itemTypes}
          onClose={() => setTaskEditor(null)}
          onSubmitTask={handleTaskSubmit}
          onDuplicate={handleEditorTaskDuplicate}
          onDelete={handleEditorTaskDelete}
        />
      )}

      {contextMenu !== null && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Actions sur la tâche"
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Dupliquer',
              onSelect: () => void handleTaskDuplicate(contextMenu.task)
            },
            { label: 'Copier', onSelect: () => handleTaskCopy(contextMenu.task) },
            {
              label: 'Supprimer',
              onSelect: () => void handleTaskDelete(contextMenu.task)
            }
          ]}
        />
      )}
    </>
  )
})

/**
 * Place chaque copie juste sous son original. L'ordre reste stable pour tous
 * les autres éléments, y compris quand un original quitte le panneau.
 */
function orderTasksWithDuplicates(
  tasks: readonly InboxTask[],
  duplicateAfter: Record<string, string>
): InboxTask[] {
  const byId = new Map(tasks.map((task) => [task.item.id, task]))
  const children = new Map<string, string[]>()
  const roots: string[] = []

  for (const task of tasks) {
    const sourceId = duplicateAfter[task.item.id]

    if (sourceId !== undefined && sourceId !== task.item.id && byId.has(sourceId)) {
      const list = children.get(sourceId)

      if (list === undefined) {
        children.set(sourceId, [task.item.id])
      } else {
        list.push(task.item.id)
      }
    } else {
      roots.push(task.item.id)
    }
  }

  const ordered: InboxTask[] = []
  const visited = new Set<string>()

  const append = (id: string): void => {
    if (visited.has(id)) return

    visited.add(id)
    const task = byId.get(id)

    if (task !== undefined) ordered.push(task)

    for (const childId of children.get(id) ?? []) {
      append(childId)
    }
  }

  for (const id of roots) append(id)
  for (const task of tasks) append(task.item.id)

  return ordered
}
