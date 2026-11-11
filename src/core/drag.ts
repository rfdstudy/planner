import { DEFAULT_TASK_DURATION_MIN } from './inbox'
import { MINUTES_PER_DAY, SNAP_MINUTES, clampMinutes, snapMinutes } from './time'

/**
 * Logique pure du glisser-déposer.
 *
 * Aucun accès au DOM : les rectangles de la grille sont mesurés par l'interface
 * et transmis ici sous forme de nombres. Cela permet de tester l'accrochage, le
 * bornage et le choix du jour sans monter un composant React.
 */

/** Distance, en pixels, avant de transformer un clic en glisser. */
export const DRAG_START_DISTANCE_PX = 4

/** Durée minimale d'un bloc redimensionné, alignée sur le pas de la grille. */
export const MIN_RESIZE_DURATION_MIN = SNAP_MINUTES

export interface ColumnBounds {
  left: number
  right: number
}

export interface DragPoint {
  x: number
  y: number
}

export interface DragGeometry {
  /** Bord supérieur actuel de la grille, en coordonnées du viewport. */
  gridTop: number
  pixelsPerMinute: number
  columns: readonly ColumnBounds[]
  /** Bord gauche du panneau « À planifier », s'il est affiché. */
  inboxLeft: number | null
}

export type DragPointZone =
  { zone: 'grid'; dayIndex: number; minute: number } | { zone: 'inbox' } | { zone: 'none' }

/** Index de la colonne qui contient l'abscisse, ou `null` hors de la grille. */
export function findColumnIndex(x: number, columns: readonly ColumnBounds[]): number | null {
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index]

    if (
      x >= column.left &&
      (x < column.right || (index === columns.length - 1 && x <= column.right))
    ) {
      return index
    }
  }

  return null
}

/**
 * Situe un point du pointeur : dans une colonne de jour, au-dessus du panneau
 * « À planifier », ou nulle part. La minute renvoyée est bornée à la journée.
 */
export function resolveDragPoint(point: DragPoint, geometry: DragGeometry): DragPointZone {
  if (geometry.inboxLeft !== null && point.x >= geometry.inboxLeft) {
    return { zone: 'inbox' }
  }

  const dayIndex = findColumnIndex(point.x, geometry.columns)

  if (
    dayIndex === null ||
    !Number.isFinite(geometry.pixelsPerMinute) ||
    geometry.pixelsPerMinute <= 0
  ) {
    return { zone: 'none' }
  }

  return {
    zone: 'grid',
    dayIndex,
    minute: clampMinutes(
      (point.y - geometry.gridTop) / geometry.pixelsPerMinute,
      0,
      MINUTES_PER_DAY
    )
  }
}

/** Ramène une durée dans les bornes d'une journée, en minutes entières. */
export function clampBlockDuration(durationMin: number): number {
  const rounded = Number.isFinite(durationMin) ? Math.round(durationMin) : MIN_RESIZE_DURATION_MIN

  return clampMinutes(rounded, 1, MINUTES_PER_DAY)
}

/**
 * Accroche le début d'un bloc sur le pas de 15 minutes et le maintient dans la
 * journée, en tenant compte de sa durée.
 */
export function clampBlockStart(startMin: number, durationMin: number): number {
  const duration = clampBlockDuration(durationMin)
  const rounded = Number.isFinite(startMin) ? Math.round(startMin) : 0
  const latestStart = Math.max(0, MINUTES_PER_DAY - duration)

  return clampMinutes(snapMinutes(rounded), 0, latestStart)
}

/**
 * Décalage entre le pointeur et le début du bloc au moment de la prise. Il
 * conserve le point saisi sous le doigt et évite un saut visuel au départ.
 */
export function getGrabOffsetMin(
  pointerMin: number,
  blockStartMin: number,
  durationMin: number
): number {
  const duration = clampBlockDuration(durationMin)
  const pointer = Number.isFinite(pointerMin) ? pointerMin : 0
  const start = Number.isFinite(blockStartMin) ? blockStartMin : 0

  return clampMinutes(Math.round(pointer - start), 0, Math.max(0, duration - 1))
}

/** Début d'un bloc déplacé, accroché et borné à la journée. */
export function getMoveStartMin(
  pointerMin: number,
  grabOffsetMin: number,
  durationMin: number
): number {
  const duration = clampBlockDuration(durationMin)
  const pointer = Number.isFinite(pointerMin) ? pointerMin : 0
  const offset = Number.isFinite(grabOffsetMin)
    ? clampMinutes(grabOffsetMin, 0, Math.max(0, duration - 1))
    : 0
  const latestStart = Math.max(0, MINUTES_PER_DAY - duration)

  return clampMinutes(snapMinutes(Math.round(pointer - offset)), 0, latestStart)
}

/**
 * Durée d'un bloc redimensionné par le bas : accrochée sur 15 minutes, au moins
 * 15 minutes (ou moins si le bloc finit déjà la journée), sans dépasser minuit.
 */
export function getResizeDurationMin(blockStartMin: number, pointerMin: number): number {
  const start = clampMinutes(
    Number.isFinite(blockStartMin) ? Math.round(blockStartMin) : 0,
    0,
    MINUTES_PER_DAY - 1
  )
  const maxDuration = MINUTES_PER_DAY - start
  const minDuration = Math.min(MIN_RESIZE_DURATION_MIN, maxDuration)
  const pointer = Number.isFinite(pointerMin) ? pointerMin : start + minDuration
  const snapped = snapMinutes(Math.round(pointer - start))

  return clampMinutes(Math.max(minDuration, snapped), minDuration, maxDuration)
}

/**
 * Durée du bloc créé en glissant une tâche : le temps restant à planifier, ou
 * la durée par défaut quand aucune estimation n'existe.
 */
export function getTaskDragDuration(
  remainingMin: number | null,
  defaultDurationMin: number = DEFAULT_TASK_DURATION_MIN
): number {
  const remaining =
    remainingMin !== null && Number.isFinite(remainingMin) ? Math.round(remainingMin) : 0
  const fallback = Number.isFinite(defaultDurationMin)
    ? Math.round(defaultDurationMin)
    : DEFAULT_TASK_DURATION_MIN
  const candidate = remaining > 0 ? remaining : fallback

  return clampMinutes(candidate > 0 ? candidate : DEFAULT_TASK_DURATION_MIN, 1, MINUTES_PER_DAY)
}
