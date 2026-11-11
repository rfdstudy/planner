import type { CategoryGroup } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { BaseRepository } from './base'

export interface CreateCategoryGroupInput {
  name: string
  order?: number
}

export class CategoryGroupRepository extends BaseRepository<CategoryGroup> {
  constructor(private readonly database: PlannerDatabase) {
    super(database.categoryGroups, 'Groupe de catégories')
  }

  async create(input: CreateCategoryGroupInput): Promise<CategoryGroup> {
    return this.insert({
      name: input.name,
      order: input.order ?? (await this.nextOrder())
    })
  }

  /** Réordonne les groupes ; l'ordre suit la position dans le tableau fourni. */
  async reorder(orderedIds: readonly string[]): Promise<void> {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new RangeError('La liste de réordonnancement contient un doublon.')
    }

    await this.database.transaction('rw', this.table, async () => {
      const timestamp = this.nowIso()
      const records: CategoryGroup[] = []

      for (const [order, id] of orderedIds.entries()) {
        const record = await this.requireActive(id)
        records.push({ ...record, order, updatedAt: timestamp })
      }

      await this.table.bulkPut(records)
    })
  }

  /**
   * Supprime un groupe sans perdre ses catégories : elles sont conservées et
   * deviennent « sans groupe ». Retourne le nombre de catégories concernées.
   */
  async deleteWithCategoryUnassignment(groupId: string): Promise<number> {
    return this.database.transaction(
      'rw',
      [this.database.categoryGroups, this.database.categories],
      async () => {
        const group = await this.requireActive(groupId)
        const timestamp = this.nowIso()

        const reassignedCategories = await this.database.categories
          .where('groupId')
          .equals(groupId)
          .modify({ groupId: null, updatedAt: timestamp })

        await this.database.categoryGroups.put({
          ...group,
          updatedAt: timestamp,
          deletedAt: timestamp
        })

        return reassignedCategories
      }
    )
  }

  private async nextOrder(): Promise<number> {
    const groups = await this.list()
    const highestOrder = groups.reduce((highest, group) => Math.max(highest, group.order), -1)

    return highestOrder + 1
  }
}
