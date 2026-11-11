import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  createNewElementDraft,
  elementDraftFrom,
  snapNewBlockStart,
  type ElementDraft,
  type ElementDraftValues
} from '../../core/elementEditor'
import { layoutBlocks } from '../../core/schedule'
import {
  MINUTES_PER_DAY,
  formatDaysUntil,
  formatWeekdayShort,
  formatWeekLabel,
  getWeekDays,
  getWeekEnd,
  minutesToTime,
  parseLocalDate,
  todayLocalDate
} from '../../core/time'
import type { Block, Category, CategoryGroup, Item, LocalDate } from '../../core/types'
import { loadDemoWeek } from '../../db/demoWeek'
import { repositories } from '../../db/repositories'
import { useUiStore } from '../../state/ui'
import { ElementEditor } from './ElementEditor'
import { TimeBlock } from './TimeBlock'
import { WeekTopBar } from './WeekTopBar'
import type { FloatingAnchor, PlacedEntry, WeekData, WeekDayData, WeekEntry } from './weekTypes'
import styles from './WeekView.module.css'

const INITIAL_SCROLL_LEAD_MIN = 30
const OTHER_DAY_START_MIN = 8 * 60

type ElementEditorSession =
  | { mode: 'create'; anchor: FloatingAnchor; draft: ElementDraft }
  | {
      mode: 'edit'
      itemId: string
      blockId: string
      anchor: FloatingAnchor
      draft: ElementDraft
    }

export function WeekView(): React.JSX.Element {
  const weekStart = useUiStore((state) => state.weekStart)
  const previousWeek = useUiStore((state) => state.previousWeek)
  const nextWeek = useUiStore((state) => state.nextWeek)
  const goToToday = useUiStore((state) => state.goToToday)
  const showWeek = useUiStore((state) => state.showWeek)
  const openCategories = useUiStore((state) => state.openCategories)

  const [snapshot, setSnapshot] = useState<WeekData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
  const [editor, setEditor] = useState<ElementEditorSession | null>(null)
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
      const [blocks, items, categories, categoryGroups] = await Promise.all([
        repositories.blocks.listBetween(weekStart, weekEnd),
        repositories.items.list(),
        repositories.categories.list(),
        repositories.categoryGroups.list()
      ])

      return buildWeekData(weekStart, days, blocks, items, categories, categoryGroups)
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
      if (editor !== null || isTextEntryTarget(event.target)) return

      event.preventDefault()
      openNewTask()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editor, openNewTask])

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

  function openEntry(entry: WeekEntry, anchor: FloatingAnchor): void {
    setActionError(null)
    setEditor({
      mode: 'edit',
      itemId: entry.item.id,
      blockId: entry.block.id,
      anchor,
      draft: elementDraftFrom(entry.item, entry.block)
    })
  }

  function handleSlotClick(date: LocalDate, event: React.MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return

    const rect = event.currentTarget.getBoundingClientRect()
    const startMin = snapNewBlockStart(event.clientY - rect.top)

    setActionError(null)
    setEditor({
      mode: 'create',
      anchor: { x: event.clientX, y: event.clientY },
      draft: createNewElementDraft({ date, startMin })
    })
  }

  async function handleToggleDone(entry: PlacedEntry, done: boolean): Promise<void> {
    setActionError(null)

    try {
      await repositories.items.setTaskStatus(entry.item.id, done ? 'done' : 'todo')
    } catch {
      setActionError('Le statut de la tâche n’a pas pu être mis à jour.')
    }
  }

  async function handleEditorSubmit(values: ElementDraftValues): Promise<void> {
    if (editor === null) return

    const item = {
      kind: values.kind,
      title: values.title,
      notes: values.notes,
      categoryId: values.categoryId,
      estimateMin: values.estimateMin,
      status: values.status
    }
    const block = {
      date: values.date,
      startMin: values.startMin,
      durationMin: values.durationMin
    }

    if (editor.mode === 'create') {
      await repositories.elements.create({ item, block })
    } else {
      await repositories.elements.update({
        itemId: editor.itemId,
        blockId: editor.blockId,
        item,
        block
      })
    }

    setEditor(null)
    setActionError(null)

    if (!weekDays.includes(values.date)) {
      showWeek(values.date)
    }
  }

  async function handleEditorDelete(): Promise<void> {
    if (editor === null || editor.mode !== 'edit') return

    await repositories.blocks.softDelete(editor.blockId)
    setEditor(null)
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
        onLoadDemo={import.meta.env.DEV ? () => void handleLoadDemo() : undefined}
        demoLoading={demoLoading}
      />

      {statusMessage !== null && (
        <p className={styles.banner} role="alert">
          {statusMessage}
        </p>
      )}

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
                      onClick={(event) => openEntry(entry, { x: event.clientX, y: event.clientY })}
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

          <div className={styles.days}>
            {weekDays.map((date) => (
              <div
                className={styles.dayColumn}
                key={date}
                title="Cliquer pour ajouter un bloc"
                onClick={(event) => handleSlotClick(date, event)}
              >
                {(daysData.get(date)?.timed ?? []).map((entry) => (
                  <TimeBlock
                    key={entry.block.id}
                    entry={entry}
                    today={today}
                    onOpen={openEntry}
                    onToggleDone={(placedEntry, done) => void handleToggleDone(placedEntry, done)}
                  />
                ))}

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
            ))}
          </div>
        </div>
      </div>

      {editor !== null && data !== null && (
        <ElementEditor
          key={
            editor.mode === 'edit' ? editor.blockId : `${editor.draft.date}-${editor.draft.time}`
          }
          mode={editor.mode}
          initialDraft={editor.draft}
          anchor={editor.anchor}
          categories={data.categories}
          categoryGroups={data.categoryGroups}
          onClose={() => setEditor(null)}
          onSubmit={handleEditorSubmit}
          onDelete={editor.mode === 'edit' ? handleEditorDelete : undefined}
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

function buildWeekData(
  weekStart: LocalDate,
  days: readonly LocalDate[],
  blocks: readonly Block[],
  items: readonly Item[],
  categories: readonly Category[],
  categoryGroups: readonly CategoryGroup[]
): WeekData {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))

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
          category: item.categoryId === null ? null : (categoriesById.get(item.categoryId) ?? null)
        })
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
