import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DRAG_START_DISTANCE_PX } from '../../core/drag'
import { itemTypeAccentColor } from '../../core/itemTypes'
import { MAX_TOP_LINE_ROWS, getBlockEndDate } from '../../core/schedule'
import { addDays, differenceInCalendarDays, formatCountdown, formatLongDate } from '../../core/time'
import type { LocalDate } from '../../core/types'
import { categoryColorStyle } from '../categoryColorStyle'
import { Icon } from '../components/Icon'
import type { FloatingAnchor, PlacedTopLineBand, ScheduleEntry } from './scheduleTypes'
import styles from './TopLineBands.module.css'

/** Hauteur d'une ligne de bandes, espace entre les lignes compris. */
const ROW_HEIGHT_PX = 25

/** Durée pendant laquelle le clic consécutif à un glisser est ignoré. */
const SUPPRESS_CLICK_MS = 120

/** Style global appliqué au document pendant un geste de la ligne du haut. */
function setBodyGestureStyles(userSelect: string, cursor: string): void {
  document.body.style.userSelect = userSelect
  document.body.style.cursor = cursor
}

type BandGestureMode = 'move' | 'resize-start' | 'resize-end'

interface BandPreview {
  bandId: string
  date: LocalDate
  endDate: LocalDate | null
  startIndex: number
  endIndex: number
  clippedStart: boolean
  clippedEnd: boolean
  row: number
}

interface ActiveBandGesture {
  mode: BandGestureMode
  pointerId: number
  startX: number
  entry: ScheduleEntry
  band: PlacedTopLineBand
  sourceColumn: number
  durationDays: number
  sourceDate: LocalDate
  sourceEndDate: LocalDate
  originalEndDate: LocalDate | null
  preview: BandPreview | null
  moved: boolean
  captureElement: HTMLElement
}

interface ActiveCreateGesture {
  pointerId: number
  startX: number
  startColumn: number
  moved: boolean
  captureElement: HTMLElement
}

interface CreationPreview {
  startIndex: number
  endIndex: number
}

interface TopLineBandsProps {
  days: readonly LocalDate[]
  bands: readonly PlacedTopLineBand[]
  /** Nombre total de lignes, y compris celles masquées au-delà du plafond. */
  rowCount: number
  /** Lignes affichées avant le contrôle « +N » ; trois par défaut. */
  maxRows?: number
  today: LocalDate
  onCreate: (date: LocalDate, endDate: LocalDate | null, anchor: FloatingAnchor) => void
  onOpen: (entry: ScheduleEntry, anchor: FloatingAnchor) => void
  onMove: (entry: ScheduleEntry, date: LocalDate, endDate: LocalDate | null) => Promise<void>
  onResize: (entry: ScheduleEntry, date: LocalDate, endDate: LocalDate | null) => Promise<void>
  /** Prévient la vue qu'un geste est en cours : les raccourcis sont suspendus. */
  onGestureActiveChange?: (active: boolean) => void
}

/**
 * Ligne du haut : une bande continue par élément, à cheval sur les colonnes des
 * jours. Un clic sur une bande l'ouvre ; un glisser la déplace ou l'étire. Un
 * glisser sur une zone vide crée une période, un simple clic crée un jour.
 */
export function TopLineBands({
  days,
  bands,
  rowCount,
  maxRows = MAX_TOP_LINE_ROWS,
  today,
  onCreate,
  onOpen,
  onMove,
  onResize,
  onGestureActiveChange
}: TopLineBandsProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const activeBandRef = useRef<ActiveBandGesture | null>(null)
  const activeCreateRef = useRef<ActiveCreateGesture | null>(null)
  const listenersRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef(false)
  const suppressTimerRef = useRef<number | null>(null)
  const [bandPreview, setBandPreview] = useState<BandPreview | null>(null)
  const [creationPreview, setCreationPreview] = useState<CreationPreview | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const dayCount = days.length
  const visibleRowCount = Math.min(rowCount, maxRows)
  const hiddenBands = bands.filter((band) => band.row >= maxRows)
  const trackHeight = Math.max(visibleRowCount, 1) * ROW_HEIGHT_PX - 3

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

  useEffect(() => {
    return () => {
      listenersRef.current?.()
      listenersRef.current = null
      setBodyGestureStyles('', '')
      onGestureActiveChange?.(false)

      if (suppressTimerRef.current !== null) {
        window.clearTimeout(suppressTimerRef.current)
      }
    }
  }, [onGestureActiveChange])

  useEffect(() => {
    if (!moreOpen) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && moreRef.current?.contains(event.target) === true) {
        return
      }

      setMoreOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      setMoreOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreOpen])

  function columnAt(clientX: number): number {
    const track = trackRef.current

    if (track === null || days.length === 0) return 0

    const rect = track.getBoundingClientRect()

    if (rect.width <= 0) return 0

    const columnWidth = rect.width / days.length
    const column = Math.floor((clientX - rect.left) / columnWidth)

    return Math.min(days.length - 1, Math.max(0, column))
  }

  function makePreview(
    band: PlacedTopLineBand,
    date: LocalDate,
    endDate: LocalDate | null
  ): BandPreview | null {
    if (days.length === 0) return null

    const rangeStart = days[0]
    const rangeEnd = days[days.length - 1]
    const lastDate = endDate ?? date
    const startIndex = Math.max(0, differenceInCalendarDays(rangeStart, date))
    const endIndex = Math.min(days.length - 1, differenceInCalendarDays(rangeStart, lastDate))

    if (startIndex > endIndex) return null

    return {
      bandId: band.band.block.id,
      date,
      endDate,
      startIndex,
      endIndex,
      clippedStart: date < rangeStart,
      clippedEnd: lastDate > rangeEnd,
      row: band.row
    }
  }

  function releaseCapture(element: HTMLElement, pointerId: number): void {
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId)
      }
    } catch {
      // Le pointeur a déjà été relâché par le navigateur.
    }
  }

  function endGesture(): void {
    listenersRef.current?.()
    listenersRef.current = null
    setBodyGestureStyles('', '')
    onGestureActiveChange?.(false)
  }

  function cancelBandGesture(): void {
    const active = activeBandRef.current

    if (active === null) return

    releaseCapture(active.captureElement, active.pointerId)
    activeBandRef.current = null
    setBandPreview(null)
    endGesture()
  }

  function cancelCreation(): void {
    const active = activeCreateRef.current

    if (active === null) return

    releaseCapture(active.captureElement, active.pointerId)
    activeCreateRef.current = null
    setCreationPreview(null)
    endGesture()
  }

  function startBandGesture(
    band: PlacedTopLineBand,
    mode: BandGestureMode,
    event: ReactPointerEvent<HTMLElement>
  ): void {
    if (event.button !== 0 || days.length === 0) return
    if (activeBandRef.current !== null || activeCreateRef.current !== null) return

    event.preventDefault()
    event.stopPropagation()

    // Une occurrence de semaine type n'a pas de bloc persistant : elle s'ouvre
    // dans l'éditeur mais ne peut pas être déplacée directement.
    if (band.band.template !== null) return

    const entry = band.band
    const sourceEndDate = getBlockEndDate(entry.block)
    const pointerColumn = columnAt(event.clientX)
    const active: ActiveBandGesture = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      entry,
      band,
      sourceColumn: pointerColumn,
      durationDays: differenceInCalendarDays(entry.block.date, sourceEndDate) + 1,
      sourceDate: entry.block.date,
      sourceEndDate,
      originalEndDate: entry.block.endDate ?? null,
      preview: null,
      moved: false,
      captureElement: event.currentTarget
    }

    activeBandRef.current = active
    onGestureActiveChange?.(true)
    setBodyGestureStyles('none', mode === 'move' ? 'grabbing' : 'ew-resize')

    try {
      active.captureElement.setPointerCapture(event.pointerId)
    } catch {
      // La capture est un confort : les écouteurs de fenêtre suffisent.
    }

    const updatePreview = (clientX: number): void => {
      if (!active.moved && Math.abs(clientX - active.startX) < DRAG_START_DISTANCE_PX) {
        return
      }

      active.moved = true

      const targetColumn = columnAt(clientX)
      let preview: BandPreview | null

      if (active.mode === 'move') {
        const date = addDays(active.sourceDate, targetColumn - active.sourceColumn)
        const lastDate = addDays(date, active.durationDays - 1)
        preview = makePreview(active.band, date, lastDate === date ? null : lastDate)
      } else if (active.mode === 'resize-start') {
        const date = days[targetColumn]
        const lastDate = date > active.sourceEndDate ? active.sourceEndDate : date
        preview = makePreview(
          active.band,
          lastDate,
          lastDate === active.sourceEndDate ? null : active.sourceEndDate
        )
      } else {
        const date = days[targetColumn]
        const lastDate = date < active.sourceDate ? active.sourceDate : date
        preview = makePreview(
          active.band,
          active.sourceDate,
          lastDate === active.sourceDate ? null : lastDate
        )
      }

      active.preview = preview
      setBandPreview(preview)
    }

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== active.pointerId) return

      updatePreview(moveEvent.clientX)

      if (active.moved) {
        moveEvent.preventDefault()
      }
    }

    const finish = async (upEvent: PointerEvent): Promise<void> => {
      if (upEvent.pointerId !== active.pointerId) return
      if (activeBandRef.current !== active) return

      updatePreview(upEvent.clientX)
      releaseCapture(active.captureElement, active.pointerId)
      activeBandRef.current = null

      if (!active.moved) {
        setBandPreview(null)
        endGesture()

        if (active.mode !== 'move') {
          suppressNextClick()
        }

        return
      }

      suppressNextClick()
      const preview = active.preview
      const changed =
        preview !== null &&
        (preview.date !== active.sourceDate || (preview.endDate ?? null) !== active.originalEndDate)

      if (preview !== null && changed) {
        const action = active.mode === 'move' ? onMove : onResize

        await action(active.entry, preview.date, preview.endDate).catch(() => undefined)
      }

      setBandPreview(null)
      endGesture()
    }

    const handlePointerUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== active.pointerId) return
      void finish(upEvent)
    }

    const handlePointerCancel = (cancelEvent: PointerEvent): void => {
      if (cancelEvent.pointerId !== active.pointerId) return
      cancelBandGesture()
    }

    const handleWindowBlur = (): void => {
      cancelBandGesture()
    }

    const handleKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape') return

      keyEvent.preventDefault()
      cancelBandGesture()
    }

    const removeListeners = (): void => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('keydown', handleKeyDown)
    }

    listenersRef.current = removeListeners
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('keydown', handleKeyDown)
  }

  function startCreation(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || days.length === 0) return
    if (activeBandRef.current !== null || activeCreateRef.current !== null) return

    event.preventDefault()

    const active: ActiveCreateGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startColumn: columnAt(event.clientX),
      moved: false,
      captureElement: event.currentTarget
    }

    activeCreateRef.current = active
    onGestureActiveChange?.(true)
    setBodyGestureStyles('none', 'crosshair')

    try {
      active.captureElement.setPointerCapture(event.pointerId)
    } catch {
      // La capture est un confort : les écouteurs de fenêtre suffisent.
    }

    const updatePreview = (clientX: number): void => {
      if (!active.moved && Math.abs(clientX - active.startX) < DRAG_START_DISTANCE_PX) {
        return
      }

      const endColumn = columnAt(clientX)

      active.moved = true
      setCreationPreview({
        startIndex: Math.min(active.startColumn, endColumn),
        endIndex: Math.max(active.startColumn, endColumn)
      })
    }

    const finish = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== active.pointerId) return
      if (activeCreateRef.current !== active) return

      updatePreview(upEvent.clientX)
      releaseCapture(active.captureElement, active.pointerId)
      activeCreateRef.current = null
      setCreationPreview(null)
      endGesture()

      const endColumn = active.moved ? columnAt(upEvent.clientX) : active.startColumn
      const startIndex = Math.min(active.startColumn, endColumn)
      const endIndex = Math.max(active.startColumn, endColumn)
      const date = days[startIndex]

      if (date === undefined) return

      onCreate(date, startIndex === endIndex ? null : days[endIndex], {
        x: upEvent.clientX,
        y: upEvent.clientY
      })
    }

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== active.pointerId) return
      updatePreview(moveEvent.clientX)
    }

    const handlePointerUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== active.pointerId) return
      finish(upEvent)
    }

    const handlePointerCancel = (cancelEvent: PointerEvent): void => {
      if (cancelEvent.pointerId !== active.pointerId) return
      cancelCreation()
    }

    const handleWindowBlur = (): void => {
      cancelCreation()
    }

    const handleKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== 'Escape') return

      keyEvent.preventDefault()
      cancelCreation()
    }

    const removeListeners = (): void => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('keydown', handleKeyDown)
    }

    listenersRef.current = removeListeners
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('keydown', handleKeyDown)
  }

  function handleBandClick(entry: ScheduleEntry, event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation()

    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }

    onOpen(entry, { x: event.clientX, y: event.clientY })
  }

  function handleBandKeyDown(
    entry: ScheduleEntry,
    event: React.KeyboardEvent<HTMLDivElement>
  ): void {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    onOpen(entry, { x: rect.left + 12, y: rect.top + 12 })
  }

  return (
    <div className={styles.root}>
      <div
        ref={trackRef}
        className={styles.track}
        style={{
          height: `${trackHeight}px`,
          backgroundSize: `${100 / Math.max(1, dayCount)}% 100%`
        }}
        title="Cliquer pour ajouter un élément, glisser pour créer une période"
        onPointerDown={startCreation}
      >
        {bands
          .filter((band) => band.row < maxRows)
          .map((band) => {
            const entry = band.band
            const type = entry.type
            const accent = itemTypeAccentColor(type, entry.category?.color ?? null)
            const countdown = type.countdown
              ? formatCountdown(entry.block.date, entry.block.endDate, today)
              : null
            const previewing = bandPreview?.bandId === entry.block.id
            // Étirer une période est réservé aux types de la ligne du haut.
            const canResize = entry.template === null && type.placement === 'topLine'

            return (
              <div
                className={`${styles.band} ${previewing ? styles.bandPreviewing : ''}`}
                data-style={type.style}
                data-colored={accent !== null ? '' : undefined}
                data-top-line-band
                key={entry.block.id}
                role="button"
                tabIndex={0}
                aria-label={`Modifier ${entry.item.title}`}
                title={`${entry.item.title}${countdown === null ? '' : ` · ${countdown}`}`}
                style={{
                  top: `${band.row * ROW_HEIGHT_PX}px`,
                  left: `calc(${(band.startIndex / dayCount) * 100}% + 2px)`,
                  width: `calc(${((band.endIndex - band.startIndex + 1) / dayCount) * 100}% - 4px)`,
                  ...(accent === null ? {} : categoryColorStyle(accent))
                }}
                onClick={(event) => handleBandClick(entry, event)}
                onKeyDown={(event) => handleBandKeyDown(entry, event)}
                onPointerDown={(event) => startBandGesture(band, 'move', event)}
              >
                {band.clippedStart && (
                  <Icon name="chevronLeft" size={12} className={styles.chevron} />
                )}

                <span className={styles.bandDot} aria-hidden="true" />
                <span className={styles.bandTitle}>{entry.item.title}</span>
                {countdown !== null && <span className={styles.bandCountdown}>· {countdown}</span>}

                {band.clippedEnd && (
                  <Icon name="chevronRight" size={12} className={styles.chevron} />
                )}

                {canResize && !band.clippedStart && (
                  <span
                    className={`${styles.resizeHandle} ${styles.resizeStart}`}
                    aria-hidden="true"
                    onPointerDown={(event) => startBandGesture(band, 'resize-start', event)}
                  />
                )}

                {canResize && !band.clippedEnd && (
                  <span
                    className={`${styles.resizeHandle} ${styles.resizeEnd}`}
                    aria-hidden="true"
                    onPointerDown={(event) => startBandGesture(band, 'resize-end', event)}
                  />
                )}
              </div>
            )
          })}

        {bandPreview !== null && (
          <div
            className={styles.previewBand}
            style={{
              top: `${bandPreview.row * ROW_HEIGHT_PX}px`,
              left: `calc(${(bandPreview.startIndex / dayCount) * 100}% + 2px)`,
              width: `calc(${((bandPreview.endIndex - bandPreview.startIndex + 1) / dayCount) * 100}% - 4px)`
            }}
            aria-hidden="true"
          >
            {bandPreview.clippedStart && <Icon name="chevronLeft" size={12} />}
            <span className={styles.previewTitle}>
              {bands.find((band) => band.band.block.id === bandPreview.bandId)?.band.item.title ??
                ''}
            </span>
            {bandPreview.clippedEnd && <Icon name="chevronRight" size={12} />}
          </div>
        )}

        {creationPreview !== null && (
          <div
            className={styles.creationPreview}
            style={{
              left: `calc(${(creationPreview.startIndex / dayCount) * 100}% + 2px)`,
              width: `calc(${((creationPreview.endIndex - creationPreview.startIndex + 1) / dayCount) * 100}% - 4px)`
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {hiddenBands.length > 0 && (
        <div
          ref={moreRef}
          className={styles.more}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={styles.moreButton}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            +{hiddenBands.length}
          </button>

          {moreOpen && (
            <div className={styles.moreList} role="menu" aria-label="Éléments masqués">
              {hiddenBands.map(({ band }) => (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.moreItem}
                  key={band.block.id}
                  onClick={(event) => {
                    setMoreOpen(false)
                    onOpen(band, { x: event.clientX, y: event.clientY })
                  }}
                >
                  <span className={styles.moreItemTitle}>{band.item.title}</span>
                  <span className={styles.moreItemDate}>{formatBandDateRange(band)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatBandDateRange(entry: ScheduleEntry): string {
  const endDate = getBlockEndDate(entry.block)

  if (endDate === entry.block.date) {
    return formatLongDate(entry.block.date)
  }

  return `${formatLongDate(entry.block.date)} – ${formatLongDate(endDate)}`
}
