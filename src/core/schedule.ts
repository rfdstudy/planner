import { MINUTES_PER_DAY, differenceInCalendarDays, isLocalDate } from './time'
import type { LocalDate } from './types'

/** Forme minimale d'un bloc pour les calculs de la grille. */
export interface SchedulableBlock {
  id: string
  startMin: number | null
  durationMin: number
}

export interface BlockPlacement<T extends SchedulableBlock = SchedulableBlock> {
  block: T
  startMin: number
  endMin: number
  /** Colonne d'affichage, à partir de 0. */
  column: number
  /** Nombre de colonnes du groupe de blocs qui se chevauchent. */
  columnCount: number
  /** Position horizontale relative, entre 0 et 1. */
  leftRatio: number
  /** Largeur relative, entre 0 et 1. */
  widthRatio: number
}

export interface FreeSlot {
  startMin: number
  endMin: number
  durationMin: number
}

/** Nombre maximal de lignes de bandes affichées dans la ligne du haut. */
export const MAX_TOP_LINE_ROWS = 3

/** Forme minimale d'un élément à cheval sur plusieurs jours. */
export interface TopLineBand {
  id: string
  date: LocalDate
  endDate?: LocalDate | null
}

export interface TopLineBandPlacement<T extends TopLineBand = TopLineBand> {
  band: T
  /** Index de la première colonne visible de la semaine. */
  startIndex: number
  /** Index de la dernière colonne visible de la semaine, inclus. */
  endIndex: number
  /** Numéro de ligne d'empilement, à partir de 0. */
  row: number
  /** La bande a commencé avant la période affichée. */
  clippedStart: boolean
  /** La bande se termine après la période affichée. */
  clippedEnd: boolean
}

export interface TopLineLayout<T extends TopLineBand = TopLineBand> {
  /** Toutes les bandes, y compris celles masquées au-delà de trois lignes. */
  bands: TopLineBandPlacement<T>[]
  /** Nombre de lignes nécessaires pour tout afficher. */
  rowCount: number
  /** Nombre de lignes réellement affichées, plafonné à `maxRows`. */
  visibleRowCount: number
  /** Nombre d'éléments masqués derrière le bouton « +N ». */
  hiddenCount: number
}

/**
 * Dernier jour inclus d'un bloc. Les blocs d'un seul jour et les anciennes
 * données sans `endDate` renvoient simplement leur date de début.
 */
export function getBlockEndDate(block: { date: LocalDate; endDate?: LocalDate | null }): LocalDate {
  return block.endDate ?? block.date
}

/** Un élément est multi-jours lorsque sa date de fin est postérieure au début. */
export function isMultiDayBlock(block: { date: LocalDate; endDate?: LocalDate | null }): boolean {
  return getBlockEndDate(block) > block.date
}

/** Vrai si le jour demandé appartient à la période inclusive du bloc. */
export function blockOccursOn(
  block: { date: LocalDate; endDate?: LocalDate | null },
  date: LocalDate
): boolean {
  return date >= block.date && date <= getBlockEndDate(block)
}

/**
 * Normalise une date de fin inclusive. Une date absente ou égale au début
 * devient `null` : un élément d'un seul jour n'a pas besoin de date de fin.
 */
export function normalizeBlockEndDate(
  date: LocalDate,
  endDate: LocalDate | null | undefined
): LocalDate | null {
  if (!isLocalDate(date)) {
    throw new RangeError(`Date locale invalide : ${date}`)
  }

  if (endDate === null || endDate === undefined || endDate.length === 0) {
    return null
  }

  if (!isLocalDate(endDate)) {
    throw new RangeError(`Date locale invalide : ${endDate}`)
  }

  if (endDate < date) {
    throw new RangeError('La date de fin doit être égale ou postérieure à la date de début.')
  }

  return endDate === date ? null : endDate
}

/**
 * Empile les bandes qui se chevauchent sur des lignes séparées et les tronque
 * aux limites de la période affichée. Une bande commence ou finit hors de la
 * période est marquée comme tronquée, pour afficher un chevron dans la vue.
 *
 * Les bandes qui se touchent (l'une finit le mardi, l'autre commence le
 * mercredi) ne se chevauchent pas et peuvent partager une ligne.
 */
export function layoutTopLineBands<T extends TopLineBand>(
  bands: readonly T[],
  days: readonly LocalDate[],
  maxRows: number = MAX_TOP_LINE_ROWS
): TopLineLayout<T> {
  if (days.length === 0) {
    return { bands: [], rowCount: 0, visibleRowCount: 0, hiddenCount: 0 }
  }

  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new RangeError('Le nombre de lignes de la ligne du haut doit être positif.')
  }

  const rangeStart = days[0]
  const rangeEnd = days[days.length - 1]
  const candidates = bands
    .map((band) => {
      const startIndex = Math.max(0, differenceInCalendarDays(rangeStart, band.date))
      const endIndex = Math.min(
        days.length - 1,
        differenceInCalendarDays(rangeStart, getBlockEndDate(band))
      )

      return {
        band,
        startIndex,
        endIndex,
        clippedStart: band.date < rangeStart,
        clippedEnd: getBlockEndDate(band) > rangeEnd
      }
    })
    .filter(({ startIndex, endIndex }) => startIndex <= endIndex)
    .sort(
      (a, b) =>
        a.startIndex - b.startIndex || b.endIndex - a.endIndex || a.band.id.localeCompare(b.band.id)
    )

  const rowEnds: number[] = []
  const placements: TopLineBandPlacement<T>[] = []

  for (const candidate of candidates) {
    let row = rowEnds.findIndex((endIndex) => endIndex < candidate.startIndex)

    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(candidate.endIndex)
    } else {
      rowEnds[row] = candidate.endIndex
    }

    placements.push({ ...candidate, row })
  }

  return {
    bands: placements,
    rowCount: rowEnds.length,
    visibleRowCount: Math.min(rowEnds.length, maxRows),
    hiddenCount: placements.filter((placement) => placement.row >= maxRows).length
  }
}

export interface FreeSlotOptions {
  /** Début de la plage étudiée, inclus. 0 par défaut. */
  dayStartMin?: number
  /** Fin de la plage étudiée, exclue. 1440 par défaut. */
  dayEndMin?: number
  /** Durée minimale d'un créneau retourné. 1 minute par défaut. */
  minimumDurationMin?: number
}

/** Contenu affichable dans un bloc selon sa hauteur (document 3). */
export type BlockContentMode = 'title' | 'title-and-start' | 'title-and-range'

/**
 * Niveau de détail du contenu d'un bloc : titre seul sous 30 minutes, heure de
 * début de 30 à 59 minutes, puis plage horaire complète dès 60 minutes.
 */
export function getBlockContentMode(durationMin: number): BlockContentMode {
  if (durationMin < 30) return 'title'
  if (durationMin < 60) return 'title-and-start'

  return 'title-and-range'
}

/** La catégorie n'apparaît qu'au-delà de 90 minutes (document 3). */
export function showsBlockCategory(durationMin: number): boolean {
  return durationMin > 90
}

type TimedBlock<T extends SchedulableBlock> = T & { startMin: number }

function endOf(block: TimedBlock<SchedulableBlock>): number {
  return block.startMin + block.durationMin
}

function compareBlocks(a: SchedulableBlock, b: SchedulableBlock): number {
  const startDifference = (a.startMin ?? 0) - (b.startMin ?? 0)
  if (startDifference !== 0) return startDifference

  const endDifference = (a.startMin ?? 0) + a.durationMin - ((b.startMin ?? 0) + b.durationMin)
  if (endDifference !== 0) return endDifference

  return a.id.localeCompare(b.id)
}

/**
 * Place côte à côte les blocs qui se chevauchent.
 *
 * Deux blocs qui se touchent (l'un finit à 10:00, l'autre commence à 10:00) ne
 * se chevauchent pas : ils gardent toute la largeur. Les blocs sans heure de
 * début (épreuves sur la ligne du haut) et les durées non positives sont
 * ignorés. Le résultat est trié par début puis par fin.
 */
export function layoutBlocks<T extends SchedulableBlock>(
  blocks: readonly T[]
): BlockPlacement<T>[] {
  const timedBlocks = blocks
    .filter((block): block is TimedBlock<T> => block.startMin !== null && block.durationMin > 0)
    .sort(compareBlocks)

  const clusters: TimedBlock<T>[][] = []
  let currentCluster: TimedBlock<T>[] = []
  let currentClusterEnd = -Infinity

  for (const block of timedBlocks) {
    if (currentCluster.length > 0 && block.startMin >= currentClusterEnd) {
      clusters.push(currentCluster)
      currentCluster = []
      currentClusterEnd = -Infinity
    }

    currentCluster.push(block)
    currentClusterEnd = Math.max(currentClusterEnd, endOf(block))
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  const placements: BlockPlacement<T>[] = []

  for (const cluster of clusters) {
    const columnEnds: number[] = []
    const clusterPlacements: Array<{
      block: TimedBlock<T>
      column: number
    }> = []

    for (const block of cluster) {
      let column = columnEnds.findIndex((columnEnd) => columnEnd <= block.startMin)

      if (column === -1) {
        column = columnEnds.length
        columnEnds.push(endOf(block))
      } else {
        columnEnds[column] = endOf(block)
      }

      clusterPlacements.push({ block, column })
    }

    const columnCount = columnEnds.length

    for (const { block, column } of clusterPlacements) {
      placements.push({
        block,
        startMin: block.startMin,
        endMin: endOf(block),
        column,
        columnCount,
        leftRatio: column / columnCount,
        widthRatio: 1 / columnCount
      })
    }
  }

  return placements
}

/**
 * Calcule les intervalles libres d'une journée à partir de tous les blocs,
 * quels que soient leurs types. Les blocs sans heure de début ne comptent pas
 * comme occupés dans la grille horaire.
 */
export function getFreeSlots(
  blocks: readonly SchedulableBlock[],
  options: FreeSlotOptions = {}
): FreeSlot[] {
  const dayStartMin = options.dayStartMin ?? 0
  const dayEndMin = options.dayEndMin ?? MINUTES_PER_DAY
  const minimumDurationMin = options.minimumDurationMin ?? 1

  if (
    !Number.isInteger(dayStartMin) ||
    !Number.isInteger(dayEndMin) ||
    dayStartMin < 0 ||
    dayEndMin > MINUTES_PER_DAY ||
    dayStartMin >= dayEndMin
  ) {
    throw new RangeError('Plage horaire invalide.')
  }

  if (!Number.isInteger(minimumDurationMin) || minimumDurationMin < 0) {
    throw new RangeError('Durée minimale invalide.')
  }

  const occupied = blocks
    .filter(
      (block): block is TimedBlock<SchedulableBlock> =>
        block.startMin !== null && block.durationMin > 0
    )
    .map((block) => ({
      startMin: Math.max(dayStartMin, block.startMin),
      endMin: Math.min(dayEndMin, endOf(block))
    }))
    .filter((interval) => interval.endMin > interval.startMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  const slots: FreeSlot[] = []

  const addSlot = (startMin: number, endMin: number): void => {
    const durationMin = endMin - startMin

    if (durationMin > 0 && durationMin >= minimumDurationMin) {
      slots.push({ startMin, endMin, durationMin })
    }
  }

  let cursor = dayStartMin

  for (const interval of occupied) {
    if (interval.startMin > cursor) {
      addSlot(cursor, interval.startMin)
    }

    cursor = Math.max(cursor, interval.endMin)

    if (cursor >= dayEndMin) break
  }

  if (cursor < dayEndMin) {
    addSlot(cursor, dayEndMin)
  }

  return slots
}
