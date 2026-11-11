import type { Block, Item, ItemKind, ItemStatus, LocalDate } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { RecordNotFoundError } from './base'
import { BlockRepository } from './blocks'
import { ItemRepository } from './items'

/** Champs modifiables d'un élément depuis la fenêtre d'édition. */
export interface ElementItemInput {
  kind: ItemKind
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
 * Enregistre ensemble un élément et son bloc. La fenêtre d'édition ne touche
 * jamais la base directement : tout passe par cette couche, dans une même
 * transaction, pour ne jamais laisser un élément sans son bloc.
 */
export class ElementRepository {
  private readonly items: ItemRepository
  private readonly blocks: BlockRepository

  constructor(private readonly database: PlannerDatabase) {
    this.items = new ItemRepository(database.items)
    this.blocks = new BlockRepository(database.blocks)
  }

  async create(input: CreateElementInput): Promise<SavedElement> {
    return this.database.transaction(
      'rw',
      [this.database.items, this.database.blocks],
      async () => {
        const item = await this.items.create(input.item)
        const block = await this.blocks.create({ itemId: item.id, ...input.block })

        return { item, block }
      }
    )
  }

  async update(input: UpdateElementInput): Promise<SavedElement> {
    return this.database.transaction(
      'rw',
      [this.database.items, this.database.blocks],
      async () => {
        const block = await this.blocks.get(input.blockId)

        if (block === undefined || block.itemId !== input.itemId) {
          throw new RecordNotFoundError('Bloc', input.blockId)
        }

        const item = await this.items.update(input.itemId, input.item)
        const updatedBlock = await this.blocks.update(input.blockId, input.block)

        return { item, block: updatedBlock }
      }
    )
  }
}
