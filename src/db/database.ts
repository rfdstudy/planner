import Dexie, { type Table } from 'dexie'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  Override,
  Setting,
  Template
} from '../core/types'

export const DATABASE_NAME = 'planner'

/** Version du schéma, également utilisée par les sauvegardes JSON. */
export const DATABASE_VERSION = 1

export class PlannerDatabase extends Dexie {
  readonly categoryGroups!: Table<CategoryGroup, string>
  readonly categories!: Table<Category, string>
  readonly items!: Table<Item, string>
  readonly blocks!: Table<Block, string>
  readonly templates!: Table<Template, string>
  readonly overrides!: Table<Override, string>
  readonly settings!: Table<Setting, string>

  constructor(name: string = DATABASE_NAME) {
    super(name)

    this.version(DATABASE_VERSION).stores({
      categoryGroups: 'id, order',
      categories: 'id, groupId, order, archivedAt',
      items: 'id, kind, categoryId, status, templateId',
      blocks: 'id, date, itemId, [date+startMin]',
      templates: 'id, kind, categoryId, validFrom',
      overrides: 'id, templateId, date, categoryId, [templateId+date]',
      settings: 'id, &key'
    })
  }
}

/** Base de l'application. Les tests créent leur propre instance nommée. */
export const db = new PlannerDatabase()
