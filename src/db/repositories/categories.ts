import type { Category, IsoDateTime } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { BaseRepository, RecordDeletedError, RecordNotFoundError } from './base'

export interface CreateCategoryInput {
  name: string
  color: string
  groupId?: string | null
  order?: number
  archivedAt?: IsoDateTime | null
}

export interface CategoryDeletionResult {
  categoryId: string
  replacementCategoryId: string | null
  reassignedItems: number
  reassignedTemplates: number
  reassignedOverrides: number
}

export class CategoryRepository extends BaseRepository<Category> {
  constructor(private readonly database: PlannerDatabase) {
    super(database.categories, 'Catégorie')
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    return this.insert({
      name: input.name,
      color: input.color,
      groupId: input.groupId ?? null,
      order: input.order ?? 0,
      archivedAt: input.archivedAt ?? null
    })
  }

  /**
   * Supprime logiquement une catégorie et réaffecte, dans la même transaction,
   * tous les éléments qui la référencent : items, modèles et exceptions. Un
   * remplacement `null` signifie « sans catégorie ». Aucun élément n'est perdu.
   */
  async deleteWithReassignment(
    categoryId: string,
    replacementCategoryId: string | null
  ): Promise<CategoryDeletionResult> {
    return this.database.transaction(
      'rw',
      [
        this.database.categories,
        this.database.items,
        this.database.templates,
        this.database.overrides
      ],
      async () => {
        const category = await this.requireActive(categoryId)
        const timestamp = this.nowIso()

        if (replacementCategoryId !== null) {
          if (replacementCategoryId === categoryId) {
            throw new RangeError('Une catégorie ne peut pas être réaffectée à elle-même.')
          }

          const replacement = await this.database.categories.get(replacementCategoryId)

          if (replacement === undefined) {
            throw new RecordNotFoundError('Catégorie de remplacement', replacementCategoryId)
          }

          if (replacement.deletedAt !== null) {
            throw new RecordDeletedError('Catégorie de remplacement', replacementCategoryId)
          }
        }

        const categoryChanges = {
          categoryId: replacementCategoryId,
          updatedAt: timestamp
        }

        const reassignedItems = await this.database.items
          .where('categoryId')
          .equals(categoryId)
          .modify(categoryChanges)
        const reassignedTemplates = await this.database.templates
          .where('categoryId')
          .equals(categoryId)
          .modify(categoryChanges)
        const reassignedOverrides = await this.database.overrides
          .where('categoryId')
          .equals(categoryId)
          .modify(categoryChanges)

        await this.database.categories.put({
          ...category,
          updatedAt: timestamp,
          deletedAt: timestamp
        })

        return {
          categoryId,
          replacementCategoryId,
          reassignedItems,
          reassignedTemplates,
          reassignedOverrides
        }
      }
    )
  }
}
