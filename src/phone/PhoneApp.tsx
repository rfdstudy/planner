import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { parseNotes } from '../core/notes'
import {
  PHONE_SNAPSHOT_DAYS_AFTER,
  PHONE_SNAPSHOT_DAYS_BEFORE,
  formatPhoneSnapshotPeriod,
  type PhoneSnapshot,
  type PhoneSnapshotAllDay,
  type PhoneSnapshotBlock,
  type PhoneSnapshotDay
} from '../core/phoneSnapshot'
import {
  getBlockContentMode,
  getFreeSlots,
  layoutBlocks,
  showsBlockCategory
} from '../core/schedule'
import {
  MINUTES_PER_DAY,
  addDays,
  formatDayLabel,
  formatDurationMinutes,
  minutesToTime,
  todayLocalDate
} from '../core/time'
import type { LocalDate } from '../core/types'
import { Icon } from '../ui/components/Icon'
import {
  PhoneSnapshotError,
  formatPhoneSnapshotMoment,
  isPhoneSnapshotStale,
  loadPhoneSnapshot,
  parsePhoneSnapshot,
  requestPersistentStorage,
  savePhoneSnapshot
} from './storage'
import styles from './PhoneApp.module.css'

/** Échelle de la journée sur téléphone : 1 h = 90 px. */
const PX_PER_MIN = 1.5
const MIN_BLOCK_HEIGHT_PX = 44
const MIN_FREE_SLOT_MIN = 30
const HOUR_HEIGHT_PX = 60 * PX_PER_MIN
const TIMELINE_HEIGHT_PX = MINUTES_PER_DAY * PX_PER_MIN

type SheetEntry =
  { kind: 'block'; block: PhoneSnapshotBlock } | { kind: 'allDay'; allDay: PhoneSnapshotAllDay }

function capitalize(value: string): string {
  if (value.length === 0) return value
  return value.charAt(0).toLocaleUpperCase('fr') + value.slice(1)
}

function entryColorStyle(color: string | null): CSSProperties | undefined {
  return color === null ? undefined : ({ '--entry-color': color } as CSSProperties)
}

function blockTimeLabel(block: PhoneSnapshotBlock): string {
  return `${minutesToTime(block.startMin)} – ${minutesToTime(block.endMin)}`
}

function allDayDetailLabel(item: PhoneSnapshotAllDay): string | null {
  return item.period ?? item.countdown
}

/**
 * Écran unique du téléphone, en lecture seule. Il ne charge que l'instantané
 * mémorisé sur l'appareil : aucune base Dexie, aucun éditeur, aucune écriture
 * de données de calendrier.
 */
export function PhoneApp(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PhoneSnapshot | null>(() => loadPhoneSnapshot())
  const [selectedDate, setSelectedDate] = useState<LocalDate>(() => todayLocalDate())
  const [now, setNow] = useState(() => new Date())
  const [sheet, setSheet] = useState<SheetEntry | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [scrollRequest, setScrollRequest] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLElement>(null)

  const daysByDate = useMemo(
    () => new Map((snapshot?.days ?? []).map((day) => [day.date, day])),
    [snapshot]
  )
  const selectedDay = daysByDate.get(selectedDate)
  const insideSnapshot =
    snapshot !== null && selectedDate >= snapshot.rangeStart && selectedDate <= snapshot.rangeEnd
  const stale = snapshot !== null && isPhoneSnapshotStale(snapshot, now)
  const isToday = selectedDate === todayLocalDate(now)

  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    const updateNow = (): void => setNow(new Date())
    const timer = window.setInterval(updateNow, 30_000)

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') updateNow()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', updateNow)
    window.addEventListener('pageshow', updateNow)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', updateNow)
      window.removeEventListener('pageshow', updateNow)
    }
  }, [])

  useEffect(() => {
    const container = scrollRef.current

    if (container === null) return

    const frame = window.requestAnimationFrame(() => {
      const reference = new Date()
      const referenceMinutes = isToday ? reference.getHours() * 60 + reference.getMinutes() : 7 * 60
      const lead = isToday ? Math.min(180, container.clientHeight * 0.3) : 30

      container.scrollTop = Math.max(0, referenceMinutes * PX_PER_MIN - lead)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isToday, scrollRequest, selectedDate, snapshot?.generatedAt])

  const closeSheet = useCallback(() => setSheet(null), [])

  function moveDay(offset: number): void {
    setSelectedDate((current) => addDays(current, offset))
    setSheet(null)
    setScrollRequest((current) => current + 1)
  }

  function goToToday(): void {
    setSelectedDate(todayLocalDate())
    setNow(new Date())
    setSheet(null)
    setScrollRequest((current) => current + 1)
  }

  function openFilePicker(): void {
    const input = fileInputRef.current

    if (input === null) return

    input.value = ''
    input.click()
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (file === undefined) return

    setImporting(true)
    setImportError(null)

    try {
      const content = await file.text()
      const imported = parsePhoneSnapshot(content)

      // L'écriture est faite avant de remplacer l'écran : si le stockage est
      // plein, l'ancien instantané reste affiché et l'utilisateur est prévenu.
      savePhoneSnapshot(imported)
      setSnapshot(imported)
      setSelectedDate(todayLocalDate())
      setNow(new Date())
      setSheet(null)
      setScrollRequest((current) => current + 1)
    } catch (caught) {
      setImportError(
        caught instanceof PhoneSnapshotError
          ? caught.message
          : 'L’instantané n’a pas pu être enregistré sur cet iPhone.'
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={styles.app}>
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept="application/json,.json"
        tabIndex={-1}
        aria-label="Choisir un instantané Planner"
        onChange={(event) => void handleFileChange(event)}
      />

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.brand}>Planner</span>

          {snapshot !== null && (
            <div className={styles.headerActions}>
              <button type="button" className={styles.todayButton} onClick={goToToday}>
                Aujourd’hui
              </button>
              <button
                type="button"
                className={styles.updateButton}
                disabled={importing}
                onClick={openFilePicker}
              >
                {importing ? 'Import…' : 'Mettre à jour'}
              </button>
            </div>
          )}
        </div>

        {snapshot !== null && (
          <div className={styles.dateNavigation}>
            <button
              type="button"
              className={styles.navButton}
              aria-label="Jour précédent"
              onClick={() => moveDay(-1)}
            >
              <Icon name="chevronLeft" size={22} />
            </button>

            <div className={styles.dateBlock}>
              <h1 className={styles.dateTitle}>{capitalize(formatDayLabel(selectedDate))}</h1>
              <p className={styles.freshness}>
                Données du {formatPhoneSnapshotMoment(snapshot.generatedAt)}
              </p>
            </div>

            <button
              type="button"
              className={styles.navButton}
              aria-label="Jour suivant"
              onClick={() => moveDay(1)}
            >
              <Icon name="chevronRight" size={22} />
            </button>
          </div>
        )}
      </header>

      {snapshot !== null && stale && (
        <p className={styles.staleBanner} role="status">
          Instantané de plus de 24 heures. Mettez-le à jour depuis le PC.
        </p>
      )}

      {importError !== null && (
        <div className={styles.errorBanner} role="alert">
          <span>{importError}</span>
          <button
            type="button"
            className={styles.errorClose}
            aria-label="Fermer le message"
            onClick={() => setImportError(null)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      {snapshot === null ? (
        <main className={styles.emptyState}>
          <h1 className={styles.emptyTitle}>Aucune donnée sur cet iPhone</h1>
          <p className={styles.emptyText}>
            Exportez l’instantané depuis Planner sur le PC, puis importez le fichier{' '}
            <span className={styles.fileName}>planner-telephone.json</span> ici.
          </p>
          <button type="button" className={styles.importButton} onClick={openFilePicker}>
            Importer un fichier
          </button>
        </main>
      ) : (
        <>
          {selectedDay !== undefined && selectedDay.allDay.length > 0 && (
            <AllDayRow
              items={selectedDay.allDay}
              onOpen={(allDay) => setSheet({ kind: 'allDay', allDay })}
            />
          )}

          <main className={styles.scrollArea} ref={scrollRef}>
            {!insideSnapshot ? (
              <OutOfWindow snapshot={snapshot} />
            ) : selectedDay === undefined ? (
              <p className={styles.emptyDay}>Aucune donnée pour ce jour.</p>
            ) : (
              <Timeline
                day={selectedDay}
                now={now}
                isToday={isToday}
                onOpenBlock={(block) => setSheet({ kind: 'block', block })}
              />
            )}
          </main>
        </>
      )}

      {sheet !== null && <ReadOnlySheet entry={sheet} onClose={closeSheet} />}
    </div>
  )
}

interface AllDayRowProps {
  items: readonly PhoneSnapshotAllDay[]
  onOpen: (item: PhoneSnapshotAllDay) => void
}

function AllDayRow({ items, onOpen }: AllDayRowProps): React.JSX.Element {
  return (
    <div className={styles.allDayRow} role="group" aria-label="Journée entière">
      {items.map((item, index) => {
        const detail = allDayDetailLabel(item)
        const classNames = [
          styles.allDayChip,
          styles[item.typeStyle],
          item.color !== null ? styles.withColor : ''
        ]
          .filter((className) => className !== '')
          .join(' ')

        return (
          <button
            key={`${item.title}-${index}`}
            type="button"
            className={classNames}
            style={entryColorStyle(item.color)}
            onClick={() => onOpen(item)}
          >
            <span className={styles.allDayTitle}>{item.title}</span>
            {detail !== null && <span className={styles.allDayDetail}>{detail}</span>}
          </button>
        )
      })}
    </div>
  )
}

interface TimelineProps {
  day: PhoneSnapshotDay
  now: Date
  isToday: boolean
  onOpenBlock: (block: PhoneSnapshotBlock) => void
}

function Timeline({ day, now, isToday, onOpenBlock }: TimelineProps): React.JSX.Element {
  const entries = useMemo(
    () =>
      day.blocks.map((block, index) => ({
        ...block,
        id: `${day.date}:${index}`,
        durationMin: block.endMin - block.startMin
      })),
    [day]
  )
  const placements = useMemo(() => layoutBlocks(entries), [entries])
  const freeSlots = useMemo(
    () =>
      getFreeSlots(
        entries.map((entry) => ({
          id: entry.id,
          startMin: entry.startMin,
          durationMin: entry.durationMin
        })),
        { minimumDurationMin: MIN_FREE_SLOT_MIN }
      ),
    [entries]
  )
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const timelineStyle = {
    height: `${TIMELINE_HEIGHT_PX}px`,
    '--hour-height': `${HOUR_HEIGHT_PX}px`
  } as CSSProperties

  return (
    <div className={styles.timeline} style={timelineStyle}>
      <div className={styles.hourColumn} aria-hidden="true">
        {Array.from({ length: MINUTES_PER_DAY / 60 }, (_, hour) => (
          <span
            key={hour}
            className={hour === 0 ? styles.firstHourLabel : styles.hourLabel}
            style={{ top: `${hour * HOUR_HEIGHT_PX}px` }}
          >
            {minutesToTime(hour * 60)}
          </span>
        ))}
      </div>

      <div className={styles.dayColumn}>
        {freeSlots.map((slot) => (
          <div
            key={`free-${slot.startMin}`}
            className={styles.freeSlot}
            style={{
              top: `${slot.startMin * PX_PER_MIN}px`,
              height: `${slot.durationMin * PX_PER_MIN}px`
            }}
          >
            <span className={styles.freeSlotLabel}>
              Libre · {formatDurationMinutes(slot.durationMin)}
            </span>
          </div>
        ))}

        {placements.map(({ block, startMin, leftRatio, widthRatio }) => {
          const durationMin = block.endMin - block.startMin
          const mode = getBlockContentMode(durationMin)
          const showCategory =
            showsBlockCategory(durationMin) &&
            block.typeStyle === 'category' &&
            block.categoryName !== null
          const classNames = [
            styles.block,
            styles[block.typeStyle],
            block.color !== null ? styles.withColor : '',
            block.done ? styles.done : '',
            durationMin < 30 ? styles.shortBlock : ''
          ]
            .filter((className) => className !== '')
            .join(' ')
          const style = {
            top: `${startMin * PX_PER_MIN}px`,
            height: `${Math.max(MIN_BLOCK_HEIGHT_PX, durationMin * PX_PER_MIN)}px`,
            left: `calc(${leftRatio * 100}% + 2px)`,
            width: `calc(${widthRatio * 100}% - 4px)`,
            ...entryColorStyle(block.color)
          } as CSSProperties

          return (
            <button
              key={block.id}
              type="button"
              className={classNames}
              style={style}
              aria-label={`Ouvrir ${block.title}, ${blockTimeLabel(block)}${
                block.done ? ', terminée' : ''
              }`}
              onClick={() => onOpenBlock(block)}
            >
              <span className={styles.blockContent}>
                <span className={styles.titleLine}>
                  {block.typeStyle === 'alert' && (
                    <span className={styles.alertDot} aria-hidden="true" />
                  )}
                  <span className={styles.blockTitle}>{block.title}</span>
                  {mode === 'title-and-start' && (
                    <span className={styles.inlineTime}>{minutesToTime(block.startMin)}</span>
                  )}
                </span>

                {mode === 'title-and-range' && (
                  <span className={styles.timeLine}>{blockTimeLabel(block)}</span>
                )}

                {showCategory && <span className={styles.categoryLine}>{block.categoryName}</span>}
              </span>
            </button>
          )
        })}

        {isToday && (
          <div
            className={styles.nowLine}
            style={{ top: `${nowMinutes * PX_PER_MIN}px` }}
            aria-hidden="true"
          >
            <span className={styles.nowDot} />
          </div>
        )}
      </div>
    </div>
  )
}

function OutOfWindow({ snapshot }: { snapshot: PhoneSnapshot }): React.JSX.Element {
  const period = formatPhoneSnapshotPeriod(snapshot.rangeStart, snapshot.rangeEnd)
  const periodSentence = period.endsWith('.') ? period : `${period}.`

  return (
    <div className={styles.outOfWindow} role="status">
      <h2 className={styles.outOfWindowTitle}>Jour hors de l’instantané</h2>
      <p className={styles.outOfWindowText}>
        Cet instantané couvre {periodSentence} Importez un nouvel instantané depuis le PC pour
        afficher ce jour.
      </p>
      <p className={styles.outOfWindowHint}>
        Fenêtre prévue : {PHONE_SNAPSHOT_DAYS_BEFORE} jour avant et {PHONE_SNAPSHOT_DAYS_AFTER}{' '}
        jours après la date d’export.
      </p>
    </div>
  )
}

interface ReadOnlySheetProps {
  entry: SheetEntry
  onClose: () => void
}

function ReadOnlySheet({ entry, onClose }: ReadOnlySheetProps): React.JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const title = entry.kind === 'block' ? entry.block.title : entry.allDay.title
  const typeName = entry.kind === 'block' ? entry.block.typeName : entry.allDay.typeName
  const categoryName = entry.kind === 'block' ? entry.block.categoryName : entry.allDay.categoryName
  const notes = entry.kind === 'block' ? entry.block.notes : entry.allDay.notes
  const done = entry.kind === 'block' && entry.block.done
  const time =
    entry.kind === 'block'
      ? blockTimeLabel(entry.block)
      : (entry.allDay.period ?? 'Journée entière')
  const noteLines = useMemo(() => parseNotes(notes), [notes])

  return (
    <div
      className={styles.sheetOverlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-sheet-title"
      >
        <div className={styles.sheetHeader}>
          <div className={styles.sheetHeading}>
            <p className={styles.sheetType}>
              {typeName}
              {done ? ' · Terminée' : ''}
            </p>
            <h2 className={styles.sheetTitle} id="phone-sheet-title">
              {title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.sheetClose}
            aria-label="Fermer"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <dl className={styles.sheetMeta}>
          <div className={styles.sheetMetaRow}>
            <dt>Horaires</dt>
            <dd>{time}</dd>
          </div>
          <div className={styles.sheetMetaRow}>
            <dt>Catégorie</dt>
            <dd>{categoryName ?? 'Sans catégorie'}</dd>
          </div>
        </dl>

        <section className={styles.sheetNotes} aria-labelledby="phone-sheet-notes">
          <h3 className={styles.sheetNotesTitle} id="phone-sheet-notes">
            Notes
          </h3>
          {noteLines.length === 0 ? (
            <p className={styles.noNotes}>Aucune note.</p>
          ) : (
            <div className={styles.noteLines}>
              {noteLines.map((line, index) =>
                line.type === 'task' ? (
                  <span key={index} className={styles.noteTask}>
                    <input
                      type="checkbox"
                      checked={line.checked}
                      disabled
                      readOnly
                      aria-label={line.text.length > 0 ? line.text : 'Case de note'}
                    />
                    <span className={line.checked ? styles.noteChecked : styles.noteText}>
                      {line.text.length > 0 ? line.text : '\u00a0'}
                    </span>
                  </span>
                ) : (
                  <span key={index} className={styles.noteText}>
                    {line.text.length > 0 ? line.text : '\u00a0'}
                  </span>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
