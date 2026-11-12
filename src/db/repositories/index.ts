import { db, type PlannerDatabase } from '../database'
import { UndoHistory } from '../history'
import { BackupRepository } from './backup'
import { BlockRepository } from './blocks'
import { CategoryGroupRepository } from './categoryGroups'
import { CategoryRepository } from './categories'
import { ElementRepository } from './elements'
import { ItemRepository } from './items'
import { ItemTypeRepository } from './itemTypes'
import { OverrideRepository } from './overrides'
import { PlanningRepository } from './planning'
import { RecurrenceRepository } from './recurrence'
import { SettingRepository } from './settings'
import { TemplateRepository } from './templates'

export interface Repositories {
  categoryGroups: CategoryGroupRepository
  categories: CategoryRepository
  itemTypes: ItemTypeRepository
  items: ItemRepository
  blocks: BlockRepository
  elements: ElementRepository
  planning: PlanningRepository
  templates: TemplateRepository
  overrides: OverrideRepository
  recurrence: RecurrenceRepository
  settings: SettingRepository
  backup: BackupRepository
  history: UndoHistory
}

/** Construit les repositories pour une base donnée (utile aux tests). */
export function createRepositories(
  database: PlannerDatabase,
  history: UndoHistory = new UndoHistory()
): Repositories {
  return {
    categoryGroups: new CategoryGroupRepository(database),
    categories: new CategoryRepository(database),
    itemTypes: new ItemTypeRepository(database),
    items: new ItemRepository(database),
    blocks: new BlockRepository(database.blocks),
    elements: new ElementRepository(database, history),
    planning: new PlanningRepository(database, history),
    templates: new TemplateRepository(database),
    overrides: new OverrideRepository(database.overrides),
    recurrence: new RecurrenceRepository(database),
    settings: new SettingRepository(database.settings),
    backup: new BackupRepository(database),
    history
  }
}

export { RecordDeletedError, RecordNotFoundError } from './base'
export type { EntityData, EntityPatch, ReadOptions } from './base'
export type { BackupData } from './backup'

/** Repositories de la base applicative. */
export const repositories = createRepositories(db)
