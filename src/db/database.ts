import Dexie, { type Table } from 'dexie'
import {
  ITEM_TYPES_INITIALIZED_SETTING_KEY,
  createDefaultItemTypes,
  defaultItemTypeIdForKind,
  defaultTemplateTypeIdForKind
} from '../core/itemTypes'
import type {
  Block,
  Category,
  CategoryGroup,
  Item,
  ItemType,
  Override,
  Setting,
  Template
} from '../core/types'

export const DATABASE_NAME = 'planner'

/** Version du schéma, également utilisée par les sauvegardes JSON. */
export const DATABASE_VERSION = 2

/** Version historique, conservée pour la migration des bases existantes. */
export const LEGACY_DATABASE_VERSION = 1

type UpgradeRecord = Record<string, unknown>

export class PlannerDatabase extends Dexie {
  readonly categoryGroups!: Table<CategoryGroup, string>
  readonly categories!: Table<Category, string>
  readonly itemTypes!: Table<ItemType, string>
  readonly items!: Table<Item, string>
  readonly blocks!: Table<Block, string>
  readonly templates!: Table<Template, string>
  readonly overrides!: Table<Override, string>
  readonly settings!: Table<Setting, string>

  constructor(name: string = DATABASE_NAME) {
    super(name)

    // Une base neuve est créée directement à la dernière version : Dexie
    // n'exécute alors pas les fonctions `upgrade`. Ce hook sème les cinq types.
    this.on('populate', (transaction) => {
      const timestamp = new Date().toISOString()
      transaction.table<ItemType, string>('itemTypes').bulkPut(createDefaultItemTypes(timestamp))
      transaction.table<Setting, string>('settings').put({
        id: crypto.randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        key: ITEM_TYPES_INITIALIZED_SETTING_KEY,
        value: true
      })
    })

    this.version(LEGACY_DATABASE_VERSION).stores({
      categoryGroups: 'id, order',
      categories: 'id, groupId, order, archivedAt',
      items: 'id, kind, categoryId, status, templateId',
      blocks: 'id, date, itemId, [date+startMin]',
      templates: 'id, kind, categoryId, validFrom',
      overrides: 'id, templateId, date, categoryId, [templateId+date]',
      settings: 'id, &key'
    })

    this.version(DATABASE_VERSION)
      .stores({
        categoryGroups: 'id, order',
        categories: 'id, groupId, order, archivedAt',
        itemTypes: 'id, order, archivedAt',
        items: 'id, typeId, categoryId, status, templateId',
        blocks: 'id, date, itemId, [date+startMin]',
        templates: 'id, typeId, categoryId, validFrom',
        overrides: 'id, templateId, date, typeId, categoryId, [templateId+date]',
        settings: 'id, &key'
      })
      .upgrade(async (transaction) => {
        const timestamp = new Date().toISOString()
        const itemTypes = transaction.table<ItemType, string>('itemTypes')
        const existingTypes = await itemTypes.toArray()

        if (existingTypes.length === 0) {
          await itemTypes.bulkPut(createDefaultItemTypes(timestamp))
        }

        await transaction
          .table<UpgradeRecord, string>('items')
          .toCollection()
          .modify((item) => {
            if (item.typeId === undefined) {
              const kind = typeof item.kind === 'string' ? item.kind : 'fixed'
              item.typeId = defaultItemTypeIdForKind(kind)
            }

            delete item.kind
          })

        await transaction
          .table<UpgradeRecord, string>('templates')
          .toCollection()
          .modify((template) => {
            if (template.typeId === undefined) {
              const kind = typeof template.kind === 'string' ? template.kind : 'fixed'
              template.typeId = defaultTemplateTypeIdForKind(kind)
            }

            delete template.kind
          })

        // Les exceptions historiques ne portaient pas de type : elles
        // conservent celui du modèle.
        await transaction
          .table<UpgradeRecord, string>('overrides')
          .toCollection()
          .modify((override) => {
            if (override.typeId === undefined) {
              override.typeId = null
            }
          })

        const settings = transaction.table<Setting, string>('settings')
        const marker = await settings
          .where('key')
          .equals(ITEM_TYPES_INITIALIZED_SETTING_KEY)
          .first()

        if (marker === undefined) {
          await settings.put({
            id: crypto.randomUUID(),
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
            key: ITEM_TYPES_INITIALIZED_SETTING_KEY,
            value: true
          })
        }
      })
  }
}

/** Base de l'application. Les tests créent leur propre instance nommée. */
export const db = new PlannerDatabase()
