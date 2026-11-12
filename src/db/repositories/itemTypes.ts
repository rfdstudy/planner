import {
  createDefaultItemTypes,
  normalizeItemTypeDetails,
  type ItemTypeDetailsInput
} from '../../core/itemTypes'
import type { IsoDateTime, ItemType } from '../../core/types'
import type { PlannerDatabase } from '../database'
import { BaseRepository, RecordDeletedError, RecordNotFoundError } from './base'

export interface CreateItemTypeInput extends ItemTypeDetailsInput {
  order?: number
  archivedAt?: IsoDateTime | null
}

export type UpdateItemTypeDetailsInput = ItemTypeDetailsInput

export interface ItemTypeUsage {
  typeId: string
  items: number
  templates: number
  overrides: number
  total: number
}

export interface ItemTypeDeletionResult {
  typeId: string
  replacementTypeId: string | null
  reassignedItems: number
  reassignedTemplates: number
  reassignedOverrides: number
}

export class ItemTypeRepository extends BaseRepository<ItemType> {
  constructor(private readonly database: PlannerDatabase) {
    super(database.itemTypes, 'Type d’élément')
  }

  async create(input: CreateItemTypeInput): Promise<ItemType> {
    const details = normalizeItemTypeDetails(input)

    return this.insert({
      ...details,
      order: input.order ?? (await this.nextOrder()),
      archivedAt: input.archivedAt ?? null
    })
  }

  /**
   * Crée les cinq types de départ si la table est entièrement vide. Les types
   * supprimés par l'utilisateur ne sont jamais recréés.
   */
  async ensureDefaults(): Promise<void> {
    const existing = await this.list({ includeDeleted: true })

    if (existing.length > 0) return

    await this.table.bulkPut(createDefaultItemTypes())
  }

  /** Types actifs, triés par ordre d'affichage. */
  async listActive(): Promise<ItemType[]> {
    const types = await this.list()
    return types
      .filter((type) => type.archivedAt === null)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'))
  }

  /** Types archivés, du plus récemment archivé au plus ancien. */
  async listArchived(): Promise<ItemType[]> {
    const types = await this.list()
    return types
      .filter((type) => type.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
  }

  /**
   * Modifie les propriétés d'un type. La grille lit ces propriétés en direct :
   * le changement s'applique donc immédiatement à tous ses éléments.
   */
  async updateDetails(id: string, input: UpdateItemTypeDetailsInput): Promise<ItemType> {
    const current = await this.requireActive(id)
    const details = normalizeItemTypeDetails(input)

    return this.update(id, {
      ...details,
      order: current.order
    })
  }

  /** Archive un type : il reste lisible mais n'est plus proposé. */
  async archive(id: string): Promise<ItemType> {
    return this.update(id, { archivedAt: this.nowIso() })
  }

  /** Réactive un type et le replace à la fin de la liste. */
  async restore(id: string): Promise<ItemType> {
    return this.update(id, {
      archivedAt: null,
      order: await this.nextOrder()
    })
  }

  /** Réordonne une liste de types selon les positions fournies. */
  async reorder(orderedIds: readonly string[]): Promise<void> {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new RangeError('La liste de réordonnancement contient un doublon.')
    }

    await this.database.transaction('rw', this.table, async () => {
      const timestamp = this.nowIso()
      const records: ItemType[] = []

      for (const [order, id] of orderedIds.entries()) {
        const record = await this.requireActive(id)
        records.push({ ...record, order, updatedAt: timestamp })
      }

      await this.table.bulkPut(records)
    })
  }

  /** Compte les éléments, modèles et exceptions qui référencent le type. */
  async getUsage(typeId: string): Promise<ItemTypeUsage> {
    const isActive = (record: { deletedAt: string | null }): boolean => record.deletedAt === null

    const [items, templates, overrides] = await Promise.all([
      this.database.items.where('typeId').equals(typeId).filter(isActive).count(),
      this.database.templates.where('typeId').equals(typeId).filter(isActive).count(),
      this.database.overrides.where('typeId').equals(typeId).filter(isActive).count()
    ])

    return {
      typeId,
      items,
      templates,
      overrides,
      total: items + templates + overrides
    }
  }

  /**
   * Supprime logiquement un type. S'il est utilisé, un type de remplacement
   * est obligatoire : items, modèles et exceptions sont réaffectés dans la
   * même transaction. Aucun élément n'est perdu.
   */
  async deleteWithReassignment(
    typeId: string,
    replacementTypeId: string | null
  ): Promise<ItemTypeDeletionResult> {
    return this.database.transaction(
      'rw',
      [
        this.database.itemTypes,
        this.database.items,
        this.database.templates,
        this.database.overrides
      ],
      async () => {
        const type = await this.requireActive(typeId)
        const usage = await this.getUsage(typeId)
        const timestamp = this.nowIso()

        if (usage.total > 0 && replacementTypeId === null) {
          throw new RangeError('Choisissez le type qui remplace ses éléments.')
        }

        if (replacementTypeId !== null) {
          if (replacementTypeId === typeId) {
            throw new RangeError('Un type ne peut pas être réaffecté à lui-même.')
          }

          const replacement = await this.database.itemTypes.get(replacementTypeId)

          if (replacement === undefined) {
            throw new RecordNotFoundError('Type de remplacement', replacementTypeId)
          }

          if (replacement.deletedAt !== null) {
            throw new RecordDeletedError('Type de remplacement', replacementTypeId)
          }
        }

        const changes = {
          typeId: replacementTypeId ?? typeId,
          updatedAt: timestamp
        }

        const reassignedItems =
          replacementTypeId === null
            ? 0
            : await this.database.items.where('typeId').equals(typeId).modify(changes)
        const reassignedTemplates =
          replacementTypeId === null
            ? 0
            : await this.database.templates.where('typeId').equals(typeId).modify(changes)
        const reassignedOverrides =
          replacementTypeId === null
            ? 0
            : await this.database.overrides.where('typeId').equals(typeId).modify(changes)

        await this.database.itemTypes.put({
          ...type,
          updatedAt: timestamp,
          deletedAt: timestamp
        })

        return {
          typeId,
          replacementTypeId,
          reassignedItems,
          reassignedTemplates,
          reassignedOverrides
        }
      }
    )
  }

  /** Prochain ordre disponible parmi les types actifs. */
  private async nextOrder(): Promise<number> {
    const types = await this.list()
    const highestOrder = types
      .filter((type) => type.archivedAt === null)
      .reduce((highest, type) => Math.max(highest, type.order), -1)

    return highestOrder + 1
  }
}
