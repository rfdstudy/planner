import { normalizeBlockEndDate } from '../../core/schedule'
import type { Block, Item, ItemStatus, ItemType, LocalDate } from '../../core/types'
import type { PlannerDatabase } from '../database'
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

  constructor(private readonly database: PlannerDatabase) {
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

  private async requireType(typeId: string): Promise<ItemType> {
    const type = await this.database.itemTypes.get(typeId)

    if (type === undefined) {
      throw new RecordNotFoundError('Type d’élément', typeId)
    }

    return type
  }
}
