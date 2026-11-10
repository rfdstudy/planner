import type { Table } from 'dexie'
import type { CategoryGroup } from '../../core/types'
import { BaseRepository } from './base'

export interface CreateCategoryGroupInput {
  name: string
  order?: number
}

export class CategoryGroupRepository extends BaseRepository<CategoryGroup> {
  constructor(table: Table<CategoryGroup, string>) {
    super(table, 'Groupe de catégories')
  }

  async create(input: CreateCategoryGroupInput): Promise<CategoryGroup> {
    return this.insert({
      name: input.name,
      order: input.order ?? 0
    })
  }
}
