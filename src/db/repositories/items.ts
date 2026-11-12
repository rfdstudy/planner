import type { Item, ItemStatus, ItemType } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { BaseRepository, RecordDeletedError, RecordNotFoundError } from './base'

export interface CreateItemInput {
  typeId: string
  title: string
  notes?: string
  categoryId?: string | null
  estimateMin?: number | null
  status?: ItemStatus | null
  templateId?: string | null
}

export interface UpdateItemDetailsInput {
  typeId: string
  title: string
  notes: string
  categoryId: string | null
  estimateMin: number | null
  status: ItemStatus | null
}

export class ItemRepository extends BaseRepository<Item> {
  constructor(private readonly database: PlannerDatabase) {
    super(database.items, 'Élément')
  }

  async create(input: CreateItemInput): Promise<Item> {
    const type = await this.requireType(input.typeId)

    return this.insert({
      ...this.behaviorValues(type, input),
      typeId: type.id,
      title: input.title,
      notes: input.notes ?? '',
      templateId: input.templateId ?? null
    })
  }

  /** Met à jour un élément depuis la fenêtre d'édition, type compris. */
  async updateDetails(id: string, input: UpdateItemDetailsInput): Promise<Item> {
    const type = await this.requireType(input.typeId)

    return this.update(id, {
      ...this.behaviorValues(type, input),
      typeId: type.id,
      title: input.title,
      notes: input.notes
    })
  }

  /** Coche ou décoche une tâche. Seuls les types « tâche » portent un statut. */
  async setTaskStatus(id: string, status: ItemStatus): Promise<Item> {
    const item = await this.requireActive(id)
    const type = await this.requireType(item.typeId)

    if (!type.isTask) {
      throw new RangeError('Seules les tâches peuvent être terminées.')
    }

    return this.update(id, { status })
  }

  private async requireType(typeId: string): Promise<ItemType> {
    const type = await this.database.itemTypes.get(typeId)

    if (type === undefined) {
      throw new RecordNotFoundError('Type d’élément', typeId)
    }

    if (type.deletedAt !== null) {
      throw new RecordDeletedError('Type d’élément', typeId)
    }

    return type
  }

  private behaviorValues(
    type: ItemType,
    input: {
      categoryId?: string | null
      estimateMin?: number | null
      status?: ItemStatus | null
    }
  ): Pick<Item, 'categoryId' | 'estimateMin' | 'status'> {
    return {
      categoryId: input.categoryId ?? null,
      estimateMin: type.isTask ? (input.estimateMin ?? null) : null,
      status: type.isTask ? (input.status === 'done' ? 'done' : 'todo') : null
    }
  }
}
