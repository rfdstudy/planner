import type { Table } from 'dexie'
import type { Item, ItemKind, ItemStatus } from '../../core/types'
import { BaseRepository } from './base'

export interface CreateItemInput {
  kind: ItemKind
  title: string
  notes?: string
  categoryId?: string | null
  estimateMin?: number | null
  status?: ItemStatus | null
  templateId?: string | null
}

export class ItemRepository extends BaseRepository<Item> {
  constructor(table: Table<Item, string>) {
    super(table, 'Élément')
  }

  async create(input: CreateItemInput): Promise<Item> {
    return this.insert({
      kind: input.kind,
      title: input.title,
      notes: input.notes ?? '',
      categoryId: input.categoryId ?? null,
      estimateMin: input.estimateMin ?? null,
      status: input.status ?? (input.kind === 'task' ? 'todo' : null),
      templateId: input.templateId ?? null
    })
  }

  /** Coche ou décoche une tâche. Seules les tâches portent un statut. */
  async setTaskStatus(id: string, status: ItemStatus): Promise<Item> {
    const item = await this.requireActive(id)

    if (item.kind !== 'task') {
      throw new RangeError('Seules les tâches peuvent être terminées.')
    }

    return this.update(id, { status })
  }
}
