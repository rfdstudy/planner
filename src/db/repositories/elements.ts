import {
  duplicableBlockFrom,
  duplicableItemFrom,
  duplicateItemFields,
  resolveDuplicatedBlock,
  type DuplicableBlock,
  type DuplicableItem,
  type DuplicateSource,
  type DuplicateTarget
} from '../../core/duplicate'
import { computeOccurrences } from '../../core/recurrence'
import { normalizeBlockEndDate, type SchedulableBlock } from '../../core/schedule'
import type { Block, Item, ItemStatus, ItemType, LocalDate } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { UndoHistory, type UndoAction } from '../history'
import { RecordNotFoundError } from './base'
import { BlockRepository } from './blocks'
import { ItemRepository } from './items'

/** Champs modifiables d'un élément depuis la fenêtre d'édition. */
export interface ElementItemInput {
  typeId: string
  title: string
  notes: string
  categoryId: string | null
  estimateMin: number | null
  status: ItemStatus | null
}

/** Champs modifiables du bloc posé sur la grille. */
export interface ElementBlockInput {
  date: LocalDate
  startMin: number | null
  durationMin: number
  /** Date de fin inclusive, réservée à la ligne du haut. */
  endDate?: LocalDate | null
}

export interface CreateElementInput {
  item: ElementItemInput
  block: ElementBlockInput
}

export interface UpdateElementInput {
  itemId: string
  blockId: string
  item: ElementItemInput
  block: ElementBlockInput
}

export interface SavedElement {
  item: Item
  block: Block
}

/** Options communes à toutes les formes de duplication. */
export interface DuplicateItemOptions {
  /** Destination d'un collage ; absente pour une duplication classique. */
  target?: DuplicateTarget | null
  /** Pas d'accrochage appliqué à la destination, 15 minutes par défaut. */
  snapStepMin?: number
  /** Durée utilisée pour coller une tâche sans estimation sur la grille. */
  defaultDurationMin?: number
}

/** Copie d'un élément stocké ou d'une occurrence virtuelle de semaine type. */
export type DuplicateItemInput = DuplicateSource & DuplicateItemOptions

export interface DuplicatedElement {
  item: Item
  block: Block | null
  /** Action inverse déjà poussée dans l'historique. */
  action: UndoAction
}

interface ResolvedDuplicateSource {
  item: DuplicableItem
  type: ItemType
  block: DuplicableBlock | null
  blockCount: number
}

/**
 * Vérifie qu'une date de fin ne concerne qu'un élément sans heure, dont le
 * type est placé sur la ligne du haut. Une date égale au début est normalisée
 * en `null` : elle ne crée pas un élément multi-jours artificiel.
 */
function normalizeElementBlock(
  type: ItemType,
  block: ElementBlockInput
): ElementBlockInput & { endDate: LocalDate | null } {
  const endDate = normalizeBlockEndDate(block.date, block.endDate)

  if (endDate !== null) {
    if (type.placement !== 'topLine') {
      throw new RangeError('Une date de fin est réservée aux types de la ligne du haut.')
    }

    if (block.startMin !== null) {
      throw new RangeError('Un élément multi-jours ne peut pas avoir d’heure.')
    }
  }

  return {
    date: block.date,
    startMin: block.startMin,
    durationMin: block.durationMin,
    endDate
  }
}

/**
 * Enregistre ensemble un élément et son bloc. La fenêtre d'édition ne touche
 * jamais la base directement : tout passe par cette couche, dans une même
 * transaction, pour ne jamais laisser un élément sans son bloc.
 */
export class ElementRepository {
  private readonly items: ItemRepository
  private readonly blocks: BlockRepository

  constructor(
    private readonly database: PlannerDatabase,
    private readonly history: UndoHistory = new UndoHistory()
  ) {
    this.items = new ItemRepository(database)
    this.blocks = new BlockRepository(database.blocks)
  }

  async create(input: CreateElementInput): Promise<SavedElement> {
    const type = await this.requireType(input.item.typeId)
    const blockInput = normalizeElementBlock(type, input.block)

    return this.database.transaction(
      'rw',
      [this.database.itemTypes, this.database.items, this.database.blocks],
      async () => {
        const item = await this.items.create(input.item)
        const block = await this.blocks.create({ itemId: item.id, ...blockInput })

        return { item, block }
      }
    )
  }

  async update(input: UpdateElementInput): Promise<SavedElement> {
    const type = await this.requireType(input.item.typeId)
    const blockInput = normalizeElementBlock(type, input.block)

    return this.database.transaction(
      'rw',
      [this.database.itemTypes, this.database.items, this.database.blocks],
      async () => {
        const block = await this.blocks.get(input.blockId)

        if (block === undefined || block.itemId !== input.itemId) {
          throw new RecordNotFoundError('Bloc', input.blockId)
        }

        const item = await this.items.updateDetails(input.itemId, input.item)
        const updatedBlock = await this.blocks.update(input.blockId, blockInput)

        return { item, block: updatedBlock }
      }
    )
  }

  /**
   * Duplique un élément et son bloc dans une transaction unique. La copie est
   * indépendante : nouvel identifiant, aucun `templateId`, statut « à faire »,
   * cases de notes décochées. Un bloc issu d'une tâche à plusieurs blocs donne
   * un nouvel élément doté d'un seul bloc, dont la durée devient l'estimation.
   */
  async duplicateItem(input: DuplicateItemInput): Promise<DuplicatedElement> {
    const duplicated = await this.database.transaction(
      'rw',
      [
        this.database.itemTypes,
        this.database.templates,
        this.database.overrides,
        this.database.items,
        this.database.blocks
      ],
      async () => {
        const source = await this.resolveDuplicateSource(input)
        const target = input.target ?? null
        const blocksOnSourceDay =
          source.block !== null && source.block.startMin !== null && target === null
            ? await this.listOccupiedBlocksOnDay(source.block.date)
            : []
        const item = await this.items.create(
          duplicateItemFields(source.item, source.type, source.block, source.blockCount)
        )
        const blockFields = resolveDuplicatedBlock({
          sourceItem: source.item,
          sourceBlock: source.block,
          isTask: source.type.isTask,
          placement: source.type.placement,
          blocksOnSourceDay,
          target,
          snapStepMin: input.snapStepMin,
          defaultDurationMin: input.defaultDurationMin
        })
        const block =
          blockFields === null
            ? null
            : await this.blocks.create({ itemId: item.id, ...blockFields })

        return { item, block }
      }
    )

    const action: UndoAction = {
      label: 'Duplication d’un élément',
      undo: async () => {
        await this.database.transaction(
          'rw',
          [this.database.items, this.database.blocks],
          async () => {
            if (duplicated.block !== null) {
              await this.blocks.softDelete(duplicated.block.id)
            }

            await this.items.softDelete(duplicated.item.id)
          }
        )
      }
    }

    this.history.push(action)

    return { ...duplicated, action }
  }

  private async resolveDuplicateSource(
    input: DuplicateItemInput
  ): Promise<ResolvedDuplicateSource> {
    if (input.kind === 'snapshot') {
      const type = await this.requireType(input.snapshot.item.typeId)

      return {
        item: input.snapshot.item,
        type,
        block: input.snapshot.block,
        blockCount: input.snapshot.block === null ? 0 : 1
      }
    }

    const item = await this.items.get(input.itemId)

    if (item === undefined) {
      throw new RecordNotFoundError('Élément', input.itemId)
    }

    const type = await this.requireType(item.typeId)
    const blocks = await this.blocks.listByItem(item.id)
    const sourceBlock =
      input.blockId === null || input.blockId === undefined
        ? null
        : blocks.find((block) => block.id === input.blockId)

    if (input.blockId !== null && input.blockId !== undefined && sourceBlock === undefined) {
      throw new RecordNotFoundError('Bloc', input.blockId)
    }

    return {
      item: duplicableItemFrom(item),
      type,
      block:
        sourceBlock === null || sourceBlock === undefined ? null : duplicableBlockFrom(sourceBlock),
      blockCount: blocks.length
    }
  }

  /**
   * Blocs qui occupent réellement la grille un jour donné, y compris les
   * occurrences virtuelles de la semaine type. Les éléments de la ligne du
   * haut n'ont pas d'horaire et ne bloquent aucun créneau.
   */
  private async listOccupiedBlocksOnDay(date: LocalDate): Promise<SchedulableBlock[]> {
    const [blocks, templates, overrides, types] = await Promise.all([
      this.blocks.listByDate(date),
      this.database.templates.toArray(),
      this.database.overrides.toArray(),
      this.database.itemTypes.toArray()
    ])
    const topLineTypeIds = new Set(
      types
        .filter((type) => type.deletedAt === null && type.placement === 'topLine')
        .map((type) => type.id)
    )
    const occurrences = computeOccurrences(
      templates.filter((template) => template.deletedAt === null),
      overrides.filter((override) => override.deletedAt === null),
      { start: date, end: date }
    )

    return [
      ...blocks,
      ...occurrences
        .filter((occurrence) => !topLineTypeIds.has(occurrence.typeId))
        .map((occurrence) => ({
          id: occurrence.id,
          startMin: occurrence.startMin,
          durationMin: occurrence.durationMin
        }))
    ]
  }

  private async requireType(typeId: string): Promise<ItemType> {
    const type = await this.database.itemTypes.get(typeId)

    if (type === undefined) {
      throw new RecordNotFoundError('Type d’élément', typeId)
    }

    return type
  }
}
