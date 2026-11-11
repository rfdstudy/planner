import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  createNewElementDraft,
  elementDraftFrom,
  snapNewBlockStart,
  type ElementDraft,
  type ElementDraftValues
} from '../../core/elementEditor'
import { computeOccurrences, type TemplateOccurrence } from '../../core/recurrence'
import { layoutBlocks } from '../../core/schedule'
import {
  MINUTES_PER_DAY,
  formatDaysUntil,
  formatDurationMinutes,
  formatLongDate,
  formatWeekdayShort,
  formatWeekLabel,
  getWeekDays,
  getWeekEnd,
  minutesToTime,
  parseLocalDate,
  todayLocalDate
} from '../../core/time'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  LocalDate,
  Override,
  Template,
  TemplateKind
} from '../../core/types'
import { loadDemoWeek } from '../../db/demoWeek'
import { repositories } from '../../db/repositories'
import { useUiStore } from '../../state/ui'
import { categoryColorStyle } from '../categoryColorStyle'
import { ElementEditor } from './ElementEditor'
import { InboxPanel } from './InboxPanel'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { TimeBlock } from './TimeBlock'
import { WeekTopBar } from './WeekTopBar'
import { useScheduleDrag } from './useScheduleDrag'
import type { FloatingAnchor, PlacedEntry, WeekData, WeekDayData, WeekEntry } from './weekTypes'
import styles from './WeekView.module.css'

const INITIAL_SCROLL_LEAD_MIN = 30
const OTHER_DAY_START_MIN = 8 * 60

type ElementEditorSession =
  | { mode: 'create'; anchor: FloatingAnchor; draft: ElementDraft }
  | {
      mode: 'edit'
      entry: WeekEntry
      anchor: FloatingAnchor
      draft: ElementDraft
    }

interface ReturnToEditor {
  anchor: FloatingAnchor
  draft: ElementDraft
}

type RecurrenceScopeRequest =
  | {
      kind: 'edit'
      entry: WeekEntry
      values: ElementDraftValues
      returnToEditor: ReturnToEditor
    }
  | { kind: 'move'; entry: WeekEntry; target: { date: LocalDate; startMin: number } }
  | { kind: 'resize'; entry: WeekEntry; durationMin: number }
  | { kind: 'delete'; entry: WeekEntry; returnToEditor?: ReturnToEditor }

/** Valeurs d'une occurrence virtuelle, telles que les repositories les attendent. */
interface OccurrenceFormValues {
  kind: TemplateKind
  title: string
  categoryId: string | null
  startMin: number
  durationMin: number
}

export function WeekView(): React.JSX.Element {
  const weekStart = useUiStore((state) => state.weekStart)
  const previousWeek = useUiStore((state) => state.previousWeek)
  const nextWeek = useUiStore((state) => state.nextWeek)
  const goToToday = useUiStore((state) => state.goToToday)
  const showWeek = useUiStore((state) => state.showWeek)
  const openCategories = useUiStore((state) => state.openCategories)
  const openTemplates = useUiStore((state) => state.openTemplates)

  const [snapshot, setSnapshot] = useState<WeekData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [editor, setEditor] = useState<ElementEditorSession | null>(null)
  const [scopeRequest, setScopeRequest] = useState<RecurrenceScopeRequest | null>(null)
  const [now, setNow] = useState(() => new Date())
  const scrollRef = useRef<HTMLDivElement>(null)

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const data = snapshot?.weekStart === weekStart ? snapshot : null
  const daysData = useMemo(() => {
    const byDate = new Map<LocalDate, WeekDayData>()

    for (const day of data?.days ?? []) {
      byDate.set(day.date, day)
    }

    return byDate
  }, [data])
  const daysRef = useRef<HTMLDivElement>(null)
  const drag = useScheduleDrag({
    scrollRef,
    daysRef,
    weekDays,
    daysData,
    onError: setActionError,
    onTemplateMove: (entry, target) => {
      setActionError(null)
      setScopeRequest({ kind: 'move', entry, target })
    },
    onTemplateResize: (entry, durationMin) => {
      setActionError(null)
      setScopeRequest({ kind: 'resize', entry, durationMin })
    },
    onTemplateDelete: (entry) => {
      setActionError(null)
      setScopeRequest({ kind: 'delete', entry })
    }
  })

  const today = todayLocalDate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const hasExamLine = weekDays.some((date) => (daysData.get(date)?.exams.length ?? 0) > 0)
  const statusMessage = loadError
    ? 'La semaine n’a pas pu être chargée.'
    : demoError !== null
      ? demoError
      : actionError

  useEffect(() => {
    const days = getWeekDays(weekStart)
    const weekEnd = getWeekEnd(weekStart)

    const subscription = liveQuery(async () => {
      const [blocks, items, categories, categoryGroups, templates, overrides] = await Promise.all([
        repositories.blocks.listBetween(weekStart, weekEnd),
        repositories.items.list(),
        repositories.categories.list(),
        repositories.categoryGroups.list(),
        repositories.templates.list(),
        repositories.overrides.list()
      ])

      return buildWeekData(
        weekStart,
        days,
        blocks,
        items,
        categories,
        categoryGroups,
        templates,
        overrides
      )
    }).subscribe({
      next: (weekData) => {
        setSnapshot(weekData)
        setLoadError(false)
      },
      error: () => setLoadError(true)
    })

    return () => subscription.unsubscribe()
  }, [weekStart])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useLayoutEffect(() => {
    const container = scrollRef.current

    if (container === null) return

    const reference = new Date()
    const currentMinutes = reference.getHours() * 60 + reference.getMinutes()
    const containsToday = getWeekDays(weekStart).includes(todayLocalDate(reference))
    const targetMin = containsToday
      ? Math.max(0, currentMinutes - 120)
      : 7 * 60 - INITIAL_SCROLL_LEAD_MIN

    container.scrollTop = targetMin
  }, [weekStart])

  const openNewTask = useCallback((): void => {
    const reference = new Date()
    const referenceDate = todayLocalDate(reference)
    const date = weekDays.includes(referenceDate) ? referenceDate : weekStart
    const referenceMinutes = reference.getHours() * 60 + reference.getMinutes()
    const startMin =
      date === referenceDate ? snapNewBlockStart(referenceMinutes) : OTHER_DAY_START_MIN

    setActionError(null)
    setEditor({
      mode: 'create',
      anchor: { x: Math.max(12, window.innerWidth / 2 - 174), y: 96 },
      draft: createNewElementDraft({ date, startMin })
    })
  }, [weekDays, weekStart])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'n' && event.key !== 'N') return
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      if (editor !== null || drag.session !== null || isTextEntryTarget(event.target)) return

      event.preventDefault()
      openNewTask()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drag.session, editor, openNewTask])

  async function handleLoadDemo(): Promise<void> {
    if (demoLoading) return

    setDemoLoading(true)
    setDemoError(null)

    try {
      const result = await loadDemoWeek(repositories)
      showWeek(result.weekStart)
    } catch {
      setDemoError('Les données de démonstration n’ont pas pu être chargées.')
    } finally {
      setDemoLoading(false)
    }
  }

  function handleToday(): void {
    const reference = new Date()
    const container = scrollRef.current

    goToToday()
    setNow(reference)

    if (container !== null) {
      container.scrollTop = Math.max(0, reference.getHours() * 60 + reference.getMinutes() - 120)
    }
  }

  const openEntry = useCallback((entry: WeekEntry, anchor: FloatingAnchor): void => {
    setActionError(null)
    setEditor({
      mode: 'edit',
      entry,
      anchor,
      draft: elementDraftFrom(entry.item, entry.block)
    })
  }, [])

  function handleSlotClick(date: LocalDate, event: React.MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0 || drag.session !== null) return

    const rect = event.currentTarget.getBoundingClientRect()
    const startMin = snapNewBlockStart(event.clientY - rect.top)

    setActionError(null)
    setEditor({
      mode: 'create',
      anchor: { x: event.clientX, y: event.clientY },
      draft: createNewElementDraft({ date, startMin })
    })
  }

  const handleToggleDone = useCallback(async (entry: PlacedEntry, done: boolean): Promise<void> => {
    setActionError(null)

    try {
      await repositories.items.setTaskStatus(entry.item.id, done ? 'done' : 'todo')
    } catch {
      setActionError('Le statut de la tâche n’a pas pu être mis à jour.')
    }
  }, [])

  const handleUndo = useCallback(async (): Promise<void> => {
    try {
      const action = await repositories.history.undo()

      if (action !== null) {
        setActionError(null)
      }
    } catch {
      setActionError('La dernière action n’a pas pu être annulée.')
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z'

      if (!isUndo) return
      if (isTextEntryTarget(event.target) || editor !== null || drag.session !== null) return

      event.preventDefault()
      void handleUndo()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drag.session, editor, handleUndo])

  async function handleEditorSubmit(values: ElementDraftValues): Promise<void> {
    if (editor === null) return

    if (editor.mode === 'create') {
      await repositories.elements.create({
        item: {
          kind: values.kind,
          title: values.title,
          notes: values.notes,
          categoryId: values.categoryId,
          estimateMin: values.estimateMin,
          status: values.status
        },
        block: {
          date: values.date,
          startMin: values.startMin,
          durationMin: values.durationMin
        }
      })

      setEditor(null)
      setActionError(null)

      if (!weekDays.includes(values.date)) {
        showWeek(values.date)
      }

      return
    }

    const entry = editor.entry

    if (entry.template === null) {
      await repositories.elements.update({
        itemId: entry.item.id,
        blockId: entry.block.id,
        item: {
          kind: values.kind,
          title: values.title,
          notes: values.notes,
          categoryId: values.categoryId,
          estimateMin: values.estimateMin,
          status: values.status
        },
        block: {
          date: values.date,
          startMin: values.startMin,
          durationMin: values.durationMin
        }
      })

      setEditor(null)
      setActionError(null)

      if (!weekDays.includes(values.date)) {
        showWeek(values.date)
      }

      return
    }

    if (sameOccurrenceValues(entry, values)) {
      setEditor(null)
      return
    }

    const returnToEditor = { anchor: editor.anchor, draft: editor.draft }

    setEditor(null)
    setActionError(null)
    setScopeRequest({ kind: 'edit', entry, values, returnToEditor })
  }

  async function handleEditorDelete(): Promise<void> {
    if (editor === null || editor.mode !== 'edit') return

    const entry = editor.entry

    if (entry.template === null) {
      await repositories.blocks.softDelete(entry.block.id)
      setEditor(null)
      setActionError(null)
      return
    }

    const returnToEditor = { anchor: editor.anchor, draft: editor.draft }

    setEditor(null)
    setActionError(null)
    setScopeRequest({ kind: 'delete', entry, returnToEditor })
  }

  function handleScopeCancel(): void {
    const request = scopeRequest
    setScopeRequest(null)

    if (
      request !== null &&
      (request.kind === 'edit' || request.kind === 'delete') &&
      request.returnToEditor !== undefined
    ) {
      setEditor({
        mode: 'edit',
        entry: request.entry,
        anchor: request.returnToEditor.anchor,
        draft: request.returnToEditor.draft
      })
    }
  }

  async function handleScopeChoose(scope: 'once' | 'all'): Promise<void> {
    const request = scopeRequest

    if (request === null) return

    const entry = request.entry
    const template = entry.template

    if (template === null) {
      setScopeRequest(null)
      return
    }

    const templateId = template.id
    const date = entry.block.date
    const current = occurrenceValuesFromEntry(entry)

    if (request.kind === 'edit') {
      const values = occurrenceValuesFromDraft(request.values)
      const targetDate = request.values.date

      if (scope === 'once') {
        if (targetDate !== date) {
          await repositories.recurrence.moveOccurrenceOnce({
            templateId,
            date,
            targetDate,
            ...values
          })
        } else {
          await repositories.recurrence.editOccurrenceOnce({
            templateId,
            date,
            ...values
          })
        }
      } else {
        await repositories.recurrence.updateOccurrenceEveryWeek({
          templateId,
          date,
          targetDate,
          ...values
        })
      }

      if (!weekDays.includes(targetDate)) {
        showWeek(targetDate)
      }
    } else if (request.kind === 'move') {
      const input = {
        templateId,
        date,
        targetDate: request.target.date,
        ...current,
        startMin: request.target.startMin
      }

      if (scope === 'once') {
        await repositories.recurrence.moveOccurrenceOnce(input)
      } else {
        await repositories.recurrence.moveOccurrenceEveryWeek(input)
      }
    } else if (request.kind === 'resize') {
      if (scope === 'once') {
        await repositories.recurrence.editOccurrenceOnce({
          templateId,
          date,
          ...current,
          durationMin: request.durationMin
        })
      } else {
        await repositories.recurrence.resizeOccurrenceEveryWeek(templateId, date, {
          ...current,
          durationMin: request.durationMin
        })
      }
    } else if (scope === 'once') {
      await repositories.recurrence.deleteOccurrenceOnce(templateId, date)
    } else {
      await repositories.recurrence.deleteOccurrenceEveryWeek(templateId, date)
    }

    setScopeRequest(null)
    setActionError(null)
  }

  return (
    <div className={styles.screen}>
      <WeekTopBar
        weekLabel={formatWeekLabel(weekStart)}
        onPreviousWeek={previousWeek}
        onNextWeek={nextWeek}
        onToday={handleToday}
        onOpenCategories={openCategories}
        onOpenTemplates={openTemplates}
        onLoadDemo={import.meta.env.DEV ? () => void handleLoadDemo() : undefined}
        demoLoading={demoLoading}
      />

      {statusMessage !== null && (
        <p className={styles.banner} role="alert">
          {statusMessage}
        </p>
      )}

      <div className={styles.body}>
        <div className={styles.scrollArea} ref={scrollRef}>
          <div className={styles.stickyHeader}>
            <div className={styles.headerRow}>
              <div className={styles.hourSpacer} />
              {weekDays.map((date) => {
                const isToday = date === today
                const dayNumber = parseLocalDate(date).getDate()

                return (
                  <div
                    className={styles.dayHeader}
                    key={date}
                    aria-current={isToday ? 'date' : undefined}
                  >
                    <span className={styles.weekday}>{formatWeekdayShort(date)}</span>
                    <span className={isToday ? styles.todayNumber : styles.dayNumber}>
                      {dayNumber}
                    </span>
                  </div>
                )
              })}
            </div>

            {hasExamLine && (
              <div className={styles.examRow}>
                <div className={styles.hourSpacer} />
                {weekDays.map((date) => (
                  <div className={styles.examCell} key={date}>
                    {(daysData.get(date)?.exams ?? []).map((entry) => (
                      <button
                        type="button"
                        className={styles.examPill}
                        key={entry.block.id}
                        title={entry.item.title}
                        onClick={(event) =>
                          openEntry(entry, { x: event.clientX, y: event.clientY })
                        }
                      >
                        <span className={styles.examPillDot} aria-hidden="true" />
                        <span className={styles.examPillTitle}>
                          {entry.item.title} · {formatDaysUntil(entry.block.date, today)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.grid}>
            <div className={styles.hourColumn}>
              {Array.from({ length: MINUTES_PER_DAY / 60 }, (_, hour) => (
                <span className={styles.hourLabel} style={{ top: `${hour * 60}px` }} key={hour}>
                  {minutesToTime(hour * 60)}
                </span>
              ))}
            </div>

            <div className={styles.days} ref={daysRef}>
              {weekDays.map((date) => {
                const timedEntries = daysData.get(date)?.timed ?? []
                const dragSession = drag.session
                const dragTarget = drag.preview?.target ?? null
                const freeSlots = dragSession?.freeSlotsByDate.get(date) ?? []

                return (
                  <div
                    className={styles.dayColumn}
                    key={date}
                    title="Cliquer pour ajouter un bloc"
                    onClick={(event) => handleSlotClick(date, event)}
                  >
                    {freeSlots.map((slot) => (
                      <div
                        key={`free-${slot.startMin}`}
                        className={styles.freeSlot}
                        style={{ top: `${slot.startMin}px`, height: `${slot.durationMin}px` }}
                        aria-hidden="true"
                      />
                    ))}

                    {timedEntries.map((entry) => {
                      const blockDragMode =
                        dragSession?.blockId === entry.block.id
                          ? dragSession.kind === 'move' || dragSession.kind === 'resize'
                            ? dragSession.kind
                            : null
                          : null

                      return (
                        <TimeBlock
                          key={entry.block.id}
                          entry={entry}
                          today={today}
                          dragMode={blockDragMode}
                          onOpen={openEntry}
                          onToggleDone={handleToggleDone}
                          onMoveStart={drag.startBlockMove}
                          onResizeStart={drag.startBlockResize}
                        />
                      )
                    })}

                    {dragSession !== null && dragTarget !== null && dragTarget.date === date && (
                      <div
                        className={
                          dragSession.kind === 'resize'
                            ? `${styles.ghost} ${styles.ghostResize}`
                            : styles.ghost
                        }
                        style={{
                          top: `${dragTarget.startMin}px`,
                          height: `${dragTarget.durationMin}px`
                        }}
                        aria-hidden="true"
                      >
                        {dragSession.kind !== 'resize' && dragTarget.durationMin >= 30 && (
                          <span className={styles.ghostTitle}>{dragSession.title}</span>
                        )}
                        <span className={styles.ghostTime}>
                          {minutesToTime(dragTarget.startMin)} –{' '}
                          {minutesToTime(dragTarget.startMin + dragTarget.durationMin)}
                        </span>
                      </div>
                    )}

                    {date === today && (
                      <div
                        className={styles.nowLine}
                        style={{ top: `${nowMinutes}px` }}
                        aria-hidden="true"
                      >
                        <span className={styles.nowDot} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <InboxPanel
          onTaskDragStart={drag.startTaskDrag}
          dropActive={drag.preview?.overInbox === true && drag.session?.kind === 'move'}
        />
      </div>

      {drag.session !== null && drag.session.kind === 'create' && (
        <div
          className={styles.floatingCard}
          data-drag-card
          style={
            drag.session.categoryColor === null
              ? undefined
              : categoryColorStyle(drag.session.categoryColor)
          }
          aria-hidden="true"
        >
          <span className={styles.floatingCardTitle}>{drag.session.title}</span>
          <span className={styles.floatingCardDuration}>
            {formatDurationMinutes(drag.session.durationMin)}
          </span>
        </div>
      )}

      {editor !== null && data !== null && (
        <ElementEditor
          key={
            editor.mode === 'edit'
              ? editor.entry.block.id
              : `${editor.draft.date}-${editor.draft.time}`
          }
          mode={editor.mode}
          initialDraft={editor.draft}
          anchor={editor.anchor}
          categories={data.categories}
          categoryGroups={data.categoryGroups}
          recurring={editor.mode === 'edit' && editor.entry.template !== null}
          onClose={() => setEditor(null)}
          onSubmit={handleEditorSubmit}
          onDelete={editor.mode === 'edit' ? handleEditorDelete : undefined}
        />
      )}

      {scopeRequest !== null && (
        <RecurrenceScopeDialog
          title={
            scopeRequest.kind === 'delete'
              ? 'Supprimer ce bloc récurrent ?'
              : 'Ce bloc fait partie de la semaine type'
          }
          subject={describeScopeEntry(scopeRequest.entry)}
          onChoose={handleScopeChoose}
          onCancel={handleScopeCancel}
        />
      )}
    </div>
  )
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

function sameOccurrenceValues(entry: WeekEntry, values: ElementDraftValues): boolean {
  return (
    values.kind === entry.item.kind &&
    values.title === entry.item.title &&
    values.categoryId === entry.item.categoryId &&
    values.date === entry.block.date &&
    values.startMin === entry.block.startMin &&
    values.durationMin === entry.block.durationMin
  )
}

function occurrenceValuesFromEntry(entry: WeekEntry): OccurrenceFormValues {
  if (entry.block.startMin === null) {
    throw new RangeError('Une occurrence de semaine type doit avoir une heure.')
  }

  return {
    kind: entry.item.kind === 'free' ? 'free' : 'fixed',
    title: entry.item.title,
    categoryId: entry.item.categoryId,
    startMin: entry.block.startMin,
    durationMin: entry.block.durationMin
  }
}

function occurrenceValuesFromDraft(values: ElementDraftValues): OccurrenceFormValues {
  if (values.startMin === null || (values.kind !== 'fixed' && values.kind !== 'free')) {
    throw new RangeError('Un bloc de semaine type est soit fixe, soit libre, avec une heure.')
  }

  return {
    kind: values.kind,
    title: values.title,
    categoryId: values.categoryId,
    startMin: values.startMin,
    durationMin: values.durationMin
  }
}

function describeScopeEntry(entry: WeekEntry): string {
  const startMin = entry.block.startMin ?? 0
  const endMin = Math.min(MINUTES_PER_DAY, startMin + entry.block.durationMin)

  return `« ${entry.item.title} » · ${formatLongDate(entry.block.date)}, ${minutesToTime(
    startMin
  )} – ${minutesToTime(endMin)}`
}

function virtualEntry(
  occurrence: TemplateOccurrence,
  template: Template,
  categoriesById: ReadonlyMap<string, Category>
): WeekEntry {
  const item: Item = {
    id: occurrence.id,
    kind: occurrence.kind,
    title: occurrence.title,
    notes: '',
    categoryId: occurrence.categoryId,
    estimateMin: null,
    status: null,
    templateId: template.id,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    deletedAt: null
  }
  const block: Block = {
    id: occurrence.id,
    itemId: occurrence.id,
    date: occurrence.date,
    startMin: occurrence.startMin,
    durationMin: occurrence.durationMin,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    deletedAt: null
  }

  return {
    block,
    item,
    category:
      occurrence.categoryId === null ? null : (categoriesById.get(occurrence.categoryId) ?? null),
    template
  }
}

function buildWeekData(
  weekStart: LocalDate,
  days: readonly LocalDate[],
  blocks: readonly Block[],
  items: readonly Item[],
  categories: readonly Category[],
  categoryGroups: readonly CategoryGroup[],
  templates: readonly Template[],
  overrides: readonly Override[]
): WeekData {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const templatesById = new Map(templates.map((template) => [template.id, template]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const lastDay = days.at(-1) ?? weekStart
  const occurrences = computeOccurrences(templates, overrides, { start: weekStart, end: lastDay })

  return {
    weekStart,
    categories: [...categories],
    categoryGroups: [...categoryGroups],
    days: days.map((date) => {
      const entries: WeekEntry[] = []

      for (const block of blocks) {
        if (block.date !== date) continue

        const item = itemsById.get(block.itemId)

        if (item === undefined) continue

        entries.push({
          block,
          item,
          category: item.categoryId === null ? null : (categoriesById.get(item.categoryId) ?? null),
          template: null
        })
      }

      for (const occurrence of occurrences) {
        if (occurrence.date !== date) continue

        const template = templatesById.get(occurrence.templateId)

        if (template === undefined) continue

        entries.push(virtualEntry(occurrence, template, categoriesById))
      }

      const exams = entries
        .filter((entry) => entry.item.kind === 'exam' && entry.block.startMin === null)
        .sort((a, b) => a.item.title.localeCompare(b.item.title, 'fr'))
      const timedEntries = entries.filter(
        (entry) => entry.block.startMin !== null && entry.block.durationMin > 0
      )
      const entriesByBlockId = new Map(timedEntries.map((entry) => [entry.block.id, entry]))
      const timed: PlacedEntry[] = layoutBlocks(timedEntries.map((entry) => entry.block)).flatMap(
        (placement) => {
          const entry = entriesByBlockId.get(placement.block.id)
          return entry === undefined ? [] : [{ ...entry, placement }]
        }
      )

      return { date, timed, exams }
    })
  }
}
