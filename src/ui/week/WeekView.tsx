import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
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
import type { Block, Category, Item, LocalDate } from '../../core/types'
import { loadDemoWeek } from '../../db/demoWeek'
import { repositories } from '../../db/repositories'
import { useUiStore } from '../../state/ui'
import { TimeBlock } from './TimeBlock'
import { WeekTopBar } from './WeekTopBar'
import type { PlacedEntry, WeekData, WeekDayData, WeekEntry } from './weekTypes'
import styles from './WeekView.module.css'

const INITIAL_SCROLL_LEAD_MIN = 30

export function WeekView(): React.JSX.Element {
  const weekStart = useUiStore((state) => state.weekStart)
  const previousWeek = useUiStore((state) => state.previousWeek)
  const nextWeek = useUiStore((state) => state.nextWeek)
  const goToToday = useUiStore((state) => state.goToToday)
  const showWeek = useUiStore((state) => state.showWeek)
  const openCategories = useUiStore((state) => state.openCategories)

  const [snapshot, setSnapshot] = useState<WeekData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
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
      : null

  useEffect(() => {
    const days = getWeekDays(weekStart)
    const weekEnd = getWeekEnd(weekStart)

    const subscription = liveQuery(async () => {
      const [blocks, items, categories] = await Promise.all([
        repositories.blocks.listBetween(weekStart, weekEnd),
        repositories.items.list(),
        repositories.categories.list()
      ])

      return buildWeekData(weekStart, days, blocks, items, categories)
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
                    <span className={styles.examPill} key={entry.block.id} title={entry.item.title}>
                      <span className={styles.examPillDot} aria-hidden="true" />
                      <span className={styles.examPillTitle}>
                        {entry.item.title} · {formatDaysUntil(entry.block.date, today)}
                      </span>
                    </span>
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
              <div className={styles.dayColumn} key={date}>
                {(daysData.get(date)?.timed ?? []).map((entry) => (
                  <TimeBlock key={entry.block.id} entry={entry} today={today} />
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
    </div>
  )
}

function buildWeekData(
  weekStart: LocalDate,
  days: readonly LocalDate[],
  blocks: readonly Block[],
  items: readonly Item[],
  categories: readonly Category[]
): WeekData {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  return {
    weekStart,
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
