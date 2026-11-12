import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  createNewElementDraft,
  elementDraftFrom,
  snapNewBlockStart,
  type ElementDraft,
  type ElementDraftValues
} from '../../core/elementEditor'
import {
  fallbackItemType,
  firstNonTaskType,
  firstTaskType,
  firstTopLineType,
  sortActiveItemTypes
} from '../../core/itemTypes'
import {
  computeOccurrences,
  getRecurrenceKind,
  type TemplateOccurrence
} from '../../core/recurrence'
import { blockOccursOn, layoutBlocks, layoutTopLineBands } from '../../core/schedule'
import {
  MINUTES_PER_DAY,
  formatDayLabel,
  formatDurationMinutes,
  formatLongDate,
  formatWeekdayShort,
  formatWeekLabel,
  getWeekDays,
  minutesToTime,
  parseLocalDate,
  todayLocalDate
} from '../../core/time'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  ItemType,
  LocalDate,
  Override,
  Template
} from '../../core/types'
import { loadDemoWeek } from '../../db/demoWeek'
import type { UndoAction } from '../../db/history'
import { repositories } from '../../db/repositories'
import type { DeletedTaskResult } from '../../db/repositories/planning'
import { usePreferencesStore } from '../../state/preferences'
import { useUiStore, type CalendarViewMode, type CreationKind } from '../../state/ui'
import { categoryColorStyle } from '../categoryColorStyle'
import { ElementEditor } from './ElementEditor'
import { InboxPanel } from './InboxPanel'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { TimeBlock } from './TimeBlock'
import { CalendarTopBar } from './CalendarTopBar'
import { TopLineBands } from './TopLineBands'
import { useScheduleDrag } from './useScheduleDrag'
import type {
  FloatingAnchor,
  PlacedEntry,
  ScheduleData,
  ScheduleDayData,
  ScheduleEntry,
  TopLineBandEntry
} from './scheduleTypes'
import styles from './CalendarView.module.css'

const INITIAL_SCROLL_LEAD_MIN = 30
const OTHER_DAY_START_MIN = 8 * 60

type ElementEditorSession =
  | { mode: 'create'; anchor: FloatingAnchor; draft: ElementDraft }
  | {
      mode: 'edit'
      entry: ScheduleEntry
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
      entry: ScheduleEntry
      values: ElementDraftValues
      returnToEditor: ReturnToEditor
    }
  | { kind: 'move'; entry: ScheduleEntry; target: { date: LocalDate; startMin: number } }
  | { kind: 'resize'; entry: ScheduleEntry; durationMin: number }
  | { kind: 'delete'; entry: ScheduleEntry; returnToEditor?: ReturnToEditor }

/** Valeurs d'une occurrence virtuelle, telles que les repositories les attendent. */
interface OccurrenceFormValues {
  typeId: string
  title: string
  categoryId: string | null
  startMin: number
  durationMin: number
}

interface DeletedTaskToast {
  id: string
  message: string
  action: UndoAction
}

interface CalendarViewProps {
  mode: CalendarViewMode
}

export function CalendarView({ mode }: CalendarViewProps): React.JSX.Element {
  const weekStart = useUiStore((state) => state.weekStart)
  const selectedDate = useUiStore((state) => state.selectedDate)
  const previousPeriod = useUiStore((state) => state.previousPeriod)
  const nextPeriod = useUiStore((state) => state.nextPeriod)
  const goToToday = useUiStore((state) => state.goToToday)
  const showCalendar = useUiStore((state) => state.showCalendar)
  const setView = useUiStore((state) => state.setView)
  const openCategories = useUiStore((state) => state.openCategories)
  const openTypes = useUiStore((state) => state.openTypes)
  const openTemplates = useUiStore((state) => state.openTemplates)
  const openSettings = useUiStore((state) => state.openSettings)
  const openPalette = useUiStore((state) => state.openPalette)
  const paletteOpen = useUiStore((state) => state.paletteOpen)
  const creationRequest = useUiStore((state) => state.creationRequest)
  const consumeCreation = useUiStore((state) => state.consumeCreation)
  const preferences = usePreferencesStore((state) => state.preferences)

  const [snapshot, setSnapshot] = useState<ScheduleData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [editor, setEditor] = useState<ElementEditorSession | null>(null)
  const [scopeRequest, setScopeRequest] = useState<RecurrenceScopeRequest | null>(null)
  const [deletedTaskToast, setDeletedTaskToast] = useState<DeletedTaskToast | null>(null)
  const [bandGestureActive, setBandGestureActive] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const scrollRef = useRef<HTMLDivElement>(null)

  const days = useMemo(
    () => (mode === 'day' ? [selectedDate] : getWeekDays(weekStart, preferences.weekStartsOn)),
    [mode, preferences.weekStartsOn, selectedDate, weekStart]
  )
  const rangeStart = days[0]
  const rangeEnd = days[days.length - 1]
  const data =
    snapshot?.rangeStart === rangeStart && snapshot?.rangeEnd === rangeEnd ? snapshot : null
  const daysData = useMemo(() => {
    const byDate = new Map<LocalDate, ScheduleDayData>()

    for (const day of data?.days ?? []) {
      byDate.set(day.date, day)
    }

    return byDate
  }, [data])
  const itemTypes = useMemo(() => data?.itemTypes ?? [], [data])
  const daysRef = useRef<HTMLDivElement>(null)
  const drag = useScheduleDrag({
    scrollRef,
    daysRef,
    days,
    daysData,
    snapStepMin: preferences.dragStepMin,
    defaultTaskDurationMin: preferences.defaultTaskDurationMin,
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
  const topLineType = useMemo(() => firstTopLineType(itemTypes), [itemTypes])
  const hasTopLineRow = topLineType !== null || (data?.topLineBands.length ?? 0) > 0
  const statusMessage = loadError
    ? 'La période n’a pas pu être chargée.'
    : demoError !== null
      ? demoError
      : actionError

  useEffect(() => {
    const start = days[0]
    const end = days[days.length - 1]

    const subscription = liveQuery(async () => {
      const [blocks, items, itemTypes, categories, categoryGroups, templates, overrides] =
        await Promise.all([
          repositories.blocks.listOverlapping(start, end),
          repositories.items.list(),
          repositories.itemTypes.list(),
          repositories.categories.list(),
          repositories.categoryGroups.list(),
          repositories.templates.list(),
          repositories.overrides.list()
        ])

      return buildScheduleData(
        days,
        blocks,
        items,
        itemTypes,
        categories,
        categoryGroups,
        templates,
        overrides
      )
    }).subscribe({
      next: (scheduleData) => {
        setSnapshot(scheduleData)
        setLoadError(false)
      },
      error: () => setLoadError(true)
    })

    return () => subscription.unsubscribe()
  }, [days])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useLayoutEffect(() => {
    const container = scrollRef.current

    if (container === null) return

    const reference = new Date()
    const currentMinutes = reference.getHours() * 60 + reference.getMinutes()
    const containsToday = days.includes(todayLocalDate(reference))
    const targetMin = containsToday
      ? Math.max(0, currentMinutes - 120)
      : 7 * 60 - INITIAL_SCROLL_LEAD_MIN

    container.scrollTop = targetMin
  }, [days])

  const openNewElement = useCallback(
    (kind: CreationKind): void => {
      const activeTypes = sortActiveItemTypes(itemTypes)
      const type =
        kind === 'task'
          ? firstTaskType(activeTypes)
          : (firstNonTaskType(activeTypes) ?? firstTaskType(activeTypes) ?? activeTypes[0] ?? null)

      if (type === null) {
        setActionError('Créez d’abord un type d’élément dans l’écran Types.')
        return
      }

      const reference = new Date()
      const referenceDate = todayLocalDate(reference)
      const date = days.includes(referenceDate) ? referenceDate : days[0]
      const referenceMinutes = reference.getHours() * 60 + reference.getMinutes()
      const startMin =
        date === referenceDate
          ? snapNewBlockStart(
              referenceMinutes,
              preferences.defaultTaskDurationMin,
              preferences.dragStepMin
            )
          : OTHER_DAY_START_MIN

      setActionError(null)
      setScopeRequest(null)
      setEditor({
        mode: 'create',
        anchor: { x: Math.max(12, window.innerWidth / 2 - 174), y: 96 },
        draft: createNewElementDraft(
          { date, startMin, type },
          { taskDurationMin: preferences.defaultTaskDurationMin }
        )
      })
    },
    [days, itemTypes, preferences.defaultTaskDurationMin, preferences.dragStepMin]
  )

  const openTopLineCreate = useCallback(
    (date: LocalDate, endDate: LocalDate | null, anchor: FloatingAnchor): void => {
      const type = firstTopLineType(itemTypes)

      if (type === null) {
        setActionError('Créez d’abord un type placé sur la ligne du haut.')
        return
      }

      setActionError(null)
      setScopeRequest(null)
      setEditor({
        mode: 'create',
        anchor,
        draft: createNewElementDraft(
          { date, startMin: 0, type, endDate },
          { taskDurationMin: preferences.defaultTaskDurationMin }
        )
      })
    },
    [itemTypes, preferences.defaultTaskDurationMin]
  )

  const handleToday = useCallback((): void => {
    const reference = new Date()
    const container = scrollRef.current

    goToToday()
    setNow(reference)

    if (container !== null) {
      container.scrollTop = Math.max(0, reference.getHours() * 60 + reference.getMinutes() - 120)
    }
  }, [goToToday])

  useEffect(() => {
    if (creationRequest === null) return

    const frame = window.requestAnimationFrame(() => {
      consumeCreation(creationRequest.id)
      openNewElement(creationRequest.kind)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [consumeCreation, creationRequest, openNewElement])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (
        paletteOpen ||
        editor !== null ||
        scopeRequest !== null ||
        drag.session !== null ||
        bandGestureActive
      ) {
        return
      }
      if (isTextEntryTarget(event.target)) return

      switch (event.key) {
        case 'n':
        case 'N':
          if (event.shiftKey) return
          event.preventDefault()
          openNewElement('task')
          break
        case 'e':
        case 'E':
          if (event.shiftKey) return
          event.preventDefault()
          openNewElement('fixed')
          break
        case 't':
        case 'T':
          if (event.shiftKey) return
          event.preventDefault()
          handleToday()
          break
        case 'ArrowLeft':
          if (event.shiftKey) return
          event.preventDefault()
          previousPeriod()
          break
        case 'ArrowRight':
          if (event.shiftKey) return
          event.preventDefault()
          nextPeriod()
          break
        case '1':
          // Sur un clavier AZERTY, « 1 » s'obtient avec Maj.
          event.preventDefault()
          setView('day')
          break
        case '2':
          event.preventDefault()
          setView('week')
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    bandGestureActive,
    drag.session,
    editor,
    handleToday,
    nextPeriod,
    openNewElement,
    paletteOpen,
    previousPeriod,
    scopeRequest,
    setView
  ])

  async function handleLoadDemo(): Promise<void> {
    if (demoLoading) return

    setDemoLoading(true)
    setDemoError(null)

    try {
      const result = await loadDemoWeek(repositories)
      showCalendar(result.weekStart)
    } catch {
      setDemoError('Les données de démonstration n’ont pas pu être chargées.')
    } finally {
      setDemoLoading(false)
    }
  }

  const openEntry = useCallback((entry: ScheduleEntry, anchor: FloatingAnchor): void => {
    setActionError(null)
    setEditor({
      mode: 'edit',
      entry,
      anchor,
      draft: elementDraftFrom(entry.item, entry.block, entry.type)
    })
  }, [])

  function handleSlotClick(date: LocalDate, event: React.MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0 || drag.session !== null) return

    const type = firstTaskType(itemTypes)

    if (type === null) {
      setActionError('Créez d’abord un type d’élément dans l’écran Types.')
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const startMin = snapNewBlockStart(
      event.clientY - rect.top,
      preferences.defaultTaskDurationMin,
      preferences.dragStepMin
    )

    setActionError(null)
    setEditor({
      mode: 'create',
      anchor: { x: event.clientX, y: event.clientY },
      draft: createNewElementDraft(
        { date, startMin, type },
        { taskDurationMin: preferences.defaultTaskDurationMin }
      )
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

  const handleBandMove = useCallback(
    async (entry: ScheduleEntry, date: LocalDate, endDate: LocalDate | null): Promise<void> => {
      setActionError(null)

      try {
        await repositories.planning.moveBlockRange({ blockId: entry.block.id, date, endDate })
      } catch {
        setActionError('L’élément n’a pas pu être déplacé.')
      }
    },
    []
  )

  const handleBandResize = useCallback(
    async (entry: ScheduleEntry, date: LocalDate, endDate: LocalDate | null): Promise<void> => {
      setActionError(null)

      try {
        await repositories.planning.resizeBlockRange({ blockId: entry.block.id, date, endDate })
      } catch {
        setActionError('La période n’a pas pu être modifiée.')
      }
    },
    []
  )

  const handleUndo = useCallback(async (target?: UndoAction): Promise<void> => {
    try {
      const action = await repositories.history.undo(target)

      if (action !== null) {
        setActionError(null)
        setDeletedTaskToast((current) =>
          current !== null && current.action === action ? null : current
        )
      }
    } catch {
      setActionError('La dernière action n’a pas pu être annulée.')
    }
  }, [])

  const handleTaskDeleted = useCallback((result: DeletedTaskResult): void => {
    setActionError(null)
    setDeletedTaskToast({
      id: crypto.randomUUID(),
      message: deletedTaskMessage(result.blockCount),
      action: result.action
    })
  }, [])

  useEffect(() => {
    if (deletedTaskToast === null) return

    const timer = window.setTimeout(() => setDeletedTaskToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [deletedTaskToast])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z'

      if (!isUndo) return
      if (
        isTextEntryTarget(event.target) ||
        editor !== null ||
        drag.session !== null ||
        scopeRequest !== null ||
        paletteOpen ||
        bandGestureActive
      ) {
        return
      }

      event.preventDefault()
      void handleUndo()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [bandGestureActive, drag.session, editor, handleUndo, paletteOpen, scopeRequest])

  async function handleEditorSubmit(values: ElementDraftValues): Promise<void> {
    if (editor === null) return

    if (editor.mode === 'create') {
      await repositories.elements.create({
        item: {
          typeId: values.typeId,
          title: values.title,
          notes: values.notes,
          categoryId: values.categoryId,
          estimateMin: values.estimateMin,
          status: values.status
        },
        block: {
          date: values.date,
          startMin: values.startMin,
          durationMin: values.durationMin,
          endDate: values.endDate
        }
      })

      setEditor(null)
      setActionError(null)

      if (!days.includes(values.date)) {
        showCalendar(values.date)
      }

      return
    }

    const entry = editor.entry

    if (entry.template === null) {
      await repositories.elements.update({
        itemId: entry.item.id,
        blockId: entry.block.id,
        item: {
          typeId: values.typeId,
          title: values.title,
          notes: values.notes,
          categoryId: values.categoryId,
          estimateMin: values.estimateMin,
          status: values.status
        },
        block: {
          date: values.date,
          startMin: values.startMin,
          durationMin: values.durationMin,
          endDate: values.endDate
        }
      })

      setEditor(null)
      setActionError(null)

      if (!days.includes(values.date)) {
        showCalendar(values.date)
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
      const values = occurrenceValuesFromDraft(request.values, template.startMin)
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

      if (!days.includes(targetDate)) {
        showCalendar(targetDate)
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
      <CalendarTopBar
        viewMode={mode}
        title={
          mode === 'day'
            ? formatDayLabel(days[0])
            : formatWeekLabel(weekStart, preferences.weekStartsOn)
        }
        onPrevious={previousPeriod}
        onNext={nextPeriod}
        onToday={handleToday}
        onChangeView={setView}
        onOpenPalette={openPalette}
        onOpenCategories={openCategories}
        onOpenTypes={openTypes}
        onOpenTemplates={openTemplates}
        onOpenSettings={openSettings}
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
              {days.map((date) => {
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

            {hasTopLineRow && data !== null && (
              <div className={styles.topLineRow}>
                <div className={styles.hourSpacer} />
                <TopLineBands
                  key={`${rangeStart}-${rangeEnd}`}
                  days={days}
                  bands={data.topLineBands}
                  rowCount={data.topLineRowCount}
                  maxRows={mode === 'day' ? Number.POSITIVE_INFINITY : undefined}
                  today={today}
                  onCreate={openTopLineCreate}
                  onOpen={openEntry}
                  onMove={handleBandMove}
                  onResize={handleBandResize}
                  onGestureActiveChange={setBandGestureActive}
                />
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
              {days.map((date) => {
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
          onTaskDeleted={handleTaskDeleted}
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
          itemTypes={data.itemTypes}
          snapStepMin={preferences.dragStepMin}
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
          recurrence={
            getRecurrenceKind(scopeRequest.entry.template?.rrule ?? '') === 'yearly'
              ? 'yearly'
              : 'weekly'
          }
          onChoose={handleScopeChoose}
          onCancel={handleScopeCancel}
        />
      )}

      {deletedTaskToast !== null && (
        <div
          key={deletedTaskToast.id}
          className={styles.undoToast}
          role="status"
          aria-live="polite"
        >
          <span className={styles.undoToastMessage}>{deletedTaskToast.message}</span>
          <button
            type="button"
            className={styles.undoToastButton}
            onClick={() => void handleUndo(deletedTaskToast.action)}
          >
            Annuler
          </button>
        </div>
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

function deletedTaskMessage(blockCount: number): string {
  if (blockCount === 0) return 'Tâche supprimée'

  return `Tâche et ${blockCount} ${blockCount === 1 ? 'bloc' : 'blocs'} supprimés`
}

function sameOccurrenceValues(entry: ScheduleEntry, values: ElementDraftValues): boolean {
  return (
    values.typeId === entry.item.typeId &&
    values.title === entry.item.title &&
    values.categoryId === entry.item.categoryId &&
    values.date === entry.block.date &&
    values.startMin === entry.block.startMin &&
    values.durationMin === entry.block.durationMin &&
    (values.endDate ?? null) === (entry.block.endDate ?? null)
  )
}

function occurrenceValuesFromEntry(entry: ScheduleEntry): OccurrenceFormValues {
  return {
    typeId: entry.item.typeId,
    title: entry.item.title,
    categoryId: entry.item.categoryId,
    startMin: entry.block.startMin ?? entry.template?.startMin ?? 8 * 60,
    durationMin: entry.block.durationMin
  }
}

function occurrenceValuesFromDraft(
  values: ElementDraftValues,
  fallbackStartMin: number
): OccurrenceFormValues {
  return {
    typeId: values.typeId,
    title: values.title,
    categoryId: values.categoryId,
    startMin: values.startMin ?? fallbackStartMin,
    durationMin: values.durationMin
  }
}

function describeScopeEntry(entry: ScheduleEntry): string {
  const date = formatLongDate(entry.block.date)

  if (entry.block.startMin === null) {
    return `« ${entry.item.title} » · ${date}, journée entière`
  }

  const endMin = Math.min(MINUTES_PER_DAY, entry.block.startMin + entry.block.durationMin)

  return `« ${entry.item.title} » · ${date}, ${minutesToTime(
    entry.block.startMin
  )} – ${minutesToTime(endMin)}`
}

function virtualEntry(
  occurrence: TemplateOccurrence,
  template: Template,
  categoriesById: ReadonlyMap<string, Category>,
  typesById: ReadonlyMap<string, ItemType>
): ScheduleEntry {
  const type = typesById.get(occurrence.typeId) ?? fallbackItemType(occurrence.typeId)
  const item: Item = {
    id: occurrence.id,
    typeId: occurrence.typeId,
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
    startMin: type.placement === 'topLine' ? null : occurrence.startMin,
    durationMin: occurrence.durationMin,
    endDate: null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    deletedAt: null
  }

  return {
    block,
    item,
    type,
    category:
      occurrence.categoryId === null ? null : (categoriesById.get(occurrence.categoryId) ?? null),
    template
  }
}

function buildScheduleData(
  days: readonly LocalDate[],
  blocks: readonly Block[],
  items: readonly Item[],
  itemTypes: readonly ItemType[],
  categories: readonly Category[],
  categoryGroups: readonly CategoryGroup[],
  templates: readonly Template[],
  overrides: readonly Override[]
): ScheduleData {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const templatesById = new Map(templates.map((template) => [template.id, template]))
  const typesById = new Map(itemTypes.map((type) => [type.id, type]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const rangeStart = days[0]
  const rangeEnd = days.at(-1) ?? rangeStart
  const occurrences = computeOccurrences(templates, overrides, { start: rangeStart, end: rangeEnd })
  const dayData: ScheduleDayData[] = days.map((date) => {
    const entries: ScheduleEntry[] = []

    for (const block of blocks) {
      // Un bloc horaire n'existe que le jour de sa date. Un élément sans heure
      // peut couvrir plusieurs jours et doit apparaître dans chacun d'eux.
      const occurs = block.startMin === null ? blockOccursOn(block, date) : block.date === date

      if (!occurs) continue

      const item = itemsById.get(block.itemId)

      if (item === undefined) continue

      entries.push({
        block,
        item,
        type: typesById.get(item.typeId) ?? fallbackItemType(item.typeId),
        category: item.categoryId === null ? null : (categoriesById.get(item.categoryId) ?? null),
        template: null
      })
    }

    for (const occurrence of occurrences) {
      if (occurrence.date !== date) continue

      const template = templatesById.get(occurrence.templateId)

      if (template === undefined) continue

      entries.push(virtualEntry(occurrence, template, categoriesById, typesById))
    }

    const topLine = entries
      .filter((entry) => entry.block.startMin === null)
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

    return { date, timed, topLine }
  })

  const bandEntriesById = new Map<string, TopLineBandEntry>()

  for (const day of dayData) {
    for (const entry of day.topLine) {
      if (bandEntriesById.has(entry.block.id)) continue

      bandEntriesById.set(entry.block.id, {
        ...entry,
        id: entry.block.id,
        date: entry.block.date,
        endDate: entry.block.endDate
      })
    }
  }

  const topLineLayout = layoutTopLineBands([...bandEntriesById.values()], days)

  return {
    rangeStart,
    rangeEnd,
    itemTypes: [...itemTypes],
    categories: [...categories],
    categoryGroups: [...categoryGroups],
    days: dayData,
    topLineBands: topLineLayout.bands,
    topLineRowCount: topLineLayout.rowCount
  }
}
