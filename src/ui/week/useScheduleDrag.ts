import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import {
  DRAG_START_DISTANCE_PX,
  getGrabOffsetMin,
  getMoveStartMin,
  getResizeDurationMin,
  getTaskDragDuration,
  resolveDragPoint,
  type ColumnBounds
} from '../../core/drag'
import type { InboxTask } from '../../core/inbox'
import { getFreeSlots, type FreeSlot } from '../../core/schedule'
import { MINUTES_PER_DAY, SNAP_MINUTES } from '../../core/time'
import type { LocalDate } from '../../core/types'
import { repositories } from '../../db/repositories'
import type { PlacedEntry, WeekDayData } from './weekTypes'

/** Bande, en pixels, dans laquelle le défilement automatique s'active. */
const AUTO_SCROLL_EDGE_PX = 56

/** Vitesse maximale du défilement automatique, en pixels par seconde. */
const AUTO_SCROLL_MAX_PX_PER_SECOND = 800

/** Durée pendant laquelle le clic consécutif à un glisser est ignoré. */
const SUPPRESS_CLICK_MS = 120

export type DragKind = 'move' | 'resize' | 'create'

export interface DragTarget {
  date: LocalDate
  startMin: number
  durationMin: number
}

/** Données stables d'un geste, affichées par la couche de survol. */
export interface ScheduleDragSession {
  kind: DragKind
  blockId: string | null
  title: string
  categoryColor: string | null
  durationMin: number
  freeSlotsByDate: ReadonlyMap<LocalDate, FreeSlot[]>
}

/** Position d'arrivée recalculée à chaque accrochage. */
export interface ScheduleDragPreview {
  target: DragTarget | null
  overInbox: boolean
}

export interface ScheduleDragController {
  session: ScheduleDragSession | null
  preview: ScheduleDragPreview | null
  startBlockMove: (entry: PlacedEntry, event: ReactPointerEvent<HTMLElement>) => void
  startBlockResize: (entry: PlacedEntry, event: ReactPointerEvent<HTMLElement>) => void
  startTaskDrag: (task: InboxTask, event: ReactPointerEvent<HTMLElement>) => void
  cancelDrag: () => void
}

interface UseScheduleDragOptions {
  scrollRef: RefObject<HTMLDivElement>
  daysRef: RefObject<HTMLDivElement>
  weekDays: readonly LocalDate[]
  daysData: ReadonlyMap<LocalDate, WeekDayData>
  onError: (message: string) => void
}

interface PendingGesture {
  kind: DragKind
  pointerId: number
  startX: number
  startY: number
  sourceEntry: PlacedEntry | null
  task: InboxTask | null
  durationMin: number
  grabOffsetMin: number
  title: string
  categoryColor: string | null
}

interface ActiveGesture extends PendingGesture {
  scrollEl: HTMLDivElement
  scrollTop0: number
  scrollRect: DOMRect
  gridTop0: number
  pixelsPerMinute: number
  columns: ColumnBounds[]
  days: LocalDate[]
  inboxLeft: number | null
  freeSlotsByDate: Map<LocalDate, FreeSlot[]>
  blockElement: HTMLElement | null
  originalTransform: string
  originalHeight: string
  /** Hauteur finale confirmée après un redimensionnement réussi. */
  finalHeight: string | null
  target: DragTarget | null
  overInbox: boolean
  lastPreviewKey: string
  lastTransform: string
  lastHeight: string
  lastCardTransform: string
  lastFrameTime: number | null
  sourceDate: LocalDate | null
  sourceStartMin: number | null
  sourceDurationMin: number
}

/**
 * Pilote un geste de glisser-déposer avec les événements pointeur.
 *
 * Pendant le geste, aucune donnée n'est écrite : seules des variables CSS et
 * des états de survol changent. Les repositories ne sont appelés qu'au lâcher,
 * et l'écriture pousse son action inverse dans l'historique.
 */
export function useScheduleDrag({
  scrollRef,
  daysRef,
  weekDays,
  daysData,
  onError
}: UseScheduleDragOptions): ScheduleDragController {
  const [session, setSession] = useState<ScheduleDragSession | null>(null)
  const [preview, setPreview] = useState<ScheduleDragPreview | null>(null)
  const pendingRef = useRef<PendingGesture | null>(null)
  const activeRef = useRef<ActiveGesture | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const listenersRef = useRef<{ remove: () => void } | null>(null)
  const suppressClickRef = useRef(false)
  const suppressTimerRef = useRef<number | null>(null)

  const weekDaysRef = useRef(weekDays)
  const daysDataRef = useRef(daysData)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    weekDaysRef.current = weekDays
  }, [weekDays])

  useEffect(() => {
    daysDataRef.current = daysData
  }, [daysData])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const stopLoop = useCallback((): void => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const removeListeners = useCallback((): void => {
    listenersRef.current?.remove()
    listenersRef.current = null
  }, [])

  const restoreActiveStyles = useCallback((): void => {
    const active = activeRef.current

    if (active?.blockElement !== null && active?.blockElement !== undefined) {
      active.blockElement.style.transform = active.originalTransform
      active.blockElement.style.height = active.finalHeight ?? active.originalHeight
    }

    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const suppressNextClick = useCallback((): void => {
    suppressClickRef.current = true

    if (suppressTimerRef.current !== null) {
      window.clearTimeout(suppressTimerRef.current)
    }

    suppressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false
      suppressTimerRef.current = null
    }, SUPPRESS_CLICK_MS)
  }, [])

  const teardown = useCallback((): void => {
    stopLoop()
    removeListeners()
    restoreActiveStyles()
    activeRef.current = null
    pendingRef.current = null
    setSession(null)
    setPreview(null)
  }, [removeListeners, restoreActiveStyles, stopLoop])

  const cancelDrag = useCallback((): void => {
    if (activeRef.current !== null) suppressNextClick()
    teardown()
  }, [suppressNextClick, teardown])

  useEffect(() => {
    const handleClickCapture = (event: MouseEvent): void => {
      if (!suppressClickRef.current) return

      suppressClickRef.current = false

      if (suppressTimerRef.current !== null) {
        window.clearTimeout(suppressTimerRef.current)
        suppressTimerRef.current = null
      }

      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('click', handleClickCapture, true)

    return () => {
      window.removeEventListener('click', handleClickCapture, true)

      if (suppressTimerRef.current !== null) {
        window.clearTimeout(suppressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      stopLoop()
      removeListeners()
      restoreActiveStyles()
      activeRef.current = null
      pendingRef.current = null
    }
  }, [removeListeners, restoreActiveStyles, stopLoop])

  const updateFrame = useCallback((): void => {
    const active = activeRef.current

    if (active === null) return

    const pointer = pointerRef.current
    const scrollEl = active.scrollEl
    const scrollRect = active.scrollRect
    const now = performance.now()
    const elapsedMs =
      active.lastFrameTime === null ? 0 : Math.min(64, Math.max(0, now - active.lastFrameTime))

    active.lastFrameTime = now

    // Défilement automatique près des bords haut et bas de la grille.
    if (pointer.x >= scrollRect.left && pointer.x <= scrollRect.right) {
      let velocity = 0

      if (pointer.y < scrollRect.top + AUTO_SCROLL_EDGE_PX) {
        const intensity = Math.min(
          1,
          Math.max(0, (scrollRect.top + AUTO_SCROLL_EDGE_PX - pointer.y) / AUTO_SCROLL_EDGE_PX)
        )
        velocity = -AUTO_SCROLL_MAX_PX_PER_SECOND * intensity
      } else if (pointer.y > scrollRect.bottom - AUTO_SCROLL_EDGE_PX) {
        const intensity = Math.min(
          1,
          Math.max(0, (pointer.y - (scrollRect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX)
        )
        velocity = AUTO_SCROLL_MAX_PX_PER_SECOND * intensity
      }

      if (velocity !== 0 && elapsedMs > 0) {
        const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
        const nextScroll = Math.min(
          maxScroll,
          Math.max(0, scrollEl.scrollTop + velocity * (elapsedMs / 1000))
        )

        if (nextScroll !== scrollEl.scrollTop) {
          scrollEl.scrollTop = nextScroll
        }
      }
    }

    const zone = resolveDragPoint(
      { x: pointer.x, y: pointer.y },
      {
        gridTop: active.gridTop0 - (scrollEl.scrollTop - active.scrollTop0),
        pixelsPerMinute: active.pixelsPerMinute,
        columns: active.columns,
        inboxLeft: active.inboxLeft
      }
    )

    let target: DragTarget | null = null
    let overInbox = false

    if (zone.zone === 'inbox') {
      overInbox = true
    } else if (zone.zone === 'grid') {
      if (active.kind === 'resize') {
        if (active.sourceDate !== null && active.sourceStartMin !== null) {
          target = {
            date: active.sourceDate,
            startMin: active.sourceStartMin,
            durationMin: getResizeDurationMin(active.sourceStartMin, zone.minute)
          }
        }
      } else {
        const date = active.days[zone.dayIndex]

        if (date !== undefined) {
          target = {
            date,
            startMin:
              active.kind === 'move'
                ? getMoveStartMin(zone.minute, active.grabOffsetMin, active.durationMin)
                : getMoveStartMin(zone.minute, 0, active.durationMin),
            durationMin: active.durationMin
          }
        }
      }
    }

    active.target = target
    active.overInbox = overInbox

    const previewKey =
      target === null
        ? overInbox
          ? 'inbox'
          : 'none'
        : `${target.date}:${target.startMin}:${target.durationMin}`

    if (previewKey !== active.lastPreviewKey) {
      active.lastPreviewKey = previewKey
      setPreview({ target, overInbox })
    }

    if (active.kind === 'move' && active.blockElement !== null) {
      const dx = pointer.x - active.startX
      const dy = pointer.y - active.startY + (scrollEl.scrollTop - active.scrollTop0)
      const transform = `translate3d(${dx}px, ${dy}px, 0)`

      if (transform !== active.lastTransform) {
        active.lastTransform = transform
        active.blockElement.style.transform = transform
      }
    } else if (active.kind === 'resize' && active.blockElement !== null && target !== null) {
      const height = `${target.durationMin * active.pixelsPerMinute}px`

      if (height !== active.lastHeight) {
        active.lastHeight = height
        active.blockElement.style.height = height
      }
    } else if (active.kind === 'create') {
      const card = document.querySelector<HTMLElement>('[data-drag-card]')

      if (card !== null) {
        const transform = `translate3d(${pointer.x + 14}px, ${pointer.y + 14}px, 0)`

        if (transform !== active.lastCardTransform) {
          active.lastCardTransform = transform
          card.style.transform = transform
        }
      }
    }
  }, [])

  const beginGesture = useCallback(
    (
      kind: DragKind,
      entry: PlacedEntry | null,
      task: InboxTask | null,
      event: ReactPointerEvent<HTMLElement>
    ): void => {
      if (event.button !== 0 || pendingRef.current !== null || activeRef.current !== null) return

      const durationMin =
        kind === 'create' && task !== null
          ? getTaskDragDuration(task.remainingMin)
          : (entry?.block.durationMin ?? 0)

      if (durationMin <= 0) return

      let grabOffsetMin = 0

      if (kind === 'move' && entry !== null) {
        const blockStart = entry.block.startMin ?? 0
        const visibleDuration = Math.min(durationMin, Math.max(1, MINUTES_PER_DAY - blockStart))
        const rect = event.currentTarget.getBoundingClientRect()
        const pixelsPerMinute = rect.height > 0 ? rect.height / visibleDuration : 1
        const pointerMin = blockStart + (event.clientY - rect.top) / pixelsPerMinute

        grabOffsetMin = getGrabOffsetMin(pointerMin, blockStart, durationMin)
      }

      const pending: PendingGesture = {
        kind,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        sourceEntry: entry,
        task,
        durationMin,
        grabOffsetMin,
        title: kind === 'create' ? (task?.item.title ?? '') : (entry?.item.title ?? ''),
        categoryColor:
          kind === 'create' ? (task?.category?.color ?? null) : (entry?.category?.color ?? null)
      }

      pendingRef.current = pending
      pointerRef.current = { x: event.clientX, y: event.clientY }

      const captureElement = event.currentTarget

      try {
        captureElement.setPointerCapture(event.pointerId)
      } catch {
        // La capture est un confort : les écouteurs de fenêtre suffisent.
      }

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pending.pointerId) return

        pointerRef.current = { x: moveEvent.clientX, y: moveEvent.clientY }

        if (activeRef.current === null) {
          const distance = Math.hypot(
            moveEvent.clientX - pending.startX,
            moveEvent.clientY - pending.startY
          )

          if (distance < DRAG_START_DISTANCE_PX) return

          activate()
        }

        if (activeRef.current === null) return

        moveEvent.preventDefault()
      }

      const handlePointerUp = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId !== pending.pointerId) return

        pointerRef.current = { x: upEvent.clientX, y: upEvent.clientY }

        if (activeRef.current === null) {
          teardown()
          return
        }

        updateFrame()
        void finish()
      }

      const handlePointerCancel = (cancelEvent: PointerEvent): void => {
        if (cancelEvent.pointerId !== pending.pointerId) return
        cancelDrag()
      }

      const handleWindowBlur = (): void => {
        cancelDrag()
      }

      const handleKeyDown = (keyEvent: KeyboardEvent): void => {
        if (keyEvent.key !== 'Escape') return
        keyEvent.preventDefault()
        cancelDrag()
      }

      const removeLocalListeners = (): void => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerCancel)
        window.removeEventListener('blur', handleWindowBlur)
        document.removeEventListener('keydown', handleKeyDown)

        try {
          if (captureElement.hasPointerCapture(pending.pointerId)) {
            captureElement.releasePointerCapture(pending.pointerId)
          }
        } catch {
          // Le pointeur a déjà été relâché par le navigateur.
        }
      }

      listenersRef.current = { remove: removeLocalListeners }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerCancel)
      window.addEventListener('blur', handleWindowBlur)
      document.addEventListener('keydown', handleKeyDown)

      function activate(): void {
        const scrollEl = scrollRef.current
        const daysEl = daysRef.current

        if (scrollEl === null || daysEl === null) {
          teardown()
          return
        }

        const dayElements = Array.from(daysEl.children) as HTMLElement[]
        const days = weekDaysRef.current

        if (dayElements.length === 0 || dayElements.length !== days.length) {
          teardown()
          return
        }

        const firstRect = dayElements[0].getBoundingClientRect()

        if (firstRect.height <= 0) {
          teardown()
          return
        }

        const scrollRect = scrollEl.getBoundingClientRect()
        const columns: ColumnBounds[] = dayElements.map((element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        })
        const inboxElement = document.querySelector<HTMLElement>('[data-inbox-drop]')
        const inboxLeft = inboxElement === null ? null : inboxElement.getBoundingClientRect().left
        const excludedBlockId = pending.sourceEntry?.block.id ?? null
        const freeSlotsByDate = new Map<LocalDate, FreeSlot[]>()

        for (const date of days) {
          const blocks = (daysDataRef.current.get(date)?.timed ?? [])
            .map((dayEntry) => dayEntry.block)
            .filter((block) => block.id !== excludedBlockId)

          freeSlotsByDate.set(date, getFreeSlots(blocks, { minimumDurationMin: SNAP_MINUTES }))
        }

        const blockElement =
          pending.sourceEntry === null
            ? null
            : document.querySelector<HTMLElement>(
                `[data-block-id="${pending.sourceEntry.block.id}"]`
              )
        const active: ActiveGesture = {
          ...pending,
          scrollEl,
          scrollTop0: scrollEl.scrollTop,
          scrollRect,
          gridTop0: firstRect.top,
          pixelsPerMinute: firstRect.height / MINUTES_PER_DAY,
          columns,
          days: [...days],
          inboxLeft,
          freeSlotsByDate,
          blockElement,
          originalTransform: blockElement?.style.transform ?? '',
          originalHeight: blockElement?.style.height ?? '',
          finalHeight: null,
          target: null,
          overInbox: false,
          lastPreviewKey: '',
          lastTransform: '',
          lastHeight: '',
          lastCardTransform: '',
          lastFrameTime: null,
          sourceDate: pending.sourceEntry?.block.date ?? null,
          sourceStartMin: pending.sourceEntry?.block.startMin ?? null,
          sourceDurationMin: pending.sourceEntry?.block.durationMin ?? 0
        }

        activeRef.current = active
        setSession({
          kind: pending.kind,
          blockId: pending.sourceEntry?.block.id ?? null,
          title: pending.title,
          categoryColor: pending.categoryColor,
          durationMin: pending.durationMin,
          freeSlotsByDate
        })
        setPreview({ target: null, overInbox: false })
        document.body.style.userSelect = 'none'
        document.body.style.cursor = pending.kind === 'resize' ? 'ns-resize' : 'grabbing'
        updateFrame()
        rafRef.current = window.requestAnimationFrame(frame)
      }

      function frame(): void {
        if (activeRef.current === null) {
          rafRef.current = null
          return
        }

        updateFrame()
        rafRef.current = window.requestAnimationFrame(frame)
      }

      async function commit(action: () => Promise<unknown>, message: string): Promise<boolean> {
        try {
          await action()
          return true
        } catch {
          onErrorRef.current(message)
          return false
        }
      }

      async function finish(): Promise<void> {
        const active = activeRef.current

        if (active === null) {
          teardown()
          return
        }

        // Le clic déclenché par le relâchement ne doit jamais ouvrir un éditeur.
        suppressNextClick()
        stopLoop()
        removeListeners()

        if (active.kind === 'move' && active.sourceEntry !== null) {
          const blockId = active.sourceEntry.block.id

          if (active.overInbox) {
            await commit(
              () => repositories.planning.removeBlock(blockId),
              'Le bloc n’a pas pu être retiré.'
            )
          } else if (
            active.target !== null &&
            (active.target.date !== active.sourceDate ||
              active.target.startMin !== active.sourceStartMin)
          ) {
            const target = active.target

            await commit(
              () =>
                repositories.planning.moveBlock({
                  blockId,
                  date: target.date,
                  startMin: target.startMin
                }),
              'Le bloc n’a pas pu être déplacé.'
            )
          }
        } else if (active.kind === 'resize' && active.sourceEntry !== null) {
          if (active.target !== null && active.target.durationMin !== active.sourceDurationMin) {
            const durationMin = active.target.durationMin
            const blockId = active.sourceEntry.block.id

            const succeeded = await commit(
              () => repositories.planning.resizeBlock({ blockId, durationMin }),
              'Le bloc n’a pas pu être redimensionné.'
            )

            if (succeeded) {
              active.finalHeight = `${durationMin * active.pixelsPerMinute}px`
            }
          }
        } else if (active.kind === 'create' && active.task !== null && active.target !== null) {
          const target = active.target
          const itemId = active.task.item.id

          await commit(
            () =>
              repositories.planning.placeTask({
                itemId,
                date: target.date,
                startMin: target.startMin,
                durationMin: target.durationMin
              }),
            'La tâche n’a pas pu être planifiée.'
          )
        }

        teardown()
      }
    },
    [
      cancelDrag,
      daysRef,
      removeListeners,
      scrollRef,
      stopLoop,
      suppressNextClick,
      teardown,
      updateFrame
    ]
  )

  const startBlockMove = useCallback(
    (entry: PlacedEntry, event: ReactPointerEvent<HTMLElement>): void => {
      beginGesture('move', entry, null, event)
    },
    [beginGesture]
  )

  const startBlockResize = useCallback(
    (entry: PlacedEntry, event: ReactPointerEvent<HTMLElement>): void => {
      beginGesture('resize', entry, null, event)
    },
    [beginGesture]
  )

  const startTaskDrag = useCallback(
    (task: InboxTask, event: ReactPointerEvent<HTMLElement>): void => {
      beginGesture('create', null, task, event)
    },
    [beginGesture]
  )

  return {
    session,
    preview,
    startBlockMove,
    startBlockResize,
    startTaskDrag,
    cancelDrag
  }
}
