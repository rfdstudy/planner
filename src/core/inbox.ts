import { DEFAULT_ELEMENT_DURATION_MIN, validateTaskDraft, type TaskDraft } from './elementEditor'
import type { Block, Category, Item } from './types'

/**
 * Durée affichée pour une tâche sans estimation qui n'a encore aucun bloc.
 * Elle correspond à la durée proposée par défaut pour un nouveau bloc.
 */
export const DEFAULT_TASK_DURATION_MIN = DEFAULT_ELEMENT_DURATION_MIN

/** Tâche encore à planifier, avec sa catégorie et son temps restant. */
export interface InboxTask {
  item: Item
  category: Category | null
  remainingMin: number
}

export interface QuickTaskDraft {
  title: string
  categoryId: string | null
  estimateMin: string
}

export interface QuickTaskValues {
  title: string
  categoryId: string | null
  estimateMin: number | null
}

export type QuickTaskValidation =
  { ok: true; values: QuickTaskValues } | { ok: false; message: string }

type DurableBlock = Pick<Block, 'durationMin'>

/** Somme des durées des blocs, en minutes. */
export function sumPlannedMinutes(blocks: readonly DurableBlock[]): number {
  return blocks.reduce((total, block) => total + Math.max(0, block.durationMin), 0)
}

/**
 * Temps restant à planifier : durée estimée moins la somme des blocs. Sans
 * estimation, la tâche affiche la durée par défaut tant qu'elle n'a aucun bloc.
 */
export function getRemainingTaskMinutes(item: Item, blocks: readonly DurableBlock[]): number {
  if (item.estimateMin === null) {
    return blocks.length === 0 ? DEFAULT_TASK_DURATION_MIN : 0
  }

  return Math.max(0, item.estimateMin - sumPlannedMinutes(blocks))
}

/**
 * Une tâche reste dans « À planifier » tant que ses blocs ne couvrent pas sa
 * durée estimée. Sans estimation, le premier bloc la fait sortir.
 */
export function isTaskInInbox(item: Item, blocks: readonly DurableBlock[]): boolean {
  if (item.kind !== 'task') return false

  if (item.estimateMin === null) {
    return blocks.length === 0
  }

  return sumPlannedMinutes(blocks) < item.estimateMin
}

/**
 * Construit la liste ordonnée des tâches à planifier. Les blocs sont groupés
 * par tâche, quelle que soit leur date, pour tenir compte d'un travail réparti
 * sur plusieurs jours.
 */
export function listInboxTasks(
  items: readonly Item[],
  blocks: readonly Block[],
  categories: readonly Category[]
): InboxTask[] {
  const blocksByItem = new Map<string, Block[]>()

  for (const block of blocks) {
    const itemBlocks = blocksByItem.get(block.itemId)

    if (itemBlocks === undefined) {
      blocksByItem.set(block.itemId, [block])
    } else {
      itemBlocks.push(block)
    }
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  return items
    .filter((item) => isTaskInInbox(item, blocksByItem.get(item.id) ?? []))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((item) => ({
      item,
      category: item.categoryId === null ? null : (categoriesById.get(item.categoryId) ?? null),
      remainingMin: getRemainingTaskMinutes(item, blocksByItem.get(item.id) ?? [])
    }))
}

/** Vérifie le formulaire d'ajout rapide du panneau. */
export function validateQuickTaskDraft(draft: QuickTaskDraft): QuickTaskValidation {
  const taskDraft: TaskDraft = {
    variant: 'task',
    title: draft.title,
    notes: '',
    categoryId: draft.categoryId,
    estimateMin: draft.estimateMin
  }
  const validation = validateTaskDraft(taskDraft)

  if (!validation.ok) return validation

  return {
    ok: true,
    values: {
      title: validation.values.title,
      categoryId: validation.values.categoryId,
      estimateMin: validation.values.estimateMin
    }
  }
}
