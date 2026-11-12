import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  ItemType,
  Override,
  Setting,
  Template
} from '../../core/types'
import type { PlannerDatabase } from '../database'

/** Contenu complet d'une sauvegarde, table par table. */
export interface BackupData {
  categoryGroups: CategoryGroup[]
  categories: Category[]
  itemTypes: ItemType[]
  items: Item[]
  blocks: Block[]
  templates: Template[]
  overrides: Override[]
  settings: Setting[]
}

/**
 * Remplacement atomique de toutes les tables lors d'un import. Cette opération
 * est volontairement isolée dans un repository : aucun composant ne touche
 * directement à la base.
 */
export class BackupRepository {
  constructor(private readonly database: PlannerDatabase) {}

  async replaceAll(data: BackupData): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.categoryGroups,
        this.database.categories,
        this.database.itemTypes,
        this.database.items,
        this.database.blocks,
        this.database.templates,
        this.database.overrides,
        this.database.settings
      ],
      async () => {
        await this.database.categoryGroups.clear()
        await this.database.categories.clear()
        await this.database.itemTypes.clear()
        await this.database.items.clear()
        await this.database.blocks.clear()
        await this.database.templates.clear()
        await this.database.overrides.clear()
        await this.database.settings.clear()

        await this.database.categoryGroups.bulkPut(data.categoryGroups)
        await this.database.categories.bulkPut(data.categories)
        await this.database.itemTypes.bulkPut(data.itemTypes)
        await this.database.items.bulkPut(data.items)
        await this.database.blocks.bulkPut(data.blocks)
        await this.database.templates.bulkPut(data.templates)
        await this.database.overrides.bulkPut(data.overrides)
        await this.database.settings.bulkPut(data.settings)
      }
    )
  }
}
