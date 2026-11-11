import type { CSSProperties } from 'react'
import { getBlockContentMode, showsBlockCategory } from '../../core/schedule'
import { MINUTES_PER_DAY, formatDaysUntil, minutesToTime } from '../../core/time'
import type { LocalDate } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import type { FloatingAnchor, PlacedEntry } from './weekTypes'
import styles from './TimeBlock.module.css'

interface TimeBlockProps {
  entry: PlacedEntry
  today: LocalDate
  onOpen: (entry: PlacedEntry, anchor: FloatingAnchor) => void
  onToggleDone: (entry: PlacedEntry, done: boolean) => void
}

export function TimeBlock({
  entry,
  today,
  onOpen,
  onToggleDone
}: TimeBlockProps): React.JSX.Element | null {
  const { block, item, category, placement } = entry

  if (placement.startMin >= MINUTES_PER_DAY) return null

  const startMin = Math.max(0, placement.startMin)
  const endMin = Math.min(MINUTES_PER_DAY, placement.endMin)
  const visibleDurationMin = Math.max(1, endMin - startMin)
  const mode = getBlockContentMode(visibleDurationMin)
  const isExam = item.kind === 'exam'
  const isTask = item.kind === 'task'
  const isCompact = visibleDurationMin < 30
  const showCategory =
    showsBlockCategory(visibleDurationMin) && item.kind === 'task' && category !== null
  const isDone = item.status === 'done'

  const classNames = [
    styles.block,
    styles[item.kind],
    isCompact ? styles.compact : '',
    isDone ? styles.done : ''
  ]
    .filter((className) => className !== '')
    .join(' ')

  const style: CSSProperties = {
    top: `${startMin}px`,
    height: `${visibleDurationMin}px`,
    left: `calc(${placement.leftRatio * 100}% + 1px)`,
    width: `calc(${placement.widthRatio * 100}% - 2px)`,
    ...(category === null ? {} : categoryColorStyle(category.color))
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation()
    onOpen(entry, { x: event.clientX, y: event.clientY })
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    onOpen(entry, { x: rect.left + 12, y: rect.top + 12 })
  }

  function handleDoneChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onToggleDone(entry, event.currentTarget.checked)
  }

  return (
    <div
      className={classNames}
      style={style}
      title={item.title}
      role="button"
      tabIndex={0}
      aria-label={`Modifier ${item.title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.content}>
        <div className={styles.titleLine}>
          {isExam && <span className={styles.examDot} aria-hidden="true" />}
          <span className={styles.title}>{item.title}</span>

          {mode === 'title-and-start' && block.startMin !== null && (
            <span className={styles.inlineTime}>{minutesToTime(block.startMin)}</span>
          )}

          {isTask && (
            <input
              className={styles.doneCheckbox}
              type="checkbox"
              checked={isDone}
              aria-label={isDone ? 'Marquer comme à faire' : 'Marquer comme terminée'}
              title={isDone ? 'Marquer comme à faire' : 'Marquer comme terminée'}
              onClick={(event) => event.stopPropagation()}
              onChange={handleDoneChange}
            />
          )}
        </div>

        {mode === 'title-and-range' && block.startMin !== null && (
          <span className={styles.timeLine}>
            {minutesToTime(block.startMin)} –{' '}
            {minutesToTime(Math.min(block.startMin + block.durationMin, MINUTES_PER_DAY))}
            {isExam && (
              <span className={styles.countdown}> · {formatDaysUntil(block.date, today)}</span>
            )}
          </span>
        )}

        {showCategory && category !== null && (
          <span className={styles.categoryLine}>{category.name}</span>
        )}
      </div>
    </div>
  )
}
