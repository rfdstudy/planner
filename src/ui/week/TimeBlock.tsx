import { memo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { DRAG_START_DISTANCE_PX } from '../../core/drag'
import { fallbackItemType } from '../../core/itemTypes'
import { getBlockContentMode, showsBlockCategory } from '../../core/schedule'
import { MINUTES_PER_DAY, formatDaysUntil, minutesToTime } from '../../core/time'
import type { LocalDate } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import { itemTypeColorStyle } from '../itemTypeStyle'
import type { FloatingAnchor, PlacedEntry } from './scheduleTypes'
import styles from './TimeBlock.module.css'

export type TimeBlockDragMode = 'move' | 'resize'

interface TimeBlockProps {
  entry: PlacedEntry
  today: LocalDate
  dragMode: TimeBlockDragMode | null
  selected: boolean
  onOpen: (entry: PlacedEntry, anchor: FloatingAnchor) => void
  onToggleDone: (entry: PlacedEntry, done: boolean) => void
  onMoveStart: (entry: PlacedEntry, event: React.PointerEvent<HTMLDivElement>) => void
  onResizeStart: (entry: PlacedEntry, event: React.PointerEvent<HTMLDivElement>) => void
  onContextMenu: (entry: PlacedEntry, event: React.MouseEvent<HTMLDivElement>) => void
}

export const TimeBlock = memo(function TimeBlock({
  entry,
  today,
  dragMode,
  selected,
  onOpen,
  onToggleDone,
  onMoveStart,
  onResizeStart,
  onContextMenu
}: TimeBlockProps): React.JSX.Element | null {
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const { block, item, category, placement } = entry
  const type = entry.type ?? fallbackItemType(item.typeId)

  if (placement.startMin >= MINUTES_PER_DAY) return null

  const startMin = Math.max(0, placement.startMin)
  const endMin = Math.min(MINUTES_PER_DAY, placement.endMin)
  const visibleDurationMin = Math.max(1, endMin - startMin)
  const mode = getBlockContentMode(visibleDurationMin)
  const isAlert = type.style === 'alert'
  const isTask = type.isTask
  const isCompact = visibleDurationMin < 30
  const hasTypeColor = type.color !== null && (type.style === 'neutral' || type.style === 'free')
  const showCategory =
    showsBlockCategory(visibleDurationMin) && type.style === 'category' && category !== null
  const isDone = item.status === 'done'

  const classNames = [
    styles.block,
    styles[type.style],
    hasTypeColor ? styles.withTypeColor : '',
    isCompact ? styles.compact : '',
    isDone ? styles.done : '',
    selected ? styles.selected : '',
    dragMode === 'move' ? styles.dragging : '',
    dragMode === 'resize' ? styles.resizing : ''
  ]
    .filter((className) => className !== '')
    .join(' ')

  const style: CSSProperties = {
    top: `${startMin}px`,
    height: `${visibleDurationMin}px`,
    left: `calc(${placement.leftRatio * 100}% + 1px)`,
    width: `calc(${placement.widthRatio * 100}% - 2px)`,
    ...(type.style === 'category' && category !== null ? categoryColorStyle(category.color) : {}),
    ...itemTypeColorStyle(type)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return

    const target = event.target

    if (target instanceof HTMLElement && target.closest('input, [data-resize-handle]') !== null) {
      return
    }

    pointerDownRef.current = { x: event.clientX, y: event.clientY }
    onMoveStart(entry, event)
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.stopPropagation()

    if (event.button !== 0) return

    pointerDownRef.current = { x: event.clientX, y: event.clientY }
    onResizeStart(entry, event)
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation()

    const pointerDown = pointerDownRef.current
    pointerDownRef.current = null

    if (event.detail !== 0 && pointerDown !== null) {
      const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)

      if (distance > DRAG_START_DISTANCE_PX) return
    }

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

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    onContextMenu(entry, event)
  }

  return (
    <div
      className={classNames}
      style={style}
      title={item.title}
      role="button"
      tabIndex={0}
      aria-label={`Modifier ${item.title}`}
      data-block-id={block.id}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    >
      <div className={styles.content}>
        <div className={styles.titleLine}>
          {isAlert && <span className={styles.alertDot} aria-hidden="true" />}
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
            {type.countdown && (
              <span className={styles.countdown}> · {formatDaysUntil(block.date, today)}</span>
            )}
          </span>
        )}

        {showCategory && category !== null && (
          <span className={styles.categoryLine}>{category.name}</span>
        )}
      </div>

      <div
        className={styles.resizeHandle}
        data-resize-handle
        aria-hidden="true"
        onPointerDown={handleResizePointerDown}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
})
