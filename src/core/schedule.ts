import { MINUTES_PER_DAY } from './time'

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
