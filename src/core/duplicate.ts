import { DEFAULT_ELEMENT_DURATION_MIN } from './elementEditor'
import { uncheckNotesTaskLines } from './notes'
import { getFreeSlots, type SchedulableBlock } from './schedule'
import {
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  addDays,
  clampMinutes,
  differenceInCalendarDays,
  isLocalDate,
  snapMinutes
} from './time'
import type { Block, Item, ItemStatus, ItemType, ItemTypePlacement, LocalDate } from './types'

/**
 * Valeurs d'un élément copiables sans ses identifiants techniques. Le
 * `templateId` est volontairement absent : une copie est toujours autonome.
 */
export interface DuplicableItem {
  typeId: string
  title: string
  notes: string
  categoryId: string | null
  estimateMin: number | null
}

/** Position et durée d'un bloc copiées telles quelles. */
export interface DuplicableBlock {
  date: LocalDate
  startMin: number | null
  durationMin: number
  endDate: LocalDate | null
}

/** Instantané utilisé par le presse-papiers interne et les occurrences virtuelles. */
export interface DuplicateSnapshot {
  item: DuplicableItem
  block: DuplicableBlock | null
}

/** Élément à recopier : ligne stockée ou occurrence virtuelle de semaine type. */
export type DuplicateSource =
  | { kind: 'stored'; itemId: string; blockId?: string | null }
  | { kind: 'snapshot'; snapshot: DuplicateSnapshot }

/** Destination imposée par un collage sur la grille. */
export interface DuplicateTarget {
  date: LocalDate
  startMin: number
}

export interface DuplicatedItemFields {
  typeId: string
  title: string
  notes: string
  categoryId: string | null
  estimateMin: number | null
  status: ItemStatus | null
}

export interface DuplicateBlockFields {
  date: LocalDate
  startMin: number | null
  durationMin: number
  endDate: LocalDate | null
}

export interface ResolveDuplicateBlockOptions {
  sourceItem: DuplicableItem
  sourceBlock: DuplicableBlock | null
  isTask: boolean
  placement: ItemTypePlacement
  /** Blocs actifs du jour du bloc source, y compris ce bloc. */
  blocksOnSourceDay?: readonly SchedulableBlock[]
  /** Destination explicite d'un collage ; absent pour une duplication. */
  target?: DuplicateTarget | null
  snapStepMin?: number
  defaultDurationMin?: number
}

/** Transforme un élément stocké en instantané copiable. */
export function duplicableItemFrom(item: Item): DuplicableItem {
  return {
    typeId: item.typeId,
    title: item.title,
    notes: item.notes ?? '',
    categoryId: item.categoryId,
    estimateMin: item.estimateMin
  }
}

/** Transforme un bloc stocké en bloc copiable. */
export function duplicableBlockFrom(block: Block): DuplicableBlock {
  return {
    date: block.date,
    startMin: block.startMin,
    durationMin: block.durationMin,
    endDate: block.endDate ?? null
  }
}

/** Instantané d'une occurrence virtuelle ou d'un élément stocké. */
export function createDuplicateSnapshot(item: Item, block: Block | null): DuplicateSnapshot {
  return {
    item: duplicableItemFrom(item),
    block: block === null ? null : duplicableBlockFrom(block)
  }
}

/**
 * Prépare les champs de l'élément copié. La copie repart « à faire » et ses
 * cases de notes sont décochées. Si l'original possède plusieurs blocs, seule
 * la durée du bloc copié devient la durée estimée du nouvel élément.
 */
export function duplicateItemFields(
  source: DuplicableItem,
  type: Pick<ItemType, 'isTask'>,
  sourceBlock: DuplicableBlock | null,
  sourceBlockCount: number
): DuplicatedItemFields {
  const isTask = type.isTask
  const estimateMin = !isTask
    ? null
    : sourceBlock !== null && sourceBlockCount > 1
      ? sourceBlock.durationMin
      : source.estimateMin

  return {
    typeId: source.typeId,
    title: source.title,
    notes: uncheckNotesTaskLines(source.notes ?? ''),
    categoryId: source.categoryId,
    estimateMin,
    status: isTask ? 'todo' : null
  }
}

function clampDuration(durationMin: number | null | undefined, fallback: number): number {
  const candidate =
    durationMin !== null && durationMin !== undefined && Number.isFinite(durationMin)
      ? Math.round(durationMin)
      : fallback

  return clampMinutes(candidate > 0 ? candidate : fallback, 1, MINUTES_PER_DAY)
}

function clampStart(startMin: number, durationMin: number, step: number): number {
  const duration = clampDuration(durationMin, DEFAULT_ELEMENT_DURATION_MIN)
  const latestStart = Math.max(0, MINUTES_PER_DAY - duration)
  const rounded = Number.isFinite(startMin) ? Math.round(startMin) : 0

  return clampMinutes(snapMinutes(rounded, step), 0, latestStart)
}

/**
 * Calcule le bloc de la copie.
 *
 * - Un collage sur la grille utilise la destination demandée.
 * - Une duplication cherche le premier créneau libre après l'original dans la
 *   même journée. Une tâche sans place repart dans « À planifier » ; les autres
 *   types restent au même horaire pour s'afficher côte à côte.
 * - Un élément de la ligne du haut conserve sa longueur en jours.
 */
export function resolveDuplicatedBlock(
  options: ResolveDuplicateBlockOptions
): DuplicateBlockFields | null {
  const {
    sourceItem,
    sourceBlock,
    isTask,
    placement,
    blocksOnSourceDay = [],
    target = null,
    snapStepMin = SNAP_MINUTES,
    defaultDurationMin = DEFAULT_ELEMENT_DURATION_MIN
  } = options

  if (target !== null && !isLocalDate(target.date)) {
    throw new RangeError(`Date locale invalide : ${target.date}`)
  }

  if (sourceBlock === null) {
    if (target === null) return null

    if (placement === 'topLine') {
      return {
        date: target.date,
        startMin: null,
        durationMin: clampDuration(sourceItem.estimateMin, defaultDurationMin),
        endDate: null
      }
    }

    const durationMin = clampDuration(sourceItem.estimateMin, defaultDurationMin)

    return {
      date: target.date,
      startMin: clampStart(target.startMin, durationMin, snapStepMin),
      durationMin,
      endDate: null
    }
  }

  const endDate = sourceBlock.endDate ?? null

  if (sourceBlock.startMin === null) {
    if (target === null) {
      return {
        date: sourceBlock.date,
        startMin: null,
        durationMin: sourceBlock.durationMin,
        endDate
      }
    }

    const lengthDays = differenceInCalendarDays(sourceBlock.date, endDate ?? sourceBlock.date) + 1

    return {
      date: target.date,
      startMin: null,
      durationMin: sourceBlock.durationMin,
      endDate: lengthDays > 1 ? addDays(target.date, lengthDays - 1) : null
    }
  }

  const durationMin = clampDuration(sourceBlock.durationMin, defaultDurationMin)

  if (target !== null) {
    return {
      date: target.date,
      startMin: clampStart(target.startMin, durationMin, snapStepMin),
      durationMin,
      endDate: null
    }
  }

  const sourceEndMin = sourceBlock.startMin + durationMin
  const freeSlot = getFreeSlots(blocksOnSourceDay)
    .filter((slot) => slot.startMin >= sourceEndMin && slot.durationMin >= durationMin)
    .sort((a, b) => a.startMin - b.startMin)[0]

  if (freeSlot !== undefined) {
    return {
      date: sourceBlock.date,
      startMin: freeSlot.startMin,
      durationMin,
      endDate: null
    }
  }

  if (isTask) return null

  return {
    date: sourceBlock.date,
    startMin: sourceBlock.startMin,
    durationMin,
    endDate: null
  }
}
