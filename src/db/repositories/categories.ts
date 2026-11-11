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

export interface UpdateCategoryDetailsInput {
  name: string
  color: string
  groupId: string | null
}

export interface CategoryUsage {
  categoryId: string
  items: number
  templates: number
  overrides: number
  total: number
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
    const groupId = input.groupId ?? null
    const order = input.order ?? (await this.nextOrder(groupId))

    return this.insert({
      name: input.name,
      color: input.color,
      groupId,
      order,
      archivedAt: input.archivedAt ?? null
    })
  }

  /** Catégories actives, triées par ordre d'affichage. */
  async listActive(): Promise<Category[]> {
    const categories = await this.list()
    return categories
      .filter((category) => category.archivedAt === null)
      .sort((a, b) => a.order - b.order)
  }

  /** Catégories archivées, de la plus récemment archivée à la plus ancienne. */
  async listArchived(): Promise<Category[]> {
    const categories = await this.list()
    return categories
      .filter((category) => category.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
  }

  /**
   * Modifie le nom, la couleur et le groupe. Un changement de groupe place la
   * catégorie à la fin de son nouveau groupe.
   */
  async updateDetails(id: string, input: UpdateCategoryDetailsInput): Promise<Category> {
    const current = await this.requireActive(id)
    const groupChanged = current.groupId !== input.groupId
    const order = groupChanged ? await this.nextOrder(input.groupId) : current.order

    return this.update(id, {
      name: input.name,
      color: input.color,
      groupId: input.groupId,
      order
    })
  }

  /** Archive une catégorie : elle reste lisible mais n'est plus proposée. */
  async archive(id: string): Promise<Category> {
    return this.update(id, { archivedAt: this.nowIso() })
  }

  /** Réactive une catégorie et la replace à la fin de son groupe. */
  async restore(id: string): Promise<Category> {
    const category = await this.requireActive(id)
    return this.update(id, {
      archivedAt: null,
      order: await this.nextOrder(category.groupId)
    })
  }

  /**
   * Réordonne une liste de catégories. Chaque identifiant reçoit l'ordre de sa
   * position dans le tableau fourni.
   */
  async reorder(orderedIds: readonly string[]): Promise<void> {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new RangeError('La liste de réordonnancement contient un doublon.')
    }

    await this.database.transaction('rw', this.table, async () => {
      const timestamp = this.nowIso()
      const records: Category[] = []

      for (const [order, id] of orderedIds.entries()) {
        const record = await this.requireActive(id)
        records.push({ ...record, order, updatedAt: timestamp })
      }

      await this.table.bulkPut(records)
    })
  }

  /** Compte les éléments, modèles et exceptions qui référencent la catégorie. */
  async getUsage(categoryId: string): Promise<CategoryUsage> {
    const isActive = (record: { deletedAt: string | null }): boolean => record.deletedAt === null

    const [items, templates, overrides] = await Promise.all([
      this.database.items.where('categoryId').equals(categoryId).filter(isActive).count(),
      this.database.templates.where('categoryId').equals(categoryId).filter(isActive).count(),
      this.database.overrides.where('categoryId').equals(categoryId).filter(isActive).count()
    ])

    return {
      categoryId,
      items,
      templates,
      overrides,
      total: items + templates + overrides
    }
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

  /** Prochain ordre disponible parmi les catégories actives d'un groupe. */
  private async nextOrder(groupId: string | null): Promise<number> {
    const categories = await this.list()
    const highestOrder = categories
      .filter((category) => category.groupId === groupId && category.archivedAt === null)
      .reduce((highest, category) => Math.max(highest, category.order), -1)

    return highestOrder + 1
  }
}
