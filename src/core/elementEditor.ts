import {
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  clampMinutes,
  isLocalDate,
  minutesToTime,
  parsePositiveMinutes,
  snapMinutes,
  timeToMinutes
} from './time'
import type { Block, Item, ItemStatus, ItemType, LocalDate } from './types'

/** Durée proposée pour un nouveau bloc, en minutes. */
export const DEFAULT_ELEMENT_DURATION_MIN = 60

/**
 * Brouillon éditable dans la fenêtre flottante. Les champs numériques et la
 * date restent des chaînes : l'utilisateur peut les vider avant validation.
 */
export interface ElementDraft {
  variant: 'element'
  typeId: string
  /** Comportement recopié du type sélectionné, pour valider sans requête. */
  isTask: boolean
  title: string
  notes: string
  categoryId: string | null
  date: string
  time: string
  /** Bloc sur la ligne du haut, sans heure de début. */
  fullDay: boolean
  durationMin: string
  estimateMin: string
  status: ItemStatus | null
}

/** Valeurs validées, prêtes à être enregistrées par les repositories. */
export interface ElementDraftValues {
  typeId: string
  title: string
  notes: string
  categoryId: string | null
  date: LocalDate
  startMin: number | null
  durationMin: number
  estimateMin: number | null
  status: ItemStatus | null
}

export type ElementDraftValidation =
  { ok: true; values: ElementDraftValues } | { ok: false; message: string }

/**
 * Brouillon d'une tâche encore sans bloc, éditée depuis « À planifier ».
 * Les champs de placement (date, heure, durée du bloc) n'existent pas encore.
 */
export interface TaskDraft {
  variant: 'task'
  title: string
  notes: string
  categoryId: string | null
  estimateMin: string
}

/** Valeurs validées d'une tâche éditée hors de la grille. */
export interface TaskDraftValues {
  title: string
  notes: string
  categoryId: string | null
  estimateMin: number | null
}

export type TaskDraftValidation =
  { ok: true; values: TaskDraftValues } | { ok: false; message: string }

export interface NewElementDraftInput {
  date: LocalDate
  startMin: number
  /** Type sélectionné : il fournit le comportement par défaut. */
  type: ItemType
}

export interface NewElementDraftOptions {
  /** Durée proposée pour une nouvelle tâche, issue des réglages. */
  taskDurationMin?: number
}

/**
 * Accroche le clic sur la grille au pas demandé. Le bloc reste entièrement
 * dans la journée : un clic tardif remonte le début du bloc.
 */
export function snapNewBlockStart(
  clickedMin: number,
  durationMin: number = DEFAULT_ELEMENT_DURATION_MIN,
  step: number = SNAP_MINUTES
): number {
  const safeDuration = Number.isFinite(durationMin)
    ? Math.min(MINUTES_PER_DAY, Math.max(1, Math.round(durationMin)))
    : DEFAULT_ELEMENT_DURATION_MIN
  const rounded = Number.isFinite(clickedMin) ? Math.round(clickedMin) : 0
  const latestStart = Math.max(0, MINUTES_PER_DAY - safeDuration)

  return clampMinutes(snapMinutes(rounded, step), 0, latestStart)
}

/** Brouillon d'un nouvel élément posé à une heure précise. */
export function createNewElementDraft(
  input: NewElementDraftInput,
  options: NewElementDraftOptions = {}
): ElementDraft {
  const safeStartMin = Number.isFinite(input.startMin) ? Math.round(input.startMin) : 0
  const startMin = clampMinutes(safeStartMin, 0, MINUTES_PER_DAY - 1)
  const fullDay = input.type.placement === 'topLine'
  const taskDurationMin =
    options.taskDurationMin !== undefined && Number.isFinite(options.taskDurationMin)
      ? Math.min(MINUTES_PER_DAY, Math.max(1, Math.round(options.taskDurationMin)))
      : DEFAULT_ELEMENT_DURATION_MIN
  const durationMin = input.type.isTask ? taskDurationMin : DEFAULT_ELEMENT_DURATION_MIN

  return {
    variant: 'element',
    typeId: input.type.id,
    isTask: input.type.isTask,
    title: '',
    notes: '',
    categoryId: null,
    date: input.date,
    time: fullDay ? '' : minutesToTime(startMin),
    fullDay,
    durationMin: String(durationMin),
    estimateMin: '',
    status: input.type.isTask ? 'todo' : null
  }
}

/** Brouillon correspondant à un élément et à son bloc déjà enregistrés. */
export function elementDraftFrom(item: Item, block: Block, type: ItemType): ElementDraft {
  const fullDay = block.startMin === null
  const time =
    block.startMin === null
      ? ''
      : minutesToTime(clampMinutes(block.startMin, 0, MINUTES_PER_DAY - 1))

  return {
    variant: 'element',
    typeId: item.typeId,
    isTask: type.isTask,
    title: item.title,
    notes: item.notes,
    categoryId: item.categoryId,
    date: block.date,
    time,
    fullDay,
    durationMin: String(block.durationMin),
    estimateMin: item.estimateMin === null ? '' : String(item.estimateMin),
    status: item.status
  }
}

/**
 * Vérifie le brouillon et renvoie des valeurs normalisées. Une heure est
 * obligatoire sauf lorsque le bloc est placé sur la ligne du haut. La durée
 * estimée et le statut n'existent que pour les types « tâche ».
 */
export function validateElementDraft(draft: ElementDraft): ElementDraftValidation {
  const title = draft.title.trim()

  if (title.length === 0) {
    return { ok: false, message: 'Donnez un titre à l’élément.' }
  }

  if (draft.typeId.trim().length === 0) {
    return { ok: false, message: 'Choisissez un type d’élément.' }
  }

  if (!isLocalDate(draft.date)) {
    return { ok: false, message: 'Choisissez une date valide.' }
  }

  const durationMin = parsePositiveMinutes(draft.durationMin)

  if (durationMin === null || durationMin > MINUTES_PER_DAY) {
    return {
      ok: false,
      message: 'La durée doit être un nombre entier de minutes, entre 1 et 1440.'
    }
  }

  let startMin: number | null = null

  if (!draft.fullDay) {
    const time = draft.time.trim()

    if (time.length === 0) {
      return { ok: false, message: 'Indiquez une heure de début.' }
    }

    try {
      startMin = timeToMinutes(time)
    } catch {
      return { ok: false, message: 'L’heure de début est invalide.' }
    }

    if (startMin >= MINUTES_PER_DAY) {
      return { ok: false, message: 'L’heure de début doit être avant minuit.' }
    }

    if (startMin + durationMin > MINUTES_PER_DAY) {
      return { ok: false, message: 'Le bloc dépasserait minuit.' }
    }
  }

  let estimateMin: number | null = null

  if (draft.isTask && draft.estimateMin.trim().length > 0) {
    estimateMin = parsePositiveMinutes(draft.estimateMin)

    if (estimateMin === null) {
      return {
        ok: false,
        message: 'La durée estimée doit être un nombre entier de minutes.'
      }
    }
  }

  const status: ItemStatus | null = draft.isTask
    ? draft.status === 'done'
      ? 'done'
      : 'todo'
    : null

  return {
    ok: true,
    values: {
      typeId: draft.typeId,
      title,
      notes: draft.notes.trim(),
      categoryId: draft.categoryId,
      date: draft.date,
      startMin,
      durationMin,
      estimateMin,
      status
    }
  }
}

/** Brouillon d'une tâche encore sans bloc, ouverte depuis « À planifier ». */
export function taskDraftFrom(item: Item, type: ItemType): TaskDraft {
  if (!type.isTask) {
    throw new RangeError('Seules les tâches peuvent être éditées depuis « À planifier ».')
  }

  return {
    variant: 'task',
    title: item.title,
    notes: item.notes,
    categoryId: item.categoryId,
    estimateMin: item.estimateMin === null ? '' : String(item.estimateMin)
  }
}

/**
 * Vérifie une tâche éditée hors de la grille. Seuls le titre, la catégorie,
 * les notes et la durée estimée sont modifiables ; aucun bloc n'est créé.
 */
export function validateTaskDraft(draft: TaskDraft): TaskDraftValidation {
  const title = draft.title.trim()

  if (title.length === 0) {
    return { ok: false, message: 'Donnez un titre à la tâche.' }
  }

  let estimateMin: number | null = null

  if (draft.estimateMin.trim().length > 0) {
    estimateMin = parsePositiveMinutes(draft.estimateMin)

    if (estimateMin === null) {
      return {
        ok: false,
        message: 'La durée estimée doit être un nombre entier de minutes.'
      }
    }
  }

  return {
    ok: true,
    values: {
      title,
      notes: draft.notes.trim(),
      categoryId: draft.categoryId,
      estimateMin
    }
  }
}
