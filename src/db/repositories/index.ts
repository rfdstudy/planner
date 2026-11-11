import { db, type PlannerDatabase } from '../database'
import { UndoHistory } from '../history'
import { BlockRepository } from './blocks'
import { CategoryGroupRepository } from './categoryGroups'
import { CategoryRepository } from './categories'
import { ElementRepository } from './elements'
import { ItemRepository } from './items'
import { OverrideRepository } from './overrides'
import { PlanningRepository } from './planning'
import { SettingRepository } from './settings'
import { TemplateRepository } from './templates'

export interface Repositories {
  categoryGroups: CategoryGroupRepository
  categories: CategoryRepository
  items: ItemRepository
  blocks: BlockRepository
  elements: ElementRepository
  planning: PlanningRepository
  templates: TemplateRepository
  overrides: OverrideRepository
  settings: SettingRepository
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
    items: new ItemRepository(database.items),
    blocks: new BlockRepository(database.blocks),
    elements: new ElementRepository(database),
    planning: new PlanningRepository(database, history),
    templates: new TemplateRepository(database.templates),
    overrides: new OverrideRepository(database.overrides),
    settings: new SettingRepository(database.settings),
    history
  }
}

export { RecordDeletedError, RecordNotFoundError } from './base'
export type { EntityData, EntityPatch, ReadOptions } from './base'

/** Repositories de la base applicative. */
export const repositories = createRepositories(db)
