import type { CSSProperties } from 'react'
import { getBlockContentMode, showsBlockCategory } from '../../core/schedule'
import { MINUTES_PER_DAY, formatDaysUntil, minutesToTime } from '../../core/time'
import type { LocalDate } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import type { PlacedEntry } from './weekTypes'
import styles from './TimeBlock.module.css'

interface TimeBlockProps {
  entry: PlacedEntry
  today: LocalDate
}

export function TimeBlock({ entry, today }: TimeBlockProps): React.JSX.Element | null {
  const { block, item, category, placement } = entry

  if (placement.startMin >= MINUTES_PER_DAY) return null

  const startMin = Math.max(0, placement.startMin)
  const endMin = Math.min(MINUTES_PER_DAY, placement.endMin)
  const visibleDurationMin = Math.max(1, endMin - startMin)
  const mode = getBlockContentMode(visibleDurationMin)
  const isExam = item.kind === 'exam'
  const isCompact = visibleDurationMin < 30
  const showCategory = showsBlockCategory(visibleDurationMin) && category !== null

  const classNames = [
    styles.block,
    styles[item.kind],
    isCompact ? styles.compact : '',
    item.status === 'done' ? styles.done : ''
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

  return (
    <div className={classNames} style={style} title={item.title}>
      <div className={styles.content}>
        <div className={styles.titleLine}>
          {isExam && <span className={styles.examDot} aria-hidden="true" />}
          <span className={styles.title}>{item.title}</span>
          {mode === 'title-and-start' && block.startMin !== null && (
            <span className={styles.inlineTime}>{minutesToTime(block.startMin)}</span>
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

        {showCategory && <span className={styles.categoryLine}>{category.name}</span>}
      </div>
    </div>
  )
}
